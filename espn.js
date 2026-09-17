console.log("[EXT] espn.js injected:", location.href);

// ── Shared: name parsing ──────────────────────────────────────────────────────

const NAME_SUFFIXES        = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;
const NAME_PARTICLES       = new Set(["de", "del", "la", "le", "van", "von", "den"]);
const TWO_WORD_PARTICLES   = ["de la", "de las", "de los", "van der", "van de"];

function parseName(full) {
  const parts = full.trim().split(/\s+/);

  // Strip trailing suffix (Jr., Sr., II, III, IV, V)
  let suffix = null;
  if (parts.length > 2 && NAME_SUFFIXES.test(parts[parts.length - 1])) {
    suffix = parts.pop();
  }

  if (parts.length === 1) {
    return { first: "", last: suffix ? `${parts[0]} ${suffix}` : parts[0] };
  }

  // Default: last word is the surname
  let lastStart = parts.length - 1;

  // Check for two-word particle immediately before the surname word
  // e.g. "De La" in "Elly De La Cruz", "De Los" in "Deyvison De Los Santos"
  if (lastStart >= 2) {
    const twoWord = `${parts[lastStart - 2]} ${parts[lastStart - 1]}`.toLowerCase();
    if (TWO_WORD_PARTICLES.includes(twoWord)) lastStart -= 2;
  }

  // Check for one-word particle (only if two-word didn't already extend)
  // e.g. "De" in "Juan De Santos" — but NOT "De" inside "DeMartini" (already one token)
  if (lastStart === parts.length - 1 && lastStart >= 2) {
    if (NAME_PARTICLES.has(parts[lastStart - 1].toLowerCase())) lastStart -= 1;
  }

  const lastParts = parts.slice(lastStart);
  if (suffix) lastParts.push(suffix);

  return {
    first: parts.slice(0, lastStart).join(" "),
    last:  lastParts.join(" ")
  };
}

// ── Shared: month map (0-indexed for new Date()) ──────────────────────────────

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
};

// ── Shared: DOM polling ───────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function waitForContent(selector, maxMs = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const els = document.querySelectorAll(selector);
      if (els.length > 0) return resolve(els);
      if (Date.now() - start > maxMs) return reject(new Error(`"${selector}" never appeared`));
      setTimeout(check, 500);
    };
    check();
  });
}

function waitForElement(selector, maxMs = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const el = document.querySelector(selector);
      if (el) return resolve(el);
      if (Date.now() - start > maxMs) return reject(new Error(`"${selector}" never appeared`));
      setTimeout(check, 500);
    };
    check();
  });
}

// Reads the season's earliest date directly from the "Start Date" filter dropdown
// (its options are chronological, oldest first) instead of hardcoding a date that
// would need updating every season.
async function findEarliestStartDate() {
  try {
    await waitForElement(".Dropdown__Wrapper select.dropdown__select");
  } catch {
    return null;
  }
  for (const wrapper of document.querySelectorAll(".Dropdown__Wrapper")) {
    const label = wrapper.querySelector(".Dropdown__Label span");
    if (label?.textContent.trim() === "Start Date") {
      const firstOption = wrapper.querySelector("select.dropdown__select option");
      return firstOption?.value || null;
    }
  }
  return null;
}

// The activity page is a SPA: clicking ESPN's own Next/Prev or changing a filter
// dropdown swaps the table in place via client-side JS, with no real navigation,
// so document_idle content scripts never re-inject. Watch the table for row
// changes and re-scrape automatically instead of requiring a manual page refresh.
function setupActivityAutoRescan(initialSignature) {
  const table = document.querySelector("tbody")?.closest("table") || document.body;
  let lastSignature = initialSignature;
  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const signature = rowSignature();
      if (signature === lastSignature) return;
      lastSignature = signature;

      const data = extractTransactions();
      if (!data.length) return;

      const params  = new URLSearchParams(location.search);
      const pageNum = parseInt(params.get("page") || "1", 10) || 1;
      browser.runtime.sendMessage({ type: "ESPN_TRANSACTIONS_APPEND", data, page: pageNum }).catch(() => {});
      console.log("[EXT] ESPN activity table changed in place, re-scraped:", data.length, "row(s)");
    }, 600);
  });

  observer.observe(table, { childList: true, subtree: true });
}

function rowSignature() {
  const rows = document.querySelectorAll("tbody tr");
  return rows.length + "|" + (rows[0]?.textContent || "");
}

// ── Activity page (recentactivity) ───────────────────────────────────────────

