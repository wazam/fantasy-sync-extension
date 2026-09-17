let queue = [];
let index = 0;
let prevIndex = 0;
const seenKeys    = new Set();
const excludedKeys = new Set();
let upperCutoff = null; // "YYYY-MM-DD HH:MM" or null
let batchSeq = 0; // fallback counter for sources that don't supply a page number (e.g. draft.js)

// Transactions already imported to Fantrax, keyed by txKey() and persisted across
// reloads, so a rescrape (even a partial one that doesn't go all the way back)
// never re-queues something already processed.
let processedKeys = new Set();
browser.storage.local.get("processedKeys").then(res => {
  if (Array.isArray(res.processedKeys)) processedKeys = new Set(res.processedKeys);
});

// Full-detail record of everything ever processed, for the Processed History
// view, separate from processedKeys (which is just a dedup fingerprint) since
// this needs the actual player/team/date info to render like a normal queue row.
let processedTxLog = [];
browser.storage.local.get("processedTxLog").then(res => {
  if (Array.isArray(res.processedTxLog)) processedTxLog = res.processedTxLog;
});

function markProcessed(tx) {
  if (!tx) return;
  const key = txKey(tx);
  if (processedKeys.has(key)) return;
  processedKeys.add(key);
  processedTxLog.push(tx);
  browser.storage.local.set({ processedKeys: [...processedKeys], processedTxLog });
}

// Lightweight log of every real add/drop/trade ever scraped (name/team/date),
// independent of processedKeys, kept even after a transaction leaves the queue,
// so Manager Stats (most dropped/added, most trades, activity-by-hour) survives
// reloads and rescrapes. Draft picks are excluded (see recordTxHistory for why);
// trades are excluded from activity-by-hour specifically, not from the log itself.
let txHistory = [];
const txHistoryKeys = new Set();
browser.storage.local.get("txHistory").then(res => {
  if (Array.isArray(res.txHistory)) {
    txHistory = res.txHistory;
    txHistory.forEach(e => txHistoryKeys.add(e.key));
  }
});

function recordTxHistory(tx) {
  // Draft picks all land at once whenever the commissioner scheduled the
  // draft, not at a manager's own chosen time, so they're excluded entirely.
  if (!tx.date || tx.type === "DRFT") return;

  const baseKey = txKey(tx);
  let changed = false;

  // Trades are timestamped when the commissioner approves them, not when a
  // manager actually proposed the move, so this timestamp is unreliable for
  // Activity by Hour (which explicitly ignores dir: "TRADE" entries), but
  // it's perfectly fine for a simple per-team trade count, which is all
  // "Most Trades" needs.
  if (tx.type === "TRADE") {
    (tx.teams || []).forEach(team => {
      const key = `${baseKey}|TRADE|${team}`;
      if (!txHistoryKeys.has(key)) {
        txHistoryKeys.add(key);
        txHistory.push({ key, dir: "TRADE", name: "", team, date: tx.date });
        changed = true;
      }
    });
    if (changed) browser.storage.local.set({ txHistory });
    return;
  }

  if (tx.add) {
    const key = `${baseKey}|ADD`;
    if (!txHistoryKeys.has(key)) {
      txHistoryKeys.add(key);
      txHistory.push({ key, dir: "ADD", name: `${tx.add.first} ${tx.add.last}`.trim(), team: tx.team || "", date: tx.date });
      changed = true;
    }
  }
  if (tx.drop) {
    const key = `${baseKey}|DROP`;
    if (!txHistoryKeys.has(key)) {
      txHistoryKeys.add(key);
      txHistory.push({ key, dir: "DROP", name: `${tx.drop.first} ${tx.drop.last}`.trim(), team: tx.team || "", date: tx.date });
      changed = true;
    }
  }

  if (changed) browser.storage.local.set({ txHistory });
}

// Lightweight log of manual "Roster Update" rows (a manager moving players
// within their own roster, no add/drop/trade involved), fed by the dedicated
// "Load Roster Updates" scrape (never the tx queue). Only team + date are kept,
// same as txHistory: the point is tracking *when* managers show up to manage
// their team, not what they changed. CPU and Lineup Protection auto-moves are
// filtered out in espn.js before this ever sees them.
let rosterUpdateHistory = [];
let rosterUpdateKeys = new Set();
browser.storage.local.get(["rosterUpdateHistory", "rosterUpdateKeys"]).then(res => {
  if (Array.isArray(res.rosterUpdateHistory)) rosterUpdateHistory = res.rosterUpdateHistory;
  if (Array.isArray(res.rosterUpdateKeys)) rosterUpdateKeys = new Set(res.rosterUpdateKeys);
});

