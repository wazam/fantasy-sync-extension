let queue = [];
let index = 0;
let prevIndex = 0;
const seenKeys    = new Set();
const excludedKeys = new Set();
let upperCutoff = null; // "YYYY-MM-DD HH:MM" or null
let batchSeq = 0; // fallback counter for sources that don't supply a page number (e.g. draft.js)

// ── Auto-navigation state ─────────────────────────────────────────────────────
let autoTabId    = null;
let autoRunning  = false;
let expectedPath = null;

function pagePathForTx(tx) {
  if (tx.type === "DRFT")  return "playerImport.go";
  if (tx.type === "TRADE") return "trade.go";
  return "claimDrop.go";
}

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

  if (!tab.url?.includes(nextPath)) {
    const labels = { "claimDrop.go": "Claim/Drop", "trade.go": "Trade", "playerImport.go": "Draft Import" };
    browser.runtime.sendMessage({
      type: "AUTO_ERROR",
      message: `Navigate to the Fantrax ${labels[nextPath] || nextPath} page first, then press F7.`
    }).catch(() => {});
    return;
  }

  const msgType = nextPath === "playerImport.go" ? "RUN_IMPORT" : "RUN_NEXT";
  browser.tabs.sendMessage(tabId, { type: msgType }).catch(() => {});
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

browser.runtime.onMessage.addListener((msg) => {

  if (msg.type === "ESPN_TRANSACTIONS_APPEND") {
    // Use the ESPN page number from the URL as the sort key for same-timestamp
    // tiebreaking across pages. Higher page number = older content = processes first.
    // Falls back to an incrementing counter for sources without a page number (draft).
    const seq = (msg.page > 0) ? msg.page : ++batchSeq;

    const fresh = msg.data.filter(tx => {
      const key = txKey(tx);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      tx.batchSeq = seq; // stamp before dedup check passes it through
      return true;
    });

    if (!fresh.length) {
      console.log("[EXT] No new transactions (all already indexed).");
      return;
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

  if (msg.type === "RESET_QUEUE_INDEX") {
    index = 0;
    prevIndex = 0;
    excludedKeys.clear();
    updateBadge();
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
        while (index < queue.length && queue[index].type === "DRFT") index++;
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
        const tx = queue[index++];

        if (!tx.date) continue;

        const txDate = new Date(tx.date);
        if (txDate < cutoff) continue;
        if (upper && txDate > upper) continue;
        if (excludedKeys.has(txKey(tx))) continue;

        updateBadge();
        return tx;
      }

      updateBadge();
      return null;
    })();
  }
});

browser.commands.onCommand.addListener(async (command) => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab  = tabs[0];
  if (!tab?.id) return;
  if (command === "step-transaction") {
    if (autoRunning) {
      autoRunning = false;
      browser.runtime.sendMessage({ type: "AUTO_STOPPED" }).catch(() => {});
    } else {
      startStep(tab.id);
    }
  }
  if (command === "next-transaction") startAuto(tab.id);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!autoRunning)                     return;
  if (tabId !== autoTabId)              return;
  if (changeInfo.status !== "complete") return;
  if (!tab.url?.includes(expectedPath)) return;

  const msgType = expectedPath === "playerImport.go" ? "RUN_IMPORT" : "RUN_NEXT";
  // Brief delay to let the content script finish initialising
  setTimeout(() => {
    browser.tabs.sendMessage(autoTabId, { type: msgType }).catch(() => {});
  }, 600);
});

function isFantrax(tab) {
  return tab?.url?.includes("fantrax");
}

async function updateBadge() {
  const cutoff = await getCutoffDate();
  const upper  = upperCutoff ? parseCutoffStr(upperCutoff) : null;
  const remaining = queue.slice(index).filter(tx => {
    if (!tx.date) return false;
    const d = new Date(tx.date);
    if (d < cutoff) return false;
    if (upper && d > upper) return false;
    if (excludedKeys.has(txKey(tx))) return false;
    return true;
  }).length;

  browser.browserAction.setBadgeText({ text: remaining > 0 ? String(remaining) : "" });
  browser.browserAction.setBadgeBackgroundColor({ color: "#1a73e8" });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.cutoff) updateBadge();
});