function parseDate(row) {
  const dateEl = row.querySelector(".date");
  const timeEl = row.querySelector(".time");

  if (!dateEl || !timeEl) return null;

  const dateText = dateEl.innerText.trim();   // "Sun Apr 5"
  const timeText = timeEl.innerText.trim();   // "8:29 pm"

  const [, monthStr, day] = dateText.match(/\w+ (\w+) (\d+)/) || [];

  const [, hourRaw, minute, ampm] = timeText.match(/(\d+):(\d+)\s*(am|pm)/i) || [];

  let hour = parseInt(hourRaw, 10);
  const min = parseInt(minute, 10);

  if (ampm.toLowerCase() === "pm" && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;

  return new Date(2026, MONTHS[monthStr], parseInt(day), hour, min);
}

function extractTransactions() {
  const rows = document.querySelectorAll("tbody tr");
  const results = [];

  rows.forEach(row => {
    const details = row.querySelectorAll(".transaction-details");
    if (!details.length) return;

    const detailsArr = Array.from(details);
    const rawIdx     = parseInt(row.getAttribute("data-idx"), 10);
    const idx        = isNaN(rawIdx) ? 0 : rawIdx;

    // ── Trade rows ──────────────────────────────────────────────────────────
    if (detailsArr.some(d => d.innerText.includes(" traded "))) {
      // Skip "Trade Accepted" (pending); only queue "Trade Processed"
      const typeSpan = row.querySelector(".typeInfo span:last-child");
      if (!typeSpan?.innerText.toLowerCase().includes("processed")) return;

      // Extract embedded drops — a trading team may drop a player to clear roster space.
      // These appear as .waiver-drop spans inside the trade row and must process
      // on the claim/drop page before the trade itself.
      row.querySelectorAll(".transaction-details.waiver-drop").forEach(detail => {
        const text = detail.innerText;
        const team = detail.querySelector(".teamName")?.innerText.trim() || null;
        const m    = text.match(/dropped (.*?),\s*([A-Z]{2,3})\s+(\S+)\s+(?:to|from)\b/) ||
                     text.match(/dropped (.*?),\s*([A-Z]{2,3})\b/);
        let drop;
        if (m) {
          drop = parseName(m[1]);
          drop.mlbTeam = m[2];
          if (m[3]) drop.position = m[3];
        } else if (text.includes("dropped")) {
          const nameText = detail.querySelector(".truncate a")?.innerText.trim();
          // ESPN drops the MLB team + position fields entirely once a player is
          // cut by their actual MLB team mid-season; the name is still present,
          // so keep it instead of flagging this as ESPN's rare "name missing"
          // bug. selectDrop() only needs the name to find the player on the
          // team's current Fantrax roster anyway.
          drop = nameText ? parseName(nameText) : { first: "", last: "", broken: true };
        } else {
          return;
        }
        results.push({ type: "DROP", team, add: null, drop, date: parseDate(row), idx, broken: !!drop.broken });
      });

      const legs = [];
      detailsArr.forEach(detail => {
        const playerEl = detail.querySelector(".truncate a");
        if (!playerEl) return;
        const teamEls  = detail.querySelectorAll(".teamName");
        if (teamEls.length < 2) return;
        legs.push({
          from:   teamEls[0].innerText.trim(),
          player: parseName(playerEl.innerText.trim()),
          to:     teamEls[1].innerText.trim()
        });
      });

      if (!legs.length) return;

      const teams = [...new Set(legs.flatMap(l => [l.from, l.to]))];
      const sides = Object.fromEntries(teams.map(t => [t, []]));
      legs.forEach(l => sides[l.from].push(l.player));

      results.push({
        type: "TRADE",
        team: teams.join(" \u21d4 "),   // ⇔
        teams, sides,
        add: null, drop: null,
        date: parseDate(row), idx
      });
      return;
    }

    // ── Add / Drop rows ─────────────────────────────────────────────────────
    let add = null, drop = null, team = null;

    detailsArr.forEach(detail => {
      const text    = detail.innerText;
      const rowTeam = detail.querySelector(".teamName")?.innerText.trim();
      if (rowTeam) team = rowTeam;

      if (text.includes("dropped")) {
        const m = text.match(/dropped (.*?),\s*([A-Z]{2,3})\s+(\S+)\s+(?:to|from)\b/) ||
                  text.match(/dropped (.*?),\s*([A-Z]{2,3})\b/);
        if (m) {
          drop = parseName(m[1]);
          drop.mlbTeam = m[2];
          if (m[3]) drop.position = m[3];
        } else {
          const nameText = detail.querySelector(".truncate a")?.innerText.trim();
          // ESPN drops the MLB team + position fields entirely once a player is
          // cut by their actual MLB team mid-season; the name is still present,
          // so keep it instead of flagging this as ESPN's rare "name missing"
          // bug. selectDrop() only needs the name to find the player on the
          // team's current Fantrax roster anyway.
          drop = nameText ? parseName(nameText) : { first: "", last: "", broken: true };
        }
      }
      if (text.includes("added")) {
        const m = text.match(/added (.*?),\s*([A-Z]{2,3})\s+(\S+)\s+(?:from|to)\b/) ||
                  text.match(/added (.*?),\s*([A-Z]{2,3})\b/);
        if (m) {
          add = parseName(m[1]);
          add.mlbTeam = m[2];
          if (m[3]) add.position = m[3];
        } else {
          const nameText = detail.querySelector(".truncate a")?.innerText.trim();
          // Same real-MLB-release case as the drop branch above: name present,
          // team + position gone. fillAddWithFallback() already falls back to
          // a name-only Fantrax search when mlbTeam is unset, and only needs
          // manual help if that search comes back ambiguous.
          add = nameText ? parseName(nameText) : { first: "", last: "", broken: true };
        }
      }
    });

    let type = null;
    if (add && drop) type = "ADD_DROP";
    else if (add)    type = "ADD";
    else if (drop)   type = "DROP";
    if (!type) return;

    const broken = !!(add?.broken || drop?.broken);
    results.push({ type, team, add, drop, date: parseDate(row), idx, broken });
  });

  return results;
}

// Manual "Roster Update" rows only: a manager moving players within their own
// roster (no add/drop/trade). ESPN's own typeInfo label is the same "Roster
// Update" text for a manual move, but gets a parenthetical suffix for the two
// auto-generated variants we don't want counted: "Roster Update (by CPU)" and
// "Roster Update (via Lineup Protection)". An exact (trimmed) string match on
// the first span is enough to tell them apart, no regex needed.
function extractRosterUpdates() {
  const rows = document.querySelectorAll("tbody tr");
  const results = [];

  rows.forEach(row => {
    const typeText = row.querySelector(".typeInfo span:first-child")?.innerText.trim();
    if (typeText !== "Roster Update") return; // excludes CPU / Lineup Protection variants, and anything else

    const team = row.querySelector(".teamName")?.innerText.trim();
    const date = parseDate(row);
    if (!team || !date) return;

    // One row = one check-in, no matter how many players were shuffled in it
    // (a manager moving 8 players in one batched save is one visit, not 8).
    const rawIdx = parseInt(row.getAttribute("data-idx"), 10);
    const idx = isNaN(rawIdx) ? 0 : rawIdx;

    results.push({ team, date, idx });
  });

  return results;
}

// "Renamed team OLDNAME to NEWNAME." notices show up as their own plain-text
// row (no .transaction-details wrapper, no .teamName) whenever a manager
// renames their team mid-season. Scraped opportunistically wherever they're
// encountered, so Manager Stats can later resolve an old name in older
// history entries to whatever that team is called now.
function extractTeamRenames() {
  const results = [];
  document.querySelectorAll("tbody tr .recentActivityDetail span").forEach(span => {
    const text = span.textContent.trim();
    const m = text.match(/^Renamed team (.+) to (.+)\.$/);
    if (!m) return;
    const date = parseDate(span.closest("tr"));
    if (!date) return;
    results.push({ from: m[1].trim(), to: m[2].trim(), date });
  });
  return results;
}

// Waits for either real activity rows or ESPN's own empty-state message,
// whichever comes first. A third outcome, "hung", is distinct from "empty":
// ESPN occasionally just spins forever (LoadAnimation with no rows and no
// "No activity" message) and never actually resolves the page. Treating that
// the same as a genuinely empty page would incorrectly end a Load All /
// Load Roster Updates walk early; callers reload and retry instead.
function waitForActivityResult(maxMs = 15000) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      if (document.querySelectorAll("tbody tr").length > 0) return resolve({ status: "rows" });
      if ((document.body.innerText || "").includes("No activity matching the specified filters")) {
        return resolve({ status: "empty" });
      }
      // Wrong league ID, or logged out of a private league: ESPN shows this
      // instead of the activity table. Unlike a hang, retrying won't help
      // (the page will show the exact same thing every time), so this needs
      // its own status distinct from "hung" to stop the walk immediately
      // instead of burning through the retry budget on something retrying
      // can never fix.
      if ((document.body.innerText || "").includes("You do not have permission to view this page")) {
        return resolve({ status: "denied" });
      }
      if (Date.now() - start > maxMs) return resolve({ status: "hung" });
      setTimeout(check, 300);
    };
    check();
  });
}