// Team rename log ("Renamed team X to Y."), scraped opportunistically whenever
// encountered during normal activity scraping. Lets Manager Stats resolve an
// old team name in older history entries to whatever that team is called now,
// without ever rewriting the stored history itself. Renames are rare (0-2 a
// season), so a plain array scan for dedup is plenty; no separate key Set needed.
let teamRenames = [];
browser.storage.local.get("teamRenames").then(res => {
  if (Array.isArray(res.teamRenames)) teamRenames = res.teamRenames;
});

// ── Load watchdog ─────────────────────────────────────────────────────────────
// A genuine tab crash (browser OOM, renderer death) can kill the content
// script's own JS entirely mid-page, silently disabling its own hang-detection
// and retry logic (which lives in that same doomed execution context, so it
// never gets a chance to run). This watchdog lives here instead, in the
// persistent background page, immune to that crash, and force-navigates the
// tab if too long passes with no sign of life from Load All Activity or Load
// Roster Updates at all. It reuses the same &retry= URL param and 3-attempt
// budget the content-script-level retry already uses, so the two mechanisms
// don't fight over separate retry counts.
let watchedLoadTab   = null; // { tabId, kind: "loadAll" | "rosterUpdates", lastSeenAt }
let watchdogInterval = null;
const WATCHDOG_CHECK_MS   = 5000;
const WATCHDOG_SILENCE_MS = 45000; // comfortably beyond the content script's own ~60s worst-case self-recovery window
const WATCHDOG_MAX_RETRIES = 3;

function touchWatchdog() {
  if (watchedLoadTab) watchedLoadTab.lastSeenAt = Date.now();
}

function startWatchdog(tabId, kind) {
  watchedLoadTab = { tabId, kind, lastSeenAt: Date.now() };
  if (watchdogInterval) clearInterval(watchdogInterval);
  watchdogInterval = setInterval(checkWatchdog, WATCHDOG_CHECK_MS);
}

function stopWatchdog() {
  watchedLoadTab = null;
  if (watchdogInterval) { clearInterval(watchdogInterval); watchdogInterval = null; }
}

async function checkWatchdog() {
  if (!watchedLoadTab) return;
  if (Date.now() - watchedLoadTab.lastSeenAt < WATCHDOG_SILENCE_MS) return;

  const { tabId, kind } = watchedLoadTab;
  const flagKey     = kind === "loadAll" ? "espnAutoLoadAll" : "espnAutoLoadRosterUpdates";
  const doneMsgType = kind === "loadAll" ? "LOAD_ALL_DONE" : "ROSTER_UPDATES_DONE";

  const flagRes = await browser.storage.local.get(flagKey);
  if (!flagRes[flagKey]) { stopWatchdog(); return; } // already stopped some other way

  let tab;
  try { tab = await browser.tabs.get(tabId); } catch { tab = null; }
  if (!tab || !tab.url) { stopWatchdog(); return; } // tab itself is gone

  const url     = new URL(tab.url);
  const retry   = parseInt(url.searchParams.get("retry") || "0", 10) || 0;
  const pageNum = parseInt(url.searchParams.get("page") || "1", 10) || 1;

  if (retry >= WATCHDOG_MAX_RETRIES) {
    await browser.storage.local.set({ [flagKey]: false });
    browser.runtime.sendMessage({ type: doneMsgType, pages: pageNum, hungAborted: true }).catch(() => {});
    stopWatchdog();
    return;
  }

  console.log(`[EXT] Watchdog: tab ${tabId} unresponsive for ${WATCHDOG_SILENCE_MS / 1000}s, force-reloading (retry ${retry + 1}/${WATCHDOG_MAX_RETRIES})`);
  url.searchParams.set("retry", retry + 1);
  browser.tabs.update(tabId, { url: url.toString() }).catch(() => {});
  watchedLoadTab.lastSeenAt = Date.now();
}