// Shared by Load All Activity and Load Roster Updates: if ESPN's page hung
// instead of resolving, reload the same URL (with an incrementing retry
// counter so a fresh content-script injection after the reload can tell this
// apart from a first attempt) rather than giving up. Returns false once the
// retry budget is exhausted, so the caller can abort cleanly instead of
// retrying forever against a genuinely broken/down page.
const HUNG_PAGE_MAX_RETRIES = 3;

async function retryHungPage(params, progressMsgType) {
  const retry = parseInt(params.get("retry") || "0", 10) || 0;
  if (retry >= HUNG_PAGE_MAX_RETRIES) return false;

  const pageNum = parseInt(params.get("page") || "1", 10) || 1;
  console.log(`[EXT] ESPN page didn't respond, reloading (retry ${retry + 1} of ${HUNG_PAGE_MAX_RETRIES})`);
  if (progressMsgType) {
    browser.runtime.sendMessage({ type: progressMsgType, page: pageNum, retrying: true, retry: retry + 1 }).catch(() => {});
  }
  await delay(1000);
  const url = new URL(location.href);
  url.searchParams.set("retry", retry + 1);
  location.assign(url.toString());
  return true;
}

// Whether to keep paginating is decided from the page's raw row count
// (rawEmpty = ESPN's own "No activity matching the specified filters" message),
// not from how many rows happened to be an add/drop/trade. A page can
// legitimately be "real rows, zero add/drop/trade" (e.g. a day that was all
// roster updates or a rename notice) without that meaning history ran out.
async function scrapeActivityPage(params) {
  const { status } = await waitForActivityResult();
  if (status === "hung") return { rawEmpty: false, qualifyingCount: 0, hung: true };
  if (status === "denied") {
    console.log("[EXT] ESPN denied access to this page (wrong league ID, or logged out of a private league).");
    return { rawEmpty: false, qualifyingCount: 0, denied: true };
  }
  if (status === "empty") {
    console.log("[EXT] No rows found on this page.");
    return { rawEmpty: true, qualifyingCount: 0 };
  }

  const renames = extractTeamRenames();
  if (renames.length) {
    browser.runtime.sendMessage({ type: "TEAM_RENAME_DETECTED", renames }).catch(() => {});
  }

  const data = extractTransactions();

  // Extract the ESPN page number from the URL (&page=N) so background.js can
  // order same-timestamp transactions correctly across pages regardless of load order.
  // Page 1 (the default/newest page) has no &page= param, so it defaults to 1.
  const pageNum = parseInt(params.get("page") || "1", 10) || 1;

  if (data.length) {
    browser.runtime.sendMessage({
      type: "ESPN_TRANSACTIONS_APPEND",
      data,
      page: pageNum
    });
  }

  console.log("[EXT] ESPN page scraped:", data.length, "add/drop/trade (page", pageNum + ")");
  return { rawEmpty: false, qualifyingCount: data.length };
}

// Load All History mode: walk pages newest → oldest until one comes back empty
// (or the DOM table never appears, which reads the same way: end of history).
const LOAD_ALL_MAX_PAGES = 500; // safety valve against a runaway loop

// Dozens of full page navigations in one long-lived tab accumulate real browser
// overhead (session history, back-forward cache, ESPN's own heavy ad/tracking
// scripts) even though each page's own JS state resets cleanly on navigation.
// That overhead alone can crash the tab well before LOAD_ALL_MAX_PAGES is ever
// reached, especially on lower-memory devices. Closing and reopening a fresh
// tab periodically resets that browser-level overhead to zero. Recycling is
// cheap (a couple seconds); a crash costs the whole run, so this errs toward a
// lower, more frequent interval rather than a higher one.
const LOAD_TAB_RECYCLE_INTERVAL = 15;

// Content scripts can't call tabs.create/tabs.remove directly, so recycling is
// handed off to background.js: it opens the new tab, closes this one, and
// re-points the watchdog and popup's tracked tab id at the replacement.
async function recycleLoadTab(kind, nextUrl, nextPage) {
  browser.runtime.sendMessage({ type: "RECYCLE_LOAD_TAB", kind, nextUrl, page: nextPage }).catch(() => {});
}

async function maybeContinueLoadAll(params, result) {
  const { espnAutoLoadAll } = await browser.storage.local.get("espnAutoLoadAll");
  if (!espnAutoLoadAll) return;

  const pageNum = parseInt(params.get("page") || "1", 10) || 1;

  if (result.hung) {
    if (await retryHungPage(params, "LOAD_ALL_PROGRESS")) return;
    await browser.storage.local.set({ espnAutoLoadAll: false });
    browser.runtime.sendMessage({ type: "LOAD_ALL_DONE", pages: pageNum, hungAborted: true }).catch(() => {});
    return;
  }

  // Never retry this one: a permission-denied page will show the exact same
  // thing on every reload, so retrying (or continuing to walk pages) would
  // just burn through the tab-recycle/retry budgets for nothing.
  if (result.denied) {
    await browser.storage.local.set({ espnAutoLoadAll: false });
    browser.runtime.sendMessage({ type: "LOAD_ALL_DONE", pages: pageNum, denied: true }).catch(() => {});
    return;
  }

  if (result.rawEmpty) {
    await browser.storage.local.set({ espnAutoLoadAll: false });
    browser.runtime.sendMessage({ type: "LOAD_ALL_DONE", pages: pageNum }).catch(() => {});
    return;
  }

  if (pageNum >= LOAD_ALL_MAX_PAGES) {
    await browser.storage.local.set({ espnAutoLoadAll: false });
    browser.runtime.sendMessage({ type: "LOAD_ALL_DONE", pages: pageNum, aborted: true }).catch(() => {});
    return;
  }

  browser.runtime.sendMessage({ type: "LOAD_ALL_PROGRESS", page: pageNum }).catch(() => {});

  await delay(1000); // be polite to ESPN between page loads
  const nextUrl = new URL(location.href);
  nextUrl.searchParams.delete("retry"); // fresh retry budget for the new page
  nextUrl.searchParams.set("page", pageNum + 1);

  if (pageNum % LOAD_TAB_RECYCLE_INTERVAL === 0) {
    await recycleLoadTab("loadAll", nextUrl.toString(), pageNum + 1);
    return; // this tab is about to be closed by background.js
  }

  location.assign(nextUrl.toString());
}