// ── Auto-navigation state ─────────────────────────────────────────────────────
let autoTabId    = null;
let autoRunning  = false;
let expectedPath = null;
let pendingStep  = false; // true while Manual Step is mid-navigation to the right Fantrax page

function pagePathForTx(tx) {
  if (tx.type === "DRFT")  return "playerImport.go";
  if (tx.type === "TRADE") return "trade.go";
  return "claimDrop.go";
}

// Returns the next eligible transaction, broken or not: callers decide what to
// do with a broken one (Step/Auto Run all hard-stop rather than skip past it,
// since a later transaction may depend on the missing one having gone through).
async function peekNextTx() {
  const cutoff = await getCutoffDate();
  const upper  = upperCutoff ? parseCutoffStr(upperCutoff) : null;
  for (let i = index; i < queue.length; i++) {
    const tx = queue[i];
    if (!tx.date) continue;
    const d = new Date(tx.date);
    if (d < cutoff) continue;
    if (upper && d > upper) continue;
    if (excludedKeys.has(txKey(tx))) continue;
    return tx;
  }
  return null;
}

const BROKEN_TX_MESSAGE =
  "The next transaction is broken: ESPN's own page was missing a player's info for it. " +
  "Open the Transaction Queue, click the highlighted row, and fill in the missing player " +
  "before Step or Auto Run can continue.";

async function autoAdvance() {
  if (!autoRunning || !autoTabId) return;

  // Null out expectedPath immediately (synchronous, before any await) so that
  // tabs.onUpdated ignores any page reloads that fire while we're mid-await.
  // The trade page auto-reloads after a trade completes; without this, the reload
  // would match the still-set "trade.go" expectedPath and fire RUN_NEXT on the
  // trade page for the next ADD/DROP transaction before autoAdvance navigates away.
  const prevPath = expectedPath;
  expectedPath = null;

  const nextTx = await peekNextTx();
  if (!nextTx) {
    autoRunning = false;
    upperCutoff = null; // clear in-memory filter; storage untouched so UI stays as-is
    browser.runtime.sendMessage({ type: "AUTO_STOPPED" }).catch(() => {});
    browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
    return;
  }

  if (nextTx.broken) {
    autoRunning = false;
    upperCutoff = null;
    browser.runtime.sendMessage({ type: "AUTO_ERROR", message: BROKEN_TX_MESSAGE }).catch(() => {});
    browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
    return;
  }

  const nextPath = pagePathForTx(nextTx);
  const msgType  = nextPath === "playerImport.go" ? "RUN_IMPORT" : "RUN_NEXT";

  if (nextPath === prevPath) {
    // Same page type — send message directly, no navigation needed
    expectedPath = nextPath; // restore so tabs.onUpdated stays armed for future advances
    browser.tabs.sendMessage(autoTabId, { type: msgType }).catch(() => {});
  } else {
    // Different page — navigate the tab
    const res = await browser.storage.local.get("fantraxLeagueId");
    const fantraxId = res.fantraxLeagueId;
    if (!fantraxId) {
      autoRunning = false;
      browser.runtime.sendMessage({
        type: "AUTO_ERROR",
        message: "Fantrax League ID not set. Save it in the extension popup first."
      }).catch(() => {});
      return;
    }
    expectedPath = nextPath; // set before tabs.update so onUpdated check works on load
    browser.tabs.update(autoTabId, {
      url: `https://www.fantrax.com/newui/fantasy/${nextPath}?leagueId=${fantraxId}`
    });
    // tabs.onUpdated will fire and send the message once the page loads
  }
}

// Extract the Fantrax leagueId from a URL. Handles both:
//   ?leagueId=XXXX  (newui pages: claimDrop, trade, playerImport)
//   /league/XXXX/   (other Fantrax pages)
function getUrlLeagueId(url) {
  if (!url) return null;
  const m = url.match(/[?&]leagueId=([a-z0-9]+)/i)
         || url.match(/\/league\/([a-z0-9]+)/i);
  return m ? m[1].toLowerCase() : null;
}

async function startStep(tabId) {
  const [nextTx, res, tab] = await Promise.all([
    peekNextTx(),
    browser.storage.local.get("fantraxLeagueId"),
    browser.tabs.get(tabId)
  ]);

  if (!nextTx) {
    browser.runtime.sendMessage({ type: "AUTO_ERROR", message: "No transactions in queue." }).catch(() => {});
    return;
  }

  if (nextTx.broken) {
    browser.runtime.sendMessage({ type: "AUTO_ERROR", message: BROKEN_TX_MESSAGE }).catch(() => {});
    return;
  }

  const fantraxId = (res.fantraxLeagueId || "").toLowerCase();

  // Guard: if the active tab is on Fantrax, its leagueId must match the saved one.
  if (tab.url?.includes("fantrax") && fantraxId) {
    const urlId = getUrlLeagueId(tab.url);
    if (urlId && urlId !== fantraxId) {
      browser.runtime.sendMessage({
        type: "AUTO_ERROR",
        message: `Wrong league — tab has leagueId=${urlId} but saved ID is ${fantraxId}. Navigate to the correct Fantrax league first.`
      }).catch(() => {});
      return;
    }
  }

  const nextPath = pagePathForTx(nextTx);
  const msgType  = nextPath === "playerImport.go" ? "RUN_IMPORT" : "RUN_NEXT";

  if (tab.url?.includes(nextPath)) {
    // Already on the right page: send directly
    browser.tabs.sendMessage(tabId, { type: msgType }).catch(() => {});
    return;
  }

  const fantraxIdRaw = res.fantraxLeagueId || "";
  if (!fantraxIdRaw) {
    browser.runtime.sendMessage({
      type: "AUTO_ERROR",
      message: "Fantrax League ID not set. Save it in the extension popup first."
    }).catch(() => {});
    return;
  }

  // Navigate to the right Fantrax page, same as Auto Run does; tabs.onUpdated
  // below fires the run once the navigation completes.
  autoTabId    = tabId;
  expectedPath = nextPath;
  pendingStep  = true;
  browser.tabs.update(tabId, {
    url: `https://www.fantrax.com/newui/fantasy/${nextPath}?leagueId=${fantraxIdRaw}`
  });
}

async function startAuto(tabId) {
  autoTabId   = tabId;
  autoRunning = true;

  const [nextTx, res, tab] = await Promise.all([
    peekNextTx(),
    browser.storage.local.get("fantraxLeagueId"),
    browser.tabs.get(tabId)
  ]);

  if (!nextTx) {
    autoRunning = false;
    browser.runtime.sendMessage({ type: "AUTO_ERROR", message: "No transactions in queue." }).catch(() => {});
    return;
  }

  if (nextTx.broken) {
    autoRunning = false;
    browser.runtime.sendMessage({ type: "AUTO_ERROR", message: BROKEN_TX_MESSAGE }).catch(() => {});
    return;
  }

  const fantraxId = res.fantraxLeagueId || "";

  // Guard: if the active tab is on Fantrax, its leagueId must match the saved one.
  if (tab.url?.includes("fantrax") && fantraxId) {
    const urlId = getUrlLeagueId(tab.url);
    if (urlId && urlId !== fantraxId.toLowerCase()) {
      autoRunning = false;
      browser.runtime.sendMessage({
        type: "AUTO_ERROR",
        message: `Wrong league — tab has leagueId=${urlId} but saved ID is ${fantraxId}. Navigate to the correct Fantrax league first.`
      }).catch(() => {});
      return;
    }
  }

  const nextPath = pagePathForTx(nextTx);
  const msgType  = nextPath === "playerImport.go" ? "RUN_IMPORT" : "RUN_NEXT";

  if (tab.url?.includes(nextPath)) {
    // Already on the right page — send directly
    expectedPath = nextPath;
    browser.tabs.sendMessage(tabId, { type: msgType }).catch(() => {});
  } else {
    if (!fantraxId) {
      autoRunning = false;
      browser.runtime.sendMessage({
        type: "AUTO_ERROR",
        message: "Fantrax League ID not set. Save it in the extension popup first."
      }).catch(() => {});
      return;
    }
    expectedPath = nextPath;
    browser.tabs.update(tabId, {
      url: `https://www.fantrax.com/newui/fantasy/${nextPath}?leagueId=${fantraxId}`
    });
  }
}