// Load Roster Updates mode: same page-walk pattern as Load All Activity, but a
// separate pipeline entirely (its own scrape function, its own message types,
// never touches the tx queue). The page is pre-filtered server-side to
// transactionType=1 (Moved), so every row on it is already some flavor of
// Roster Update; extractRosterUpdates() then narrows to just the manual ones.
//
// Important: whether to keep paginating is decided from the page's raw row
// count (rawEmpty), not from how many of those rows qualified as manual moves.
// A page can legitimately be "real rows, zero manual moves" (e.g. a day that
// was all CPU auto-moves) without that meaning history has run out.
async function scrapeRosterUpdatesPage(params) {
  const { status } = await waitForActivityResult();
  if (status === "hung") return { rawEmpty: false, qualifyingCount: 0, hung: true };
  if (status === "denied") {
    console.log("[EXT] ESPN denied access to this page (wrong league ID, or logged out of a private league).");
    return { rawEmpty: false, qualifyingCount: 0, denied: true };
  }
  if (status === "empty") {
    console.log("[EXT] Roster Updates: no rows found on this page.");
    return { rawEmpty: true, qualifyingCount: 0 };
  }

  const renames = extractTeamRenames();
  if (renames.length) {
    browser.runtime.sendMessage({ type: "TEAM_RENAME_DETECTED", renames }).catch(() => {});
  }

  const data = extractRosterUpdates();
  const pageNum = parseInt(params.get("page") || "1", 10) || 1;

  if (data.length) {
    browser.runtime.sendMessage({ type: "ROSTER_UPDATE_TRANSACTIONS_APPEND", data, page: pageNum }).catch(() => {});
  }

  console.log("[EXT] Roster Updates page scraped:", data.length, "qualifying (page", pageNum + ")");
  return { rawEmpty: false, qualifyingCount: data.length };
}