function txKey(tx) {
  const t = tx.date ? new Date(tx.date).getTime() : 0;

  if (tx.type === "TRADE") {
    // key = sorted list of all player names + timestamp (order-independent)
    const players = Object.values(tx.sides || {})
      .flat()
      .map(p => `${p.first}|${p.last}`)
      .sort()
      .join(",");
    return `TRADE||${players}||${t}`;
  }

  return [
    tx.team  || "",
    tx.type  || "",
    tx.add  ? tx.add.first  + "|" + tx.add.last  : "",
    tx.drop ? tx.drop.first + "|" + tx.drop.last : "",
    t
  ].join("||");
}

async function getCutoffDate() {
  const res = await browser.storage.local.get("cutoff");
  if (!res.cutoff) return new Date(0);
  return parseCutoffStr(res.cutoff);
}

function parseCutoffStr(str) {
  const parts = str.trim().split(" ");
  const [y, m, d] = parts[0].split("-").map(Number);
  let hour = 0, min = 0;
  if (parts[1]) {
    const tp = parts[1].split(":").map(Number);
    hour = tp[0] || 0;
    min  = tp[1] || 0;
  }
  return new Date(y, m - 1, d, hour, min, 0);
}

browser.runtime.onMessage.addListener((msg, sender) => {

  if (msg.type === "ESPN_TRANSACTIONS_APPEND") {
    touchWatchdog();
    // Use the ESPN page number from the URL as the sort key for same-timestamp
    // tiebreaking across pages. Higher page number = older content = processes first.
    // Falls back to an incrementing counter for sources without a page number (draft).
    const seq = (msg.page > 0) ? msg.page : ++batchSeq;

    // Recorded for every scraped transaction, even ones already processed and about
    // to be filtered out of the queue below: Shame List stats need the full history.
    msg.data.forEach(recordTxHistory);

    const fresh = msg.data.filter(tx => {
      const key = txKey(tx);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      if (processedKeys.has(key)) return false; // already imported in a prior session
      tx.batchSeq = seq; // stamp before dedup check passes it through
      return true;
    });

    if (!fresh.length) {
      console.log("[EXT] No new transactions (all already indexed).");
      // Distinguish "found transactions but all were already processed" from a
      // genuinely empty scrape, so the popup doesn't just look like nothing loaded.
      if (msg.data.length > 0) {
        browser.runtime.sendMessage({ type: "ESPN_ALL_ALREADY_PROCESSED", count: msg.data.length }).catch(() => {});
      }
      return;
    }

    // A stale upper cutoff would otherwise silently hide newly-scraped transactions
    // behind an old "To" date until manually cleared. Since the cutoff's only job is
    // to cap what's already in front of you, it has no reason to survive contact with
    // genuinely new data: clear it instead of letting it hide the very thing you just scraped.
    if (upperCutoff) {
      const upperDate = parseCutoffStr(upperCutoff);
      const hasNewer  = fresh.some(tx => tx.date && new Date(tx.date) > upperDate);
      if (hasNewer) {
        upperCutoff = null;
        browser.storage.local.remove("upperCutoff");
        browser.runtime.sendMessage({ type: "UPPER_CUTOFF_CLEARED" }).catch(() => {});
      }
    }

    queue.push(...fresh);
    // primary: oldest date first
    // secondary: higher batchSeq first (later-scraped page = older content)
    // tertiary: higher data-idx first (older within the same page)
    queue.sort((a, b) => a.date - b.date || b.batchSeq - a.batchSeq || b.idx - a.idx);
    index = 0;
    console.log("[EXT] Queue size:", queue.length, "(added", fresh.length, "new)");
    updateBadge();
    // notify popup if it happens to be open
    browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
  }

  if (msg.type === "GET_QUEUE") {
    return Promise.resolve({ queue, index, excludedKeys: [...excludedKeys] });
  }

  if (msg.type === "GET_PROCESSED_LOG") {
    return Promise.resolve({ processedTxLog });
  }

  // Sent by espn.js's dedicated Roster Updates scrape. Never touches the tx
  // queue or processedKeys: this is a separate, stats-only pipeline.
  if (msg.type === "ROSTER_UPDATE_TRANSACTIONS_APPEND") {
    touchWatchdog();
    let changed = false;
    (msg.data || []).forEach(entry => {
      if (!entry.team || !entry.date) return;
      const d = new Date(entry.date);
      if (isNaN(d)) return;
      // No player identity to key on, so team + minute + row position is the
      // best available uniqueness signal. Good enough for a stats counter.
      const key = [
        entry.team,
        d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(),
        entry.idx || 0
      ].join("|");
      if (rosterUpdateKeys.has(key)) return;
      rosterUpdateKeys.add(key);
      rosterUpdateHistory.push({ team: entry.team, date: entry.date });
      changed = true;
    });
    if (changed) {
      browser.storage.local.set({ rosterUpdateHistory, rosterUpdateKeys: [...rosterUpdateKeys] });
    }
    return Promise.resolve();
  }

  // Sent whenever espn.js spots a "Renamed team X to Y." row during normal
  // scraping. Non-destructive: this only ever grows a small lookup table used
  // to resolve old names to current ones when rendering Manager Stats, never
  // rewrites txHistory/rosterUpdateHistory entries themselves.
  if (msg.type === "TEAM_RENAME_DETECTED") {
    let changed = false;
    (msg.renames || []).forEach(r => {
      if (!r.from || !r.to || !r.date) return;
      const dup = teamRenames.some(existing =>
        existing.from === r.from && existing.to === r.to &&
        Math.abs(new Date(existing.date) - new Date(r.date)) < 60000
      );
      if (dup) return;
      teamRenames.push({ from: r.from, to: r.to, date: r.date });
      changed = true;
    });
    if (changed) browser.storage.local.set({ teamRenames });
    return Promise.resolve();
  }

  // Sent by popup.js right after it creates the Load All Activity / Load
  // Roster Updates tab, so the watchdog above knows which tab to monitor.
  if (msg.type === "WATCH_LOAD_TAB") {
    startWatchdog(msg.tabId, msg.kind);
    return Promise.resolve();
  }

  if (msg.type === "UNWATCH_LOAD_TAB") {
    stopWatchdog();
    return Promise.resolve();
  }

  // Sent by espn.js every LOAD_TAB_RECYCLE_INTERVAL pages: content scripts
  // can't call tabs.create/tabs.remove directly, so the actual close-and-reopen
  // happens here. Re-points the watchdog and popup's tracked tab id at the
  // replacement tab so Stop and the OOM watchdog keep working across the swap.
  if (msg.type === "RECYCLE_LOAD_TAB") {
    return (async () => {
      const oldTabId = sender.tab?.id;
      try {
        const newTab = await browser.tabs.create({ url: msg.nextUrl });
        if (oldTabId != null) browser.tabs.remove(oldTabId).catch(() => {});
        startWatchdog(newTab.id, msg.kind);
        browser.runtime.sendMessage({ type: "LOAD_TAB_RECYCLED", kind: msg.kind, tabId: newTab.id }).catch(() => {});
      } catch (e) {
        console.log("[EXT] Failed to recycle load tab:", e.message);
        const flagKey     = msg.kind === "loadAll" ? "espnAutoLoadAll" : "espnAutoLoadRosterUpdates";
        const doneMsgType = msg.kind === "loadAll" ? "LOAD_ALL_DONE" : "ROSTER_UPDATES_DONE";
        await browser.storage.local.set({ [flagKey]: false });
        browser.runtime.sendMessage({ type: doneMsgType, pages: msg.page, hungAborted: true }).catch(() => {});
        stopWatchdog();
      }
    })();
  }

  // These are otherwise only consumed by popup.js for the button UI; picked up
  // here too just to reset the watchdog's timer on any sign of life.
  if (msg.type === "LOAD_ALL_PROGRESS" || msg.type === "ROSTER_UPDATES_PROGRESS") {
    touchWatchdog();
    return Promise.resolve();
  }

  if (msg.type === "CLEAR_QUEUE") {
    queue = [];
    index = 0;
    prevIndex = 0;
    batchSeq = 0;
    seenKeys.clear();
    excludedKeys.clear();
    autoRunning = false;
    updateBadge();
    return Promise.resolve();
  }

  if (msg.type === "REWIND_QUEUE") {
    index = prevIndex;
    updateBadge();
    return Promise.resolve();
  }

  // Sent by fantrax.js when a live attempt hits an ambiguous or missing Fantrax
  // search result (e.g. a player released by their real MLB team, so ESPN never
  // recorded a team/position to disambiguate with). Unlike a broken transaction,
  // the data isn't actually missing forever: the user finishes it by hand on
  // Fantrax (already alerted there with the details), then uses the popup's
  // "Skip & Continue" to move past it. AUTO_STOPPED (not AUTO_ERROR) syncs the
  // popup's Stop button back to idle without a second, redundant alert dialog.
  if (msg.type === "MANUAL_PICK_NEEDED") {
    const key = txKey(msg.tx);
    const tx  = queue.find(t => txKey(t) === key);
    if (tx) { tx.needsManualPick = true; tx.manualPickReason = msg.message; }
    index = prevIndex;
    autoRunning = false;
    updateBadge();
    browser.runtime.sendMessage({ type: "AUTO_STOPPED" }).catch(() => {});
    browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
    return Promise.resolve();
  }

  if (msg.type === "SET_UPPER_CUTOFF") {
    upperCutoff = msg.value || null;
    updateBadge();
    return Promise.resolve();
  }

  // Sent by fantrax.js when a transaction is consumed by an error (player not found,
  // roster full, etc.) so the popup re-renders without triggering autoAdvance.
  if (msg.type === "QUEUE_REFRESH") {
    updateBadge();
    browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
    return Promise.resolve();
  }

  if (msg.type === "TOGGLE_EXCLUDE") {
    const key = msg.key;
    if (excludedKeys.has(key)) excludedKeys.delete(key);
    else                        excludedKeys.add(key);
    updateBadge();
    browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
    return Promise.resolve();
  }

  // Idempotent add-only exclude, used by the "Skip & Continue" button so a
  // double click can't accidentally flip the same key back off the way
  // TOGGLE_EXCLUDE would.
  if (msg.type === "EXCLUDE_KEY") {
    const key = msg.key;
    excludedKeys.add(key);
    const tx = queue.find(t => txKey(t) === key);
    if (tx) { delete tx.needsManualPick; delete tx.manualPickReason; }
    updateBadge();
    browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
    return Promise.resolve();
  }

  // Patches in the player name/team a user manually tracked down for a
  // transaction ESPN's own page left blank, and clears whichever side(s) of
  // it were flagged broken so Auto Run/Step can process it normally again.
  if (msg.type === "FIX_BROKEN_TX") {
    const tx = queue.find(t => txKey(t) === msg.key);
    if (!tx) return Promise.resolve({ ok: false });

    ["add", "drop"].forEach(side => {
      const fix = msg.fixes?.[side];
      if (!fix || !tx[side]?.broken) return;
      tx[side].first = fix.first;
      tx[side].last  = fix.last;
      if (fix.mlbTeam)  tx[side].mlbTeam  = fix.mlbTeam;
      if (fix.position) tx[side].position = fix.position;
      delete tx[side].broken;
    });

    tx.broken = !!(tx.add?.broken || tx.drop?.broken);
    updateBadge();
    browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
    return Promise.resolve({ ok: true });
  }

  if (msg.type === "PROCESSING_DONE") {
    upperCutoff = null; // clear in-memory filter; storage untouched so UI stays as-is
    return Promise.resolve();
  }

  if (msg.type === "START_STEP") {
    return startStep(msg.tabId);
  }

  if (msg.type === "START_AUTO") {
    return startAuto(msg.tabId);
  }

  if (msg.type === "STOP_AUTO") {
    autoRunning = false;
    return Promise.resolve();
  }

  if (msg.type === "GET_AUTO_STATE") {
    return Promise.resolve({ autoRunning });
  }

  if (msg.type === "TRANSACTION_DONE") {
    return (async () => {
      if (msg.drftBatch) {
        // import.js processed all picks at once — advance past every DRFT entry
        while (index < queue.length && queue[index].type === "DRFT") markProcessed(queue[index++]);
      } else {
        markProcessed(msg.tx);
      }
      updateBadge();
      browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
      await autoAdvance();
    })();
  }

  if (msg.type === "GET_NEXT") {
    return (async () => {

      const cutoff = await getCutoffDate();
      const upper  = upperCutoff ? parseCutoffStr(upperCutoff) : null;
      prevIndex = index;

      while (index < queue.length) {
        const tx = queue[index];

        if (!tx.date) { index++; continue; }

        const txDate = new Date(tx.date);
        if (txDate < cutoff)             { index++; continue; }
        if (upper && txDate > upper)     { index++; continue; }
        if (excludedKeys.has(txKey(tx))) { index++; continue; }
        // Don't advance past a broken transaction: startStep/startAuto already
        // hard-stop before ever reaching here, but this is the defensive backstop.
        if (tx.broken) break;

        index++;
        updateBadge();
        return tx;
      }

      updateBadge();
      return null;
    })();
  }
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!autoRunning && !pendingStep)     return;
  if (tabId !== autoTabId)              return;
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.includes(expectedPath)) return;

  const msgType = expectedPath === "playerImport.go" ? "RUN_IMPORT" : "RUN_NEXT";
  pendingStep = false;
  // Brief delay to let the content script finish initialising
  setTimeout(() => {
    browser.tabs.sendMessage(autoTabId, { type: msgType }).catch(() => {});
  }, 600);
});

function isFantrax(tab) {
  return tab?.url?.includes("fantrax");
}

// The toolbar badge area clips anything past 3 characters (confirmed: even a
// plain 4-digit number like "1000" gets cut off, not just a decimal form like
// "1.1k"), so thousands drop the decimal entirely and just round to the nearest "k".
function formatBadgeCount(n) {
  if (n < 1000) return String(n);
  return Math.round(n / 1000) + "k";
}

async function updateBadge() {
  // Mirrors the League Settings gear's own "needs-attention" glow in popup.js:
  // both League IDs gate everything else the extension does, so flag it on the
  // toolbar badge too, visible even before the popup is ever opened.
  const { espnLeagueId, fantraxLeagueId } = await browser.storage.local.get(["espnLeagueId", "fantraxLeagueId"]);
  if (!espnLeagueId || !fantraxLeagueId) {
    browser.browserAction.setBadgeText({ text: "!" });
    browser.browserAction.setBadgeBackgroundColor({ color: "#e05252" });
    browser.browserAction.setTitle({
      title: "Fantasy Sync Assistant: set both League IDs in League Settings to get started"
    });
    return;
  }

  const cutoff = await getCutoffDate();
  const upper  = upperCutoff ? parseCutoffStr(upperCutoff) : null;
  const remainingTxs = queue.slice(index).filter(tx => {
    if (!tx.date) return false;
    const d = new Date(tx.date);
    if (d < cutoff) return false;
    if (upper && d > upper) return false;
    if (excludedKeys.has(txKey(tx))) return false;
    return true;
  });

  const needsManualPick = remainingTxs.some(tx => tx.needsManualPick);
  const brokenCount     = remainingTxs.filter(tx => tx.broken).length;

  if (needsManualPick) {
    // Red, matching the League Settings gear's existing "needs attention" glow:
    // auto-run has already stopped and is waiting on you, not just sitting on
    // an unattended broken row, so it gets its own color instead of amber.
    // "!" instead of a count since only one transaction can block at a time.
    browser.browserAction.setBadgeText({ text: "!" });
    browser.browserAction.setBadgeBackgroundColor({ color: "#e05252" });
    browser.browserAction.setTitle({
      title: "Fantasy Sync Assistant: a transaction needs a manual pick on Fantrax before continuing"
    });
  } else if (brokenCount > 0) {
    // Amber, matching the broken row highlight and the "Fix Needed" button
    // state, so the same "something needs manual attention" color shows up
    // everywhere in the extension. Shows how many are broken, not the total
    // queue count, since that's the actionable number here.
    browser.browserAction.setBadgeText({ text: formatBadgeCount(brokenCount) });
    browser.browserAction.setBadgeBackgroundColor({ color: "#e09b1e" });
    browser.browserAction.setTitle({
      title: `Fantasy Sync Assistant: ${brokenCount} broken transaction${brokenCount === 1 ? "" : "s"} need${brokenCount === 1 ? "s" : ""} a manual fix`
    });
  } else {
    browser.browserAction.setBadgeText({ text: remainingTxs.length > 0 ? formatBadgeCount(remainingTxs.length) : "" });
    browser.browserAction.setBadgeBackgroundColor({ color: "#1a73e8" });
    browser.browserAction.setTitle({ title: "Fantasy Sync Assistant" });
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.cutoff || changes.espnLeagueId || changes.fantraxLeagueId) updateBadge();
});

// Set the badge immediately when the extension (re)starts, so the "set your
// League IDs" reminder shows up on the toolbar icon before the popup is ever opened.
updateBadge();