async function maybeContinueRosterUpdates(params, result) {
  const { espnAutoLoadRosterUpdates } = await browser.storage.local.get("espnAutoLoadRosterUpdates");
  if (!espnAutoLoadRosterUpdates) return;

  const pageNum = parseInt(params.get("page") || "1", 10) || 1;

  if (result.hung) {
    if (await retryHungPage(params, "ROSTER_UPDATES_PROGRESS")) return;
    await browser.storage.local.set({ espnAutoLoadRosterUpdates: false });
    browser.runtime.sendMessage({ type: "ROSTER_UPDATES_DONE", pages: pageNum, hungAborted: true }).catch(() => {});
    return;
  }

  // Never retry this one: a permission-denied page will show the exact same
  // thing on every reload, so retrying (or continuing to walk pages) would
  // just burn through the tab-recycle/retry budgets for nothing.
  if (result.denied) {
    await browser.storage.local.set({ espnAutoLoadRosterUpdates: false });
    browser.runtime.sendMessage({ type: "ROSTER_UPDATES_DONE", pages: pageNum, denied: true }).catch(() => {});
    return;
  }

  if (result.rawEmpty) {
    await browser.storage.local.set({ espnAutoLoadRosterUpdates: false });
    browser.runtime.sendMessage({ type: "ROSTER_UPDATES_DONE", pages: pageNum }).catch(() => {});
    return;
  }

  if (pageNum >= LOAD_ALL_MAX_PAGES) {
    await browser.storage.local.set({ espnAutoLoadRosterUpdates: false });
    browser.runtime.sendMessage({ type: "ROSTER_UPDATES_DONE", pages: pageNum, aborted: true }).catch(() => {});
    return;
  }

  browser.runtime.sendMessage({ type: "ROSTER_UPDATES_PROGRESS", page: pageNum }).catch(() => {});

  await delay(1000); // be polite to ESPN between page loads
  const nextUrl = new URL(location.href);
  nextUrl.searchParams.delete("retry"); // fresh retry budget for the new page
  nextUrl.searchParams.set("page", pageNum + 1);

  if (pageNum % LOAD_TAB_RECYCLE_INTERVAL === 0) {
    await recycleLoadTab("rosterUpdates", nextUrl.toString(), pageNum + 1);
    return; // this tab is about to be closed by background.js
  }

  location.assign(nextUrl.toString());
}

// ── Draft recap page (draftrecap) ─────────────────────────────────────────────

function parseDraftDatetime() {
  let month, day, year, hour, min;

  const draftData = document.querySelector(".draftData");
  if (!draftData) {
    console.warn("[EXT] Draft: .draftData not found");
    return null;
  }

  for (const span of draftData.querySelectorAll("span")) {
    const keyText = [...span.childNodes]
      .filter(n => n.nodeType === Node.TEXT_NODE)
      .map(n => n.textContent).join("").trim();

    const valText = (span.querySelector("label")?.textContent || "").trim();
    if (!valText) continue;

    if (/Draft Date/i.test(keyText)) {
      // "Tue., Mar. 24, 2026" — skip optional weekday, grab month/day/year
      const dm = valText.match(/(?:\w+\.,?\s+)?(\w+)\.?\s+(\d{1,2}),?\s+(\d{4})/);
      if (dm) {
        month = MONTHS[dm[1]]; // 0-indexed
        day   = parseInt(dm[2]);
        year  = parseInt(dm[3]);
      }
    }

    if (/^Time/i.test(keyText)) {
      // "8:30 PM"
      const tm = valText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (tm) {
        hour = parseInt(tm[1]);
        min  = parseInt(tm[2]);
        const ampm = tm[3].toUpperCase();
        if (ampm === "PM" && hour !== 12) hour += 12;
        if (ampm === "AM" && hour === 12) hour  = 0;
      }
    }
  }

  if (month == null || day == null || !year || hour == null) {
    console.warn("[EXT] Draft: could not parse date/time from page header");
    return null;
  }

  return new Date(year, month, day, hour, min, 0).getTime();
}

async function scrapeDraftPage() {
  let tables;
  try {
    tables = await waitForContent(".draftRecapTable");
  } catch (e) {
    console.warn("[EXT] Draft:", e.message);
    browser.runtime.sendMessage({ type: "DRAFT_LOAD_DONE", count: 0 }).catch(() => {});
    return;
  }

  const draftTs = parseDraftDatetime();
  if (!draftTs) {
    browser.runtime.sendMessage({ type: "DRAFT_LOAD_DONE", count: 0 }).catch(() => {});
    return;
  }

  // Count total picks so we can assign idx values
  let totalPicks = 0;
  for (const table of tables) {
    totalPicks += table.querySelectorAll("tbody tr").length;
  }

  const transactions = [];
  let overallPick = 0;

  for (const table of tables) {
    for (const row of table.querySelectorAll("tbody tr")) {
      overallPick++;

      const playerEl = row.querySelector(".truncate a");
      const teamEl   = row.querySelector(".teamName");
      if (!playerEl || !teamEl) continue;

      const playerName = playerEl.textContent.trim();
      const teamName   = (teamEl.getAttribute("title") || teamEl.textContent).trim();

      // MLB team abbreviation from the fw-normal span: " SEA, " → "SEA"
      const mlbTeamEl = row.querySelector(".fw-normal");
      const mlbTeam   = mlbTeamEl
        ? mlbTeamEl.textContent.trim().replace(/,/g, "").trim()
        : null;

      const player = parseName(playerName);
      if (mlbTeam) player.mlbTeam = mlbTeam;

      // Higher idx = older in background sort (pick 1 is oldest → highest idx)
      const idx = totalPicks - overallPick;

      transactions.push({
        type: "DRFT",
        team: teamName,
        add:  player,
        drop: null,
        date: draftTs,
        idx
      });
    }
  }

  if (!transactions.length) {
    console.log("[EXT] Draft: no picks found");
    browser.runtime.sendMessage({ type: "DRAFT_LOAD_DONE", count: 0 }).catch(() => {});
    return;
  }

  console.log(`[EXT] Draft: ${transactions.length} picks parsed, sending to queue`);
  browser.runtime.sendMessage({ type: "ESPN_TRANSACTIONS_APPEND", data: transactions, page: 0 });
  browser.runtime.sendMessage({ type: "DRAFT_LOAD_DONE", count: transactions.length }).catch(() => {});
}

// ── Watch List page (watchlist) ─────────────────────────────────────────────────

// Writes straight to the playerNotes storage key rather than routing through
// background.js, since Player Notes (unlike the transaction queue) is managed
// entirely in popup.js/storage with no background-side state of its own.
async function scrapeWatchlistPage() {
  let links;
  try {
    links = await waitForContent(".player__column .truncate a");
  } catch (e) {
    console.log("[EXT] Watchlist: no players found.");
    browser.runtime.sendMessage({ type: "WATCHLIST_LOAD_DONE", count: 0, total: 0 }).catch(() => {});
    return;
  }

  const names = [...new Set([...links].map(a => a.textContent.trim()).filter(Boolean))];

  const { playerNotes = [] } = await browser.storage.local.get("playerNotes");
  // Skip names that already have a "Watchlist" note, so re-running this doesn't
  // pile up duplicate entries; a separate manual note for the same player is untouched.
  const alreadyWatchlisted = new Set(
    playerNotes.filter(e => e.note === "Watchlist").map(e => e.name)
  );

  let added = 0;
  names.forEach(name => {
    if (alreadyWatchlisted.has(name)) return;
    playerNotes.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name,
      note: "Watchlist",
      date: Date.now()
    });
    added++;
  });

  if (added > 0) {
    await browser.storage.local.set({ playerNotes });
  }

  console.log(`[EXT] Watchlist: ${names.length} player(s) found, ${added} new note(s) added`);
  browser.runtime.sendMessage({ type: "WATCHLIST_LOAD_DONE", count: added, total: names.length }).catch(() => {});
}

// ── League Settings page (league/settings) ──────────────────────────────────────

// Same "You do not have permission to view this page" check as the activity
// pages (wrong league ID, or logged out of a private league), polled instead
// of relying on waitForContent()'s plain timeout so it's both detected faster
// and reported as a distinct, specific reason rather than a generic failure.
function waitForLeagueSettingsResult(maxMs = 15000) {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      if (document.querySelector(".currentRosterSize")) return resolve({ status: "rows" });
      if ((document.body.innerText || "").includes("You do not have permission to view this page")) {
        return resolve({ status: "denied" });
      }
      if (Date.now() - start > maxMs) return resolve({ status: "timeout" });
      setTimeout(check, 300);
    };
    check();
  });
}

async function scrapeLeagueSettingsPage() {
  const { status } = await waitForLeagueSettingsResult();

  if (status === "denied") {
    console.log("[EXT] League Settings: ESPN denied access to this page.");
    browser.runtime.sendMessage({ type: "LEAGUE_SETTINGS_LOAD_DONE", ok: false, denied: true }).catch(() => {});
    return;
  }
  if (status === "timeout") {
    console.log("[EXT] League Settings: Roster Size not found on page.");
    browser.runtime.sendMessage({ type: "LEAGUE_SETTINGS_LOAD_DONE", ok: false }).catch(() => {});
    return;
  }

  const rosterEls = document.querySelectorAll(".currentRosterSize");
  const rosterSize = parseInt(rosterEls[0].textContent.trim(), 10);

  // "Total on Bench" reads like "5 (3 IL)"; the number in parens is IL slots.
  const benchText = document.querySelector(".totalBench")?.textContent.trim() || "";
  const ilMatch   = benchText.match(/\((\d+)\s*IL\)/i);
  const ilSlots   = ilMatch ? parseInt(ilMatch[1], 10) : null;

  const updates = {};
  if (!isNaN(rosterSize)) updates.rosterSize = rosterSize;
  if (ilSlots !== null)   updates.ilSlots    = ilSlots;

  if (Object.keys(updates).length) {
    await browser.storage.local.set(updates);
  }

  console.log("[EXT] League Settings scraped:", updates);
  browser.runtime.sendMessage({
    type: "LEAGUE_SETTINGS_LOAD_DONE",
    ok: true,
    rosterSize: updates.rosterSize,
    ilSlots: updates.ilSlots
  }).catch(() => {});
}

// ── Entry point ───────────────────────────────────────────────────────────────

(async () => {
  const params      = new URLSearchParams(location.search);
  const urlLeagueId = params.get("leagueId");
  const { espnLeagueId } = await browser.storage.local.get("espnLeagueId");

  if (!espnLeagueId || urlLeagueId !== espnLeagueId) {
    console.log("[EXT] ESPN: skipping scrape — URL leagueId", urlLeagueId, "≠ saved", espnLeagueId || "(none)");
    return;
  }

  if (location.href.includes("draftrecap")) {
    await scrapeDraftPage();
    return;
  }

  if (location.href.includes("watchlist")) {
    await scrapeWatchlistPage();
    return;
  }

  if (location.href.includes("league/settings")) {
    await scrapeLeagueSettingsPage();
    return;
  }

  // Roster Updates mode is determined by this tab's own URL (transactionType=1),
  // not just the espnAutoLoadRosterUpdates flag: that flag is a global storage
  // value, so if Load All Activity and Load Roster Updates were ever running
  // in two different tabs at once, both tabs would see both flags. Keying off
  // the tab's own URL keeps each tab correctly routed to its own mode regardless
  // of what the other tab is doing.
  if (params.get("transactionType") === "1") {
    const { espnAutoLoadRosterUpdates } = await browser.storage.local.get("espnAutoLoadRosterUpdates");

    if (espnAutoLoadRosterUpdates && !params.has("startDate")) {
      const earliest = await findEarliestStartDate();
      if (earliest) {
        const url = new URL(location.href);
        url.searchParams.set("startDate", earliest);
        url.searchParams.set("page", "1");
        location.assign(url.toString());
        return;
      }
      console.log("[EXT] Load Roster Updates: Start Date dropdown not found; continuing with the default window.");
    }

    let result = { rawEmpty: true, qualifyingCount: 0 };
    try {
      result = await scrapeRosterUpdatesPage(params);
    } catch (e) {
      console.log("[EXT] Roster Updates: unexpected error scraping page:", e.message);
    }

    if (espnAutoLoadRosterUpdates) {
      await maybeContinueRosterUpdates(params, result);
    }
    return;
  }

  const { espnAutoLoadAll } = await browser.storage.local.get("espnAutoLoadAll");

  // Load All History: the page defaults to only ~8 days back. Before the first
  // scrape of a run, widen the window to the season's actual start date (read
  // live from the filter dropdown, so this never needs a yearly hardcoded date).
  if (espnAutoLoadAll && !params.has("startDate")) {
    const earliest = await findEarliestStartDate();
    if (earliest) {
      const url = new URL(location.href);
      url.searchParams.set("startDate", earliest);
      url.searchParams.set("page", "1");
      location.assign(url.toString());
      return;
    }
    console.log("[EXT] Load All: Start Date dropdown not found; continuing with the default window.");
  }

  let result = { rawEmpty: true, qualifyingCount: 0 };
  try {
    result = await scrapeActivityPage(params);
  } catch (e) {
    console.log("[EXT] ESPN: unexpected error scraping activity page:", e.message);
  }

  if (espnAutoLoadAll) {
    await maybeContinueLoadAll(params, result);
  } else {
    // Not backfilling: stay on this page and keep it in sync if the user
    // paginates or changes filters manually.
    setupActivityAutoRescan(rowSignature());
  }
})();
