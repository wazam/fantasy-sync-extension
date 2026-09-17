const ESPN_MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
};

// Converts various date shorthands to "YYYY-MM-DD HH:MM".
// Supported inputs:
//   "MM-DD HH:MM"          → current year prepended
//   "Mon Apr 6 6:19 am"    → ESPN activity format
// Returns original string unchanged if nothing matches.
function normalizeToISO(str) {
  // "MM-DD HH:MM" shorthand
  const s = str.trim();
  const mShort = s.match(/^(\d{1,2})-(\d{1,2}) (\d{1,2}):(\d{2})$/);
  if (mShort) {
    const year = new Date().getFullYear();
    return `${year}-${mShort[1].padStart(2,"0")}-${mShort[2].padStart(2,"0")} ${mShort[3].padStart(2,"0")}:${mShort[4]}`;
  }

  const m = s.match(/^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return str;

  const monthNum = ESPN_MONTHS[m[1]];
  if (!monthNum) return str;

  const day  = parseInt(m[2], 10);
  let   hour = parseInt(m[3], 10);
  const min  = m[4];
  const ampm = m[5].toLowerCase();

  if (ampm === "pm" && hour !== 12) hour += 12;
  if (ampm === "am" && hour === 12) hour  = 0;

  const mm = String(monthNum).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");

  return `2026-${mm}-${dd} ${hh}:${min}`;
}

function parseCutoffStr(str) {
  const parts = (str || "2026-03-24 20:30").trim().split(" ");
  const [y, m, d] = parts[0].split("-").map(Number);
  let hour = 0, min = 0;
  if (parts[1]) {
    const tp = parts[1].split(":").map(Number);
    hour = tp[0] || 0;
    min  = tp[1] || 0;
  }
  return new Date(y, m - 1, d, hour, min, 0);
}

function dateToISO(val) {
  const d  = new Date(val);
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  const h  = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${dy} ${h}:${mi}`;
}

function dateToYMD(val) {
  const d  = new Date(val);
  const y  = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}${mo}${dy}`;
}

function formatDate(val) {
  if (!val) return "?";
  const dt = new Date(val);
  if (isNaN(dt)) return "?";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const h    = dt.getHours();
  const mins = dt.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  const h12  = h % 12 || 12;
  return `${months[dt.getMonth()]} ${dt.getDate()} ${h12}:${mins}${ampm}`;
}

// Mirrors txKey() in background.js — used to compute exclude keys in the popup
function txKeyForRow(tx) {
  const t = tx.date ? new Date(tx.date).getTime() : 0;
  if (tx.type === "TRADE") {
    const players = Object.values(tx.sides || {}).flat()
      .map(p => `${p.first}|${p.last}`).sort().join(",");
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

async function loadLeagueIds() {
  const res = await browser.storage.local.get(["espnLeagueId", "fantraxLeagueId", "rosterSize", "ilSlots"]);
  if (res.espnLeagueId)    document.getElementById("espnLeagueId").value    = res.espnLeagueId;
  if (res.fantraxLeagueId) document.getElementById("fantraxLeagueId").value = res.fantraxLeagueId;
  if (res.rosterSize != null) document.getElementById("rosterSize").value = res.rosterSize;
  if (res.ilSlots   != null) document.getElementById("ilSlots").value    = res.ilSlots;
  updateFantraxRosterSize();
  updateLinkButtons(res.espnLeagueId, res.fantraxLeagueId);
}

function updateLinkButtons(espnId, fantraxId) {
  const btnEspn            = document.getElementById("linkEspn");
  const btnLoadAllHistory  = document.getElementById("loadAllHistoryBtn");
  const btnLoadRosterUpdates = document.getElementById("loadRosterUpdatesBtn");
  const btnEspnDraft       = document.getElementById("linkEspnDraft");
  const btnEspnWatchlist   = document.getElementById("linkEspnWatchlist");
  const btnLoadLeagueSettings = document.getElementById("loadLeagueSettingsBtn");
  const btnFantraxRecent   = document.getElementById("linkFantraxRecent");
  const btnFantraxClaim    = document.getElementById("linkFantraxClaim");
  const btnFantraxTrade    = document.getElementById("linkFantraxTrade");
  const btnFantraxImport   = document.getElementById("linkFantraxImport");
  const btnFantraxTrending = document.getElementById("linkFantraxTrending");
  const btnCheckFantraxSettings = document.getElementById("checkFantraxSettingsBtn");

  if (espnId) {
    btnEspn.classList.remove("disabled");
    btnEspn.onclick = () => browser.tabs.create({
      url: `https://fantasy.espn.com/baseball/recentactivity?leagueId=${espnId}`
    });
    btnLoadAllHistory.classList.remove("disabled");
    btnLoadRosterUpdates.classList.remove("disabled");
    btnEspnDraft.classList.remove("disabled");
    btnEspnDraft.onclick = async () => {
      if (draftTabId !== null) {
        // Already loading: this click is "Stop", cancel it by closing the tab it opened.
        browser.tabs.remove(draftTabId).catch(() => {});
        draftTabId = null;
        setDraftLoadingState(false);
        return;
      }
      setDraftLoadingState(true);
      const tab = await browser.tabs.create({
        url: `https://fantasy.espn.com/baseball/league/draftrecap?leagueId=${espnId}`
      });
      draftTabId = tab.id;
    };
    btnEspnWatchlist.classList.remove("disabled");
    btnEspnWatchlist.onclick = async () => {
      if (watchlistTabId !== null) {
        browser.tabs.remove(watchlistTabId).catch(() => {});
        watchlistTabId = null;
        setWatchlistLoadingState(false);
        return;
      }
      setWatchlistLoadingState(true);
      const tab = await browser.tabs.create({
        url: `https://fantasy.espn.com/baseball/watchlist?leagueId=${espnId}`
      });
      watchlistTabId = tab.id;
    };
    btnLoadLeagueSettings.classList.remove("disabled");
    btnLoadLeagueSettings.onclick = async () => {
      if (leagueSettingsTabId !== null) {
        browser.tabs.remove(leagueSettingsTabId).catch(() => {});
        leagueSettingsTabId = null;
        setLeagueSettingsLoadingState(false);
        return;
      }
      setLeagueSettingsLoadingState(true);
      const tab = await browser.tabs.create({
        url: `https://fantasy.espn.com/baseball/league/settings?leagueId=${espnId}`
      });
      leagueSettingsTabId = tab.id;
    };
  } else {
    btnEspn.classList.add("disabled");
    btnEspn.onclick = () => alert("Save your ESPN League ID first.");
    btnLoadAllHistory.classList.add("disabled");
    btnLoadRosterUpdates.classList.add("disabled");
    btnEspnDraft.classList.add("disabled");
    btnEspnDraft.onclick = () => alert("Save your ESPN League ID first.");
    btnEspnWatchlist.classList.add("disabled");
    btnEspnWatchlist.onclick = () => alert("Save your ESPN League ID first.");
    btnLoadLeagueSettings.classList.add("disabled");
    btnLoadLeagueSettings.onclick = () => alert("Save your ESPN League ID first.");
  }

  if (fantraxId) {
    btnFantraxRecent.classList.remove("disabled");
    btnFantraxRecent.onclick = () => browser.tabs.create({
      url: `https://www.fantrax.com/fantasy/league/${fantraxId}/transactions/history`
    });
    btnFantraxClaim.classList.remove("disabled");
    btnFantraxClaim.onclick = () => browser.tabs.create({
      url: `https://www.fantrax.com/newui/fantasy/claimDrop.go?leagueId=${fantraxId}`
    });
    btnFantraxTrade.classList.remove("disabled");
    btnFantraxTrade.onclick = () => browser.tabs.create({
      url: `https://www.fantrax.com/newui/fantasy/trade.go?leagueId=${fantraxId}`
    });
    btnFantraxImport.classList.remove("disabled");
    btnFantraxImport.onclick = () => browser.tabs.create({
      url: `https://www.fantrax.com/newui/fantasy/playerImport.go?leagueId=${fantraxId}`
    });
    btnFantraxTrending.classList.remove("disabled");
    btnFantraxTrending.onclick = () => browser.tabs.create({
      url: `https://www.fantrax.com/fantasy/league/${fantraxId}/players;sortType=OVERVIEW_PLUS_MINUS_PERCENT_OWNED_2;maxResultsPerPage=50`
    });
    btnCheckFantraxSettings.classList.remove("disabled");
    btnCheckFantraxSettings.onclick = async () => {
      if (fantraxSettingsTabId !== null) {
        await browser.storage.local.remove("fantraxSettingsCheckInProgress");
        browser.tabs.remove(fantraxSettingsTabId).catch(() => {});
        fantraxSettingsTabId = null;
        setFantraxSettingsLoadingState(false);
        return;
      }
      setFantraxSettingsLoadingState(true);
      // Gates the roster-settings page's auto-navigation to the Trades tab
      // (fantrax.js) so visiting that page any other way, including just
      // browsing there manually, never gets hijacked into this check's flow.
      await browser.storage.local.set({ fantraxSettingsCheckInProgress: true });
      const tab = await browser.tabs.create({
        url: `https://www.fantrax.com/newui/fantasy/createLeague.go?goto=3&leagueId=${fantraxId}`
      });
      fantraxSettingsTabId = tab.id;
    };
  } else {
    btnFantraxRecent.classList.add("disabled");
    btnFantraxRecent.onclick = () => alert("Save your Fantrax League ID first.");
    btnFantraxClaim.classList.add("disabled");
    btnFantraxClaim.onclick = () => alert("Save your Fantrax League ID first.");
    btnFantraxTrade.classList.add("disabled");
    btnFantraxTrade.onclick = () => alert("Save your Fantrax League ID first.");
    btnFantraxImport.classList.add("disabled");
    btnFantraxImport.onclick = () => alert("Save your Fantrax League ID first.");
    btnFantraxTrending.classList.add("disabled");
    btnFantraxTrending.onclick = () => alert("Save your Fantrax League ID first.");
    btnCheckFantraxSettings.classList.add("disabled");
    btnCheckFantraxSettings.onclick = () => alert("Save your Fantrax League ID first.");
  }

  // Manual Step / Auto Run both act on a Fantrax tab, so they're as unusable
  // without a Fantrax League ID as the Fantrax quick links above; see
  // updateStepNextDisabled() for the full formula (also covers the exclusive
  // operation lock).
  updateStepNextDisabled();
}

function extractEspnId(raw) {
  // Accept a full ESPN URL and pull leagueId=DIGITS, or a bare numeric ID
  const fromUrl = raw.match(/[?&]leagueId=(\d+)/);
  if (fromUrl) return fromUrl[1];
  if (/^\d+$/.test(raw)) return raw;
  return null;
}

function extractFantraxId(raw) {
  // Accept a full Fantrax URL — check path segment "league/ID" first,
  // then query param "leagueId=ID", or a bare alphanumeric ID
  const fromPath  = raw.match(/\/league\/([a-z0-9]+)/i);
  if (fromPath) return fromPath[1];
  const fromQuery = raw.match(/[?&]leagueId=([a-z0-9]+)/i);
  if (fromQuery) return fromQuery[1];
  if (/^[a-z0-9]+$/i.test(raw)) return raw;
  return null;
}

document.getElementById("espnLeagueId").addEventListener("blur", async () => {
  const el  = document.getElementById("espnLeagueId");
  const raw = el.value.trim();
  if (!raw) {
    await browser.storage.local.remove("espnLeagueId");
    const fantraxId = (await browser.storage.local.get("fantraxLeagueId")).fantraxLeagueId || "";
    updateLinkButtons("", fantraxId);
    updateRequiredFieldHighlights();
    return;
  }
  const id = extractEspnId(raw);
  if (!id) {
    alert(`Could not find a numeric ESPN League ID in:\n"${raw}"\n\nPaste an ESPN URL containing leagueId=... or enter the numeric ID directly.`);
    const prev = (await browser.storage.local.get("espnLeagueId")).espnLeagueId || "";
    el.value = prev;
    updateRequiredFieldHighlights();
    return;
  }
  el.value = id;
  const fantraxId = (await browser.storage.local.get("fantraxLeagueId")).fantraxLeagueId || "";
  await browser.storage.local.set({ espnLeagueId: id });
  updateLinkButtons(id, fantraxId);
  updateRequiredFieldHighlights();
});

document.getElementById("espnLeagueId").addEventListener("keydown", e => {
  if (e.key === "Enter") e.target.blur();
});

document.getElementById("fantraxLeagueId").addEventListener("blur", async () => {
  const el  = document.getElementById("fantraxLeagueId");
  const raw = el.value.trim();
  if (!raw) {
    await browser.storage.local.remove("fantraxLeagueId");
    const espnId = (await browser.storage.local.get("espnLeagueId")).espnLeagueId || "";
    updateLinkButtons(espnId, "");
    updateRequiredFieldHighlights();
    return;
  }
  const id = extractFantraxId(raw);
  if (!id) {
    alert(`Could not find a Fantrax League ID in:\n"${raw}"\n\nPaste a Fantrax URL containing /league/... or leagueId=... or enter the alphanumeric ID directly.`);
    const prev = (await browser.storage.local.get("fantraxLeagueId")).fantraxLeagueId || "";
    el.value = prev;
    updateRequiredFieldHighlights();
    return;
  }
  el.value = id;
  const espnId = (await browser.storage.local.get("espnLeagueId")).espnLeagueId || "";
  await browser.storage.local.set({ fantraxLeagueId: id });
  updateLinkButtons(espnId, id);
  updateRequiredFieldHighlights();
});

document.getElementById("fantraxLeagueId").addEventListener("keydown", e => {
  if (e.key === "Enter") e.target.blur();
});

// A single "paste a URL" box above both League ID fields: detects which
// platform the URL belongs to, routes the raw text into that field, and
// re-fires its own blur handler above to do the actual extraction and saving.
document.getElementById("leagueUrlInput").addEventListener("blur", () => {
  const el  = document.getElementById("leagueUrlInput");
  const raw = el.value.trim();
  if (!raw) return;

  let target = null;
  if (/espn\.com/i.test(raw))    target = document.getElementById("espnLeagueId");
  if (/fantrax\.com/i.test(raw)) target = document.getElementById("fantraxLeagueId");

  if (!target) {
    alert(`Could not tell if this is an ESPN or Fantrax URL:\n"${raw}"\n\nPaste a league URL containing espn.com or fantrax.com.`);
    return;
  }

  target.value = raw;
  target.dispatchEvent(new Event("blur"));
  el.value = "";
});

document.getElementById("leagueUrlInput").addEventListener("keydown", e => {
  if (e.key === "Enter") e.target.blur();
});

document.getElementById("espnHomeBtn").addEventListener("click", async () => {
  const { espnLeagueId } = await browser.storage.local.get("espnLeagueId");
  const url = espnLeagueId
    ? `https://fantasy.espn.com/baseball/league?leagueId=${espnLeagueId}`
    : "https://www.espn.com/fantasy/baseball/";
  browser.tabs.create({ url });
});

document.getElementById("fantraxHomeBtn").addEventListener("click", async () => {
  const { fantraxLeagueId } = await browser.storage.local.get("fantraxLeagueId");
  const url = fantraxLeagueId
    ? `https://www.fantrax.com/fantasy/league/${fantraxLeagueId}/home`
    : "https://www.fantrax.com/fantasy/league";
  browser.tabs.create({ url });
});

// ── League settings: Teams / Roster / IL ──────────────────────────────────────

function updateFantraxRosterSize() {
  const roster   = parseInt(document.getElementById("rosterSize").value, 10) || 0;
  const il       = parseInt(document.getElementById("ilSlots").value,    10) || 0;
  const total    = (roster || il) ? roster + il : "";
  const el       = document.getElementById("fantraxRosterSize");
  const previous = el.value;
  el.value = total;
  // Only invalidate an existing check if the requirement actually changed:
  // this runs on every ESPN settings reload even when the numbers come back
  // identical, so a verified field shouldn't flip back to "not checked" just
  // because Load League Settings was clicked again with no real change.
  if (String(previous) !== String(total)) {
    showRosterCheckmark(null);
  }
  updateRequiredFieldHighlights();
}

// Red-outlines whichever of these four fields that gate the rest of the popup
// are currently empty, so it's obvious what's still missing. Max Total Roster
// Size (fantraxRosterSize) isn't here even though it's also red when empty:
// it's driven entirely by its own check-warning state now (red until "Check
// League Settings" actually verifies it), the same as Trade Deadline Date,
// rather than this separate "did an ESPN value flow into it yet" logic.
const REQUIRED_FIELD_IDS = ["espnLeagueId", "rosterSize", "ilSlots", "fantraxLeagueId"];

function updateRequiredFieldHighlights() {
  REQUIRED_FIELD_IDS.forEach(id => {
    const el = document.getElementById(id);
    el.classList.toggle("field-missing", !el.value.trim());
  });

  // Draws the eye to the gear icon itself when either League ID is still
  // unset, since that's the actual prerequisite for the rest of the popup.
  const espnMissing    = !document.getElementById("espnLeagueId").value.trim();
  const fantraxMissing = !document.getElementById("fantraxLeagueId").value.trim();
  document.getElementById("leagueSettingsBtn").classList.toggle("needs-attention", espnMissing || fantraxMissing);
}

function makeNumericSettingSaver(id, storageKey) {
  document.getElementById(id).addEventListener("blur", async () => {
    const el  = document.getElementById(id);
    const raw = el.value.trim();
    if (!raw) { await browser.storage.local.remove(storageKey); updateFantraxRosterSize(); return; }
    const n = parseInt(raw, 10);
    if (isNaN(n) || n < 0) { el.value = ""; await browser.storage.local.remove(storageKey); updateFantraxRosterSize(); return; }
    el.value = n;
    await browser.storage.local.set({ [storageKey]: n });
    updateFantraxRosterSize();
  });
  document.getElementById(id).addEventListener("keydown", e => {
    if (e.key === "Enter") e.target.blur();
  });
}

makeNumericSettingSaver("rosterSize", "rosterSize");
makeNumericSettingSaver("ilSlots",    "ilSlots");

async function loadCutoff() {
  const res = await browser.storage.local.get("cutoff");
  document.getElementById("cutoff").value = res.cutoff || "";
}

async function loadUpperCutoff() {
  const res = await browser.storage.local.get("upperCutoff");
  const val = res.upperCutoff || "";
  document.getElementById("upperCutoff").value = val;
  if (val) browser.runtime.sendMessage({ type: "SET_UPPER_CUTOFF", value: val }).catch(() => {});
}

// ── Drag selection ────────────────────────────────────────────────────────────

let dragState    = null;
let dragOccurred = false;

function updateDragHighlight() {
  if (!dragState?.dragging) return;
  const list     = document.getElementById("queue-list");
  const allRows  = [...list.querySelectorAll(".tx-row")];
  const startIdx = allRows.indexOf(dragState.startRow);
  const endIdx   = dragState.currentRow ? allRows.indexOf(dragState.currentRow) : startIdx;
  const lo = Math.min(startIdx, endIdx >= 0 ? endIdx : startIdx);
  const hi = Math.max(startIdx, endIdx >= 0 ? endIdx : startIdx);
  allRows.forEach((row, idx) => row.classList.toggle("drag-selected", idx >= lo && idx <= hi));
}

function clearDragHighlight() {
  document.querySelectorAll("#queue-list .tx-row.drag-selected")
    .forEach(r => r.classList.remove("drag-selected"));
}

function finalizeDrag() {
  const list     = document.getElementById("queue-list");
  const selected = [...list.querySelectorAll(".tx-row.drag-selected")];
  const dates    = selected.map(r => r.dataset.date).filter(Boolean).sort();
  if (!dates.length) return;
  document.getElementById("cutoff").value      = dates[0];                 // oldest → lower bound
  document.getElementById("upperCutoff").value = dates[dates.length - 1]; // newest → upper bound
  browser.runtime.sendMessage({ type: "SET_UPPER_CUTOFF", value: dates[dates.length - 1] }).catch(() => {});
  renderQueue();
}

function setupDragSelection() {
  const list = document.getElementById("queue-list");

  list.addEventListener("mousedown", e => {
    const row = e.target.closest(".tx-row");
    if (!row || !row.dataset.date) return;
    dragState = { startRow: row, startX: e.clientX, startY: e.clientY, dragging: false };
    e.preventDefault(); // prevent text selection during drag
  });

  document.addEventListener("mousemove", e => {
    if (!dragState) return;
    if (!dragState.dragging) {
      if (Math.abs(e.clientX - dragState.startX) > 5 || Math.abs(e.clientY - dragState.startY) > 5)
        dragState.dragging = true;
    }
    if (dragState.dragging) {
      const row = e.target.closest?.(".tx-row");
      if (row) dragState.currentRow = row;
      updateDragHighlight();
    }
  });

  document.addEventListener("mouseup", () => {
    if (!dragState) return;
    if (dragState.dragging) {
      dragOccurred = true;
      finalizeDrag();
      setTimeout(() => { dragOccurred = false; }, 100);
    }
    clearDragHighlight();
    dragState = null;
  });
}

// "F. LastName" — first initial + period + last name
function shortName(p) {
  const initial = p.first ? p.first[0] + ". " : "";
  return initial + p.last;
}

// ── Queue rendering ───────────────────────────────────────────────────────────

let queueFirstRender = true;
let scrollSaveTimer  = null;

// Set true when a scrape finds transactions but all of them were already
// processed, so the empty-queue message can say that instead of the generic
// "nothing loaded" text, which would otherwise look like the scrape found nothing.
let queueAllAlreadyProcessed = false;

document.getElementById("queue-list").addEventListener("scroll", () => {
  clearTimeout(scrollSaveTimer);
  scrollSaveTimer = setTimeout(() => {
    const top = document.getElementById("queue-list").scrollTop;
    browser.storage.local.set({ queueScrollTop: top });
  }, 300);
});

async function renderQueue() {
  const list      = document.getElementById("queue-list");
  const scrollTop = list.scrollTop; // preserve scroll position across re-renders
  const res  = await browser.runtime.sendMessage({ type: "GET_QUEUE" });
  const { espnLeagueId } = await browser.storage.local.get("espnLeagueId");

  // Keep background upper cutoff in sync with whatever the input shows
  const upperVal = (document.getElementById("upperCutoff")?.value || "").trim();
  if (upperVal) browser.runtime.sendMessage({ type: "SET_UPPER_CUTOFF", value: upperVal }).catch(() => {});

  list.replaceChildren();

  if (!res || !res.queue || !res.queue.length) {
    const queueHeaderLabel = document.getElementById("queue-header-label");
    if (queueHeaderLabel) queueHeaderLabel.textContent = "Transaction Queue";
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = queueAllAlreadyProcessed
      ? "All caught up: the transactions found on that ESPN page were already processed to Fantrax."
      : "No transactions loaded yet.";
    list.appendChild(empty);
    document.getElementById("filterBrokenBtn").classList.remove("broken-alert");
    setQueueBlockedState(false, false, null, null);
    return;
  }

  // The queue actually has content now, so a stale "all already processed"
  // flag shouldn't carry forward into some later empty-queue render.
  queueAllAlreadyProcessed = false;

  const cutoffVal       = document.getElementById("cutoff").value.trim();
  const cutoff          = cutoffVal ? parseCutoffStr(cutoffVal) : null;
  const upperCutoffDate = upperVal  ? parseCutoffStr(upperVal)  : null;
  const excludedSet     = new Set(res.excludedKeys || []);

  // Compute effective next index, mirroring GET_NEXT logic in background
  let nextEffectiveIdx = -1;
  for (let i = res.index; i < res.queue.length; i++) {
    const tx = res.queue[i];
    if (!tx.date) continue;
    const d = new Date(tx.date);
    if (cutoff && d < cutoff) continue;
    if (upperCutoffDate && d > upperCutoffDate) continue;
    if (excludedSet.has(txKeyForRow(tx))) continue;
    nextEffectiveIdx = i;
    break;
  }
  const nextLabel = nextEffectiveIdx >= 0 ? `#${nextEffectiveIdx + 1}` : "none";
  const nextTx    = nextEffectiveIdx >= 0 ? res.queue[nextEffectiveIdx] : null;
  setQueueBlockedState(
    !!nextTx?.broken,
    !!nextTx?.needsManualPick,
    nextTx ? txKeyForRow(nextTx) : null,
    nextTx?.manualPickReason
  );

  // Glows amber whenever any broken row exists anywhere in the queue (matching
  // what the filter button itself shows when clicked), not just when one is
  // blocking the very next transaction, so it's clear a fix is needed somewhere
  // before automation can run cleanly through the whole queue.
  document.getElementById("filterBrokenBtn").classList.toggle("broken-alert", res.queue.some(tx => tx.broken));

  const queueHeaderLabel = document.getElementById("queue-header-label");
  if (queueHeaderLabel) {
    queueHeaderLabel.textContent = `${res.queue.length} transactions \u2014 next: ${nextLabel}`;
  }

  [...res.queue].reverse().forEach((tx, revIdx) => {
    const i      = res.queue.length - 1 - revIdx; // remap to original queue index
    const txDate = tx.date ? new Date(tx.date) : null;
    const txKey  = txKeyForRow(tx);

    const isCutoff   = txDate && cutoff && txDate < cutoff;
    const isAbove    = txDate && upperCutoffDate && txDate > upperCutoffDate;
    const isExcluded = excludedSet.has(txKey);
    const isBroken   = !!tx.broken;
    const isDone     = i < res.index && !isCutoff && !isAbove && !isExcluded;

    const cls = "tx-row"
      + (isCutoff   ? " tx-cutoff"   : "")
      + (isAbove    ? " tx-above"    : "")
      + (isDone     ? " tx-done"     : "")
      + (isExcluded ? " tx-excluded" : "")
      + (isBroken   ? " tx-broken"   : "");

    function makeRow(dateText, typeText, teamText) {
      const row = document.createElement("div");
      row.className = cls;
      row.dataset.txKey = txKey;
      if (isBroken) {
        // ESPN's page was missing a player's identity for this transaction;
        // clicking opens the fixer instead of the usual cutoff/exclude actions.
        row.title = "ESPN's page was missing this player's info. Click to fix and unblock.";
        row.style.cursor = "pointer";
        row.addEventListener("click", () => openFixBrokenModal(tx, txKey));
      } else if (txDate) {
        row.dataset.date = dateToISO(txDate);
        row.title = "Click: set lower cutoff | Ctrl+click: exclude/include | Drag: set range";
        row.style.cursor = "pointer";
        row.addEventListener("click", async e => {
          if (dragOccurred) return;
          if (e.ctrlKey) {
            e.preventDefault();
            browser.runtime.sendMessage({ type: "TOGGLE_EXCLUDE", key: txKey })
              .then(() => renderQueue());
            return;
          }
          const value = dateToISO(txDate);
          document.getElementById("cutoff").value = value;
          await browser.storage.local.set({ cutoff: value });
          renderQueue();
        });
      }
      const d = document.createElement("span"); d.className = "tx-date"; d.textContent = dateText;
      const t = document.createElement("span"); t.className = "tx-type"; t.textContent = typeText;
      const m = document.createElement("span"); m.className = "tx-team"; m.textContent = teamText;
      if (teamText) m.title = teamText;
      const p = document.createElement("span"); p.className = "tx-players";
      row.appendChild(d); row.appendChild(t); row.appendChild(m); row.appendChild(p);

      if (isBroken && txDate && espnLeagueId) {
        const link = document.createElement("a");
        link.className = "tx-espn-link";
        link.href = "#";
        link.textContent = "↗";
        link.title = `Open ESPN Recent Activity filtered to this day, to help find and fix ${teamText || "this team"}'s broken transaction`;
        link.addEventListener("click", e => {
          e.preventDefault();
          e.stopPropagation();
          const ymd = dateToYMD(txDate);
          browser.tabs.create({
            url: `https://fantasy.espn.com/baseball/recentactivity?leagueId=${espnLeagueId}&startDate=${ymd}&endDate=${ymd}`
          });
        });
        row.appendChild(link);
      }

      return { row, playersSpan: p };
    }

    function addPlayerToken(span, text, tokenCls) {
      const s = document.createElement("span");
      s.className = tokenCls;
      s.textContent = text;
      span.appendChild(s);
      span.appendChild(document.createTextNode(" "));
    }

    if (tx.type === "TRADE" && tx.teams && tx.sides) {
      const [teamA, teamB] = tx.teams;
      const aGives = tx.sides[teamA] || [];
      const bGives = tx.sides[teamB] || [];
      const tradePlayers = [...aGives, ...bGives].map(p => `${p.first} ${p.last}`).join(" ");

      // Row 1 — Team A: receives bGives (+), gives aGives (-)
      const r1 = makeRow(formatDate(tx.date), "TRD", teamA);
      r1.row.dataset.players = tradePlayers;
      bGives.forEach(p => addPlayerToken(r1.playersSpan, `+${shortName(p)}`, "add"));
      aGives.forEach(p => addPlayerToken(r1.playersSpan, `-${shortName(p)}`, "drop"));
      r1.playersSpan.title = [
        ...bGives.map(p => `+${p.first} ${p.last}`),
        ...aGives.map(p => `-${p.first} ${p.last}`)
      ].join("  ");
      list.appendChild(r1.row);

      // Row 2 — Team B: receives aGives (+), gives bGives (-)
      const r2 = makeRow("", "", teamB);
      r2.row.dataset.players = tradePlayers;
      aGives.forEach(p => addPlayerToken(r2.playersSpan, `+${shortName(p)}`, "add"));
      bGives.forEach(p => addPlayerToken(r2.playersSpan, `-${shortName(p)}`, "drop"));
      r2.playersSpan.title = [
        ...aGives.map(p => `+${p.first} ${p.last}`),
        ...bGives.map(p => `-${p.first} ${p.last}`)
      ].join("  ");
      list.appendChild(r2.row);

    } else {
      const typeLabel = tx.type === "ADD_DROP" ? "A+D" : (tx.type || "?");
      const { row, playersSpan } = makeRow(formatDate(tx.date), typeLabel, tx.team || "");
      row.dataset.players = [
        tx.add  ? `${tx.add.first} ${tx.add.last}`   : null,
        tx.drop ? `${tx.drop.first} ${tx.drop.last}` : null
      ].filter(Boolean).join(" ");

      if (tx.add)  addPlayerToken(playersSpan, tx.add.broken  ? "+⚠ missing" : `+${shortName(tx.add)}`,  "add");
      if (tx.drop) addPlayerToken(playersSpan, tx.drop.broken ? "-⚠ missing" : `-${shortName(tx.drop)}`, "drop");
      const playerTitle = [
        tx.add  ? (tx.add.broken  ? "+ missing (ESPN bug)" : `+${tx.add.first} ${tx.add.last}`)  : null,
        tx.drop ? (tx.drop.broken ? "- missing (ESPN bug)" : `-${tx.drop.first} ${tx.drop.last}`) : null
      ].filter(Boolean).join("  ");
      if (playerTitle) playersSpan.title = playerTitle;

      list.appendChild(row);
    }
  });

  if (queueFirstRender) {
    queueFirstRender = false;
    const { queueScrollTop } = await browser.storage.local.get("queueScrollTop");
    if (queueScrollTop) { list.scrollTop = queueScrollTop; applyQueueFilters(); return; }
  }
  list.scrollTop = scrollTop;
  applyQueueFilters();
}

// ── Queue search + "broken only" filter ─────────────────────────────────────────
// Combined into one function since both narrow the same row set by toggling the
// same style.display; applying them separately would let one clobber the other.

let showOnlyBroken = false;

function applyQueueFilters() {
  const input = document.getElementById("queueSearchInput");
  const q = (input?.value || "").trim().toLowerCase();
  document.querySelectorAll("#queue-list .tx-row").forEach(row => {
    const players = (row.dataset.players || "").toLowerCase();
    const matchesSearch = !q || players.includes(q);
    const matchesBroken = !showOnlyBroken || row.classList.contains("tx-broken");
    row.style.display = (matchesSearch && matchesBroken) ? "" : "none";
  });
}

document.getElementById("filterBrokenBtn").addEventListener("click", () => {
  showOnlyBroken = !showOnlyBroken;
  document.getElementById("filterBrokenBtn").classList.toggle("active", showOnlyBroken);
  applyQueueFilters();
});

(function setupQueueSearch() {
  const btn   = document.getElementById("queueSearchBtn");
  const input = document.getElementById("queueSearchInput");

  btn.addEventListener("click", () => {
    const visible = input.style.display === "block";
    if (visible) {
      input.style.display = "none";
      input.value = "";
      applyQueueFilters();
    } else {
      input.style.display = "block";
      input.focus();
    }
  });

  input.addEventListener("input", applyQueueFilters);

  input.addEventListener("blur", () => {
    input.style.display = "none";
    input.value = "";
    applyQueueFilters();
  });
})();

// ── Processed History ───────────────────────────────────────────────────────────
// A read-only view, so this deliberately doesn't reuse renderQueue()'s row
// builder: that logic is tightly coupled to live-queue interactions (setting
// the cutoff, excluding, fixing a broken row) that don't apply to history.
async function renderProcessedHistory() {
  const list  = document.getElementById("processedHistoryList");
  const res   = await browser.runtime.sendMessage({ type: "GET_PROCESSED_LOG" });
  const log   = res?.processedTxLog || [];
  const query = document.getElementById("processedHistorySearchInput").value.trim().toLowerCase();

  list.replaceChildren();

  if (!log.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No transactions have been processed yet.";
    list.appendChild(empty);
    return;
  }

  function addToken(span, text, tokenCls) {
    const s = document.createElement("span");
    s.className = tokenCls;
    s.textContent = text;
    span.appendChild(s);
    span.appendChild(document.createTextNode(" "));
  }

  function makeRow(dateText, typeText, teamText) {
    const row = document.createElement("div");
    row.className = "tx-row";
    const d = document.createElement("span"); d.className = "tx-date"; d.textContent = dateText;
    const t = document.createElement("span"); t.className = "tx-type"; t.textContent = typeText;
    const m = document.createElement("span"); m.className = "tx-team"; m.textContent = teamText;
    if (teamText) m.title = teamText;
    const p = document.createElement("span"); p.className = "tx-players";
    row.appendChild(d); row.appendChild(t); row.appendChild(m); row.appendChild(p);
    return { row, playersSpan: p };
  }

  let shown = 0;

  [...log].reverse().forEach(tx => {
    const rows = [];

    if (tx.type === "TRADE" && tx.teams && tx.sides) {
      const [teamA, teamB] = tx.teams;
      const aGives = tx.sides[teamA] || [];
      const bGives = tx.sides[teamB] || [];
      const players = [...aGives, ...bGives].map(p => `${p.first} ${p.last}`).join(" ");

      const r1 = makeRow(formatDate(tx.date), "TRD", teamA);
      bGives.forEach(p => addToken(r1.playersSpan, `+${shortName(p)}`, "add"));
      aGives.forEach(p => addToken(r1.playersSpan, `-${shortName(p)}`, "drop"));
      r1.playersSpan.title = [
        ...bGives.map(p => `+${p.first} ${p.last}`),
        ...aGives.map(p => `-${p.first} ${p.last}`)
      ].join("  ");
      rows.push({ row: r1.row, players, team: teamA });

      const r2 = makeRow("", "", teamB);
      aGives.forEach(p => addToken(r2.playersSpan, `+${shortName(p)}`, "add"));
      bGives.forEach(p => addToken(r2.playersSpan, `-${shortName(p)}`, "drop"));
      r2.playersSpan.title = [
        ...aGives.map(p => `+${p.first} ${p.last}`),
        ...bGives.map(p => `-${p.first} ${p.last}`)
      ].join("  ");
      rows.push({ row: r2.row, players, team: teamB });
    } else {
      const typeLabel = tx.type === "ADD_DROP" ? "A+D" : (tx.type || "?");
      const { row, playersSpan } = makeRow(formatDate(tx.date), typeLabel, tx.team || "");
      if (tx.add)  addToken(playersSpan, `+${shortName(tx.add)}`,  "add");
      if (tx.drop) addToken(playersSpan, `-${shortName(tx.drop)}`, "drop");
      const players = [
        tx.add  ? `${tx.add.first} ${tx.add.last}`   : null,
        tx.drop ? `${tx.drop.first} ${tx.drop.last}` : null
      ].filter(Boolean).join(" ");
      const playerTitle = [
        tx.add  ? `+${tx.add.first} ${tx.add.last}`  : null,
        tx.drop ? `-${tx.drop.first} ${tx.drop.last}` : null
      ].filter(Boolean).join("  ");
      if (playerTitle) playersSpan.title = playerTitle;
      rows.push({ row, players, team: tx.team || "" });
    }

    const matches = !query || rows.some(r =>
      r.players.toLowerCase().includes(query) || r.team.toLowerCase().includes(query)
    );
    if (!matches) return;

    rows.forEach(r => list.appendChild(r.row));
    shown++;
  });

  if (shown === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No processed transactions match your search.";
    list.appendChild(empty);
  }
}

document.getElementById("processedHistoryBtn").addEventListener("click", () => {
  document.getElementById("processedHistoryModal").hidden = false;
  document.getElementById("processedHistorySearchInput").value = "";
  renderProcessedHistory();
});

document.getElementById("processedHistoryCloseBtn").addEventListener("click", () => {
  document.getElementById("processedHistoryModal").hidden = true;
});

document.getElementById("processedHistorySearchInput").addEventListener("input", renderProcessedHistory);

// ── Cutoff inputs: save on blur or Enter ──────────────────────────────────────

const CUTOFF_FORMAT_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

function isValidCutoffFormat(val) {
  return CUTOFF_FORMAT_RE.test(val);
}

async function saveCutoff() {
  const el  = document.getElementById("cutoff");
  const raw = el.value.trim();

  if (!raw) {
    await browser.storage.local.remove("cutoff");
    renderQueue();
    return;
  }

  const converted = normalizeToISO(raw);
  if (!isValidCutoffFormat(converted)) {
    alert(`Invalid date format: "${raw}"\nMust be: YYYY-MM-DD HH:MM`);
    const prev = (await browser.storage.local.get("cutoff")).cutoff || "";
    el.value = prev;
    return;
  }

  el.value = converted;
  await browser.storage.local.set({ cutoff: converted });
  renderQueue();
}

async function saveUpperCutoff() {
  const el  = document.getElementById("upperCutoff");
  const raw = el.value.trim();

  if (!raw) {
    await browser.storage.local.remove("upperCutoff");
    browser.runtime.sendMessage({ type: "SET_UPPER_CUTOFF", value: null }).catch(() => {});
    renderQueue();
    return;
  }

  const converted = normalizeToISO(raw);
  if (!isValidCutoffFormat(converted)) {
    alert(`Invalid date format: "${raw}"\nMust be: YYYY-MM-DD HH:MM`);
    const prev = (await browser.storage.local.get("upperCutoff")).upperCutoff || "";
    el.value = prev;
    return;
  }

  el.value = converted;
  await browser.storage.local.set({ upperCutoff: converted });
  browser.runtime.sendMessage({ type: "SET_UPPER_CUTOFF", value: converted }).catch(() => {});
  renderQueue();
}

document.getElementById("cutoff").addEventListener("blur",    saveCutoff);
document.getElementById("upperCutoff").addEventListener("blur", saveUpperCutoff);

document.getElementById("cutoff").addEventListener("keydown",    e => { if (e.key === "Enter") e.target.blur(); });
document.getElementById("upperCutoff").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });

// Clears both date bounds outright rather than snapshotting the queue's current
// oldest/newest dates: a snapshot goes stale the same way the old upper cutoff
// did the moment something outside that range gets scraped in later.
document.getElementById("clearFiltersBtn").onclick = async () => {
  document.getElementById("cutoff").value      = "";
  document.getElementById("upperCutoff").value = "";
  await browser.storage.local.remove(["cutoff", "upperCutoff"]);
  browser.runtime.sendMessage({ type: "SET_UPPER_CUTOFF", value: null }).catch(() => {});
  renderQueue();
};

document.getElementById("clearQueueBtn").onclick = async () => {
  if (!confirm("Clear the transaction queue?\n\nRe-scrape ESPN pages to reload it.")) return;
  await browser.runtime.sendMessage({ type: "CLEAR_QUEUE" });
  queueAllAlreadyProcessed = false;
  renderQueue();
};

// Step and Auto Run double as Stop while running: clicking either one halts
// Auto Run, so there's no separate dedicated Stop button to hunt for.
let autoRunningState = false;

// Tracks whether the next transaction due to be processed is broken or needs
// a manual pick (set by renderQueue() on every refresh), so Step/Auto Run can
// swap their normal idle label for a state-specific one until it's resolved.
let queueBlockedByBroken     = false;
let queueNeedsManualPick     = false;
let manualPickTxKey          = null;
let manualPickReason         = null;

function applyIdleButtonLabels() {
  const stepBtn = document.getElementById("step");
  const nextBtn = document.getElementById("next");
  stepBtn.classList.toggle("blocked", queueBlockedByBroken);
  nextBtn.classList.toggle("blocked", queueBlockedByBroken);
  // Red, matching the badge's "needs manual pick" color: distinct from the
  // amber "blocked" state since this one is actionable by clicking the button
  // itself (skips the flagged row), unlike a broken row which needs the Fix
  // Broken modal first.
  stepBtn.classList.toggle("pending-skip", queueNeedsManualPick);
  nextBtn.classList.toggle("pending-skip", queueNeedsManualPick);
  // "primary" (Auto Run's blue idle look) only applies in the true default
  // state. Leaving it on permanently while blocked/pending-skip is also set
  // caused a real bug: .primary's higher-specificity :hover rule was winning
  // over the state color on hover, and its border:none vs the other button's
  // bordered default caused a 2px height mismatch between the two buttons.
  nextBtn.classList.toggle("primary", !queueBlockedByBroken && !queueNeedsManualPick);

  if (queueBlockedByBroken) {
    stepBtn.textContent = "⚠ Fix Needed";
    nextBtn.textContent = "⚠ Fix Needed";
    stepBtn.title = nextBtn.title =
      "A transaction in the queue is broken and needs a manual fix. Click its highlighted row in the Transaction Queue.";
  } else if (queueNeedsManualPick) {
    stepBtn.textContent = "⏭ Skip & Continue";
    nextBtn.textContent = "⏭ Skip & Continue";
    stepBtn.title = nextBtn.title = manualPickReason
      ? `${manualPickReason} Click to skip it here and continue.`
      : "The next transaction needs a manual pick on Fantrax (ambiguous or not found). " +
        "Once you've completed it there yourself, click to skip it here and continue.";
  } else {
    stepBtn.textContent = "▶ Manual Step";
    nextBtn.textContent = "▶ Auto Run";
    stepBtn.title = "Process the next transaction in the queue, navigating to the right Fantrax page if needed";
    nextBtn.title = "Process every transaction in range automatically";
  }
}

function setQueueBlockedState(broken, needsManualPick, txKey, reason) {
  queueBlockedByBroken = broken;
  queueNeedsManualPick = !broken && needsManualPick;
  manualPickTxKey      = queueNeedsManualPick ? txKey : null;
  manualPickReason     = queueNeedsManualPick ? reason : null;
  if (!autoRunningState) applyIdleButtonLabels();
}

// ── Exclusive operation lock ─────────────────────────────────────────────────
// Only one long-running ESPN/Fantrax operation (any Load button, Manual Step,
// or Auto Run) should run at a time: they all drive the same active tab through
// page navigations, and two running at once would just stomp on each other.
// Whichever one is active keeps its own button working (that's how you stop
// it); every other button in this set gets disabled until it finishes.
// step/next aren't in this list: they share their own disabled formula below,
// since they already have an independent Fantrax-League-ID requirement and a
// dual-stop exception (either one can stop Auto Run) that this simple
// "only the active one stays enabled" rule doesn't account for.
const EXCLUSIVE_BUTTON_IDS = [
  "loadAllHistoryBtn", "loadRosterUpdatesBtn", "linkEspnDraft", "linkEspnWatchlist",
  "loadLeagueSettingsBtn", "checkFantraxSettingsBtn"
];
let exclusiveRunningId = null;

function applyExclusiveLock() {
  EXCLUSIVE_BUTTON_IDS.forEach(id => {
    const btn = document.getElementById(id);
    if (btn) btn.disabled = exclusiveRunningId !== null && exclusiveRunningId !== id;
  });
  updateStepNextDisabled();
}

// Manual Step and Auto Run share one formula: locked out while the Fantrax
// League ID isn't set, OR while some OTHER exclusive operation (a Load button,
// or the other one of this pair mid-step) is running. The one exception is
// Auto Run itself ("next"): while it's active, both stay enabled since either
// button doubles as its Stop.
function updateStepNextDisabled() {
  const fantraxId    = document.getElementById("fantraxLeagueId").value.trim();
  const missingId    = !fantraxId && !autoRunningState;
  const lockedByOther = exclusiveRunningId !== null && exclusiveRunningId !== "next";
  document.getElementById("step").disabled = missingId || lockedByOther;
  document.getElementById("next").disabled = missingId || lockedByOther;
}

function setExclusiveRunning(id) {
  exclusiveRunningId = id;
  applyExclusiveLock();
}

// Only clears the lock if this call is for whoever's actually holding it, so a
// stray "done" from an operation that never acquired it (or already lost it)
// can't clobber a different one that's now running.
function clearExclusiveRunning(id) {
  if (exclusiveRunningId === id) {
    exclusiveRunningId = null;
    applyExclusiveLock();
  }
}

function setAutoMode(running) {
  autoRunningState = running;
  const stepBtn = document.getElementById("step");
  const nextBtn = document.getElementById("next");
  stepBtn.classList.toggle("active", running);
  nextBtn.classList.toggle("active", running);
  if (running) {
    stepBtn.classList.remove("blocked");
    nextBtn.classList.remove("blocked");
    stepBtn.classList.remove("pending-skip");
    nextBtn.classList.remove("pending-skip");
    nextBtn.classList.remove("primary");
    stepBtn.textContent = "■ Stop";
    nextBtn.textContent = "■ Stop";
    stepBtn.title = nextBtn.title = "Auto Run is in progress. Click either button to stop.";
    setExclusiveRunning("next");
  } else {
    clearExclusiveRunning("next");
    applyIdleButtonLabels();
  }
}

document.getElementById("step").onclick = async () => {
  if (autoRunningState) {
    browser.runtime.sendMessage({ type: "STOP_AUTO" });
    setAutoMode(false);
    return;
  }
  if (queueNeedsManualPick && manualPickTxKey) {
    await browser.runtime.sendMessage({ type: "EXCLUDE_KEY", key: manualPickTxKey });
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  // Manual Step has no dedicated "done" message of its own; its one-shot lock
  // is released by whichever of QUEUE_UPDATED / AUTO_ERROR / AUTO_STOPPED
  // arrives first, since every outcome of a step funnels through one of those.
  setExclusiveRunning("step");
  browser.runtime.sendMessage({ type: "START_STEP", tabId: tab.id });
};

document.getElementById("next").onclick = async () => {
  if (autoRunningState) {
    browser.runtime.sendMessage({ type: "STOP_AUTO" });
    setAutoMode(false);
    return;
  }
  if (queueNeedsManualPick && manualPickTxKey) {
    await browser.runtime.sendMessage({ type: "EXCLUDE_KEY", key: manualPickTxKey });
  }
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  setAutoMode(true);
  browser.runtime.sendMessage({ type: "START_AUTO", tabId: tab.id });
};

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "QUEUE_UPDATED")  { clearExclusiveRunning("step"); renderQueue(); }
  if (msg.type === "CUTOFF_SAVED")   renderQueue();
  if (msg.type === "ESPN_ALL_ALREADY_PROCESSED") {
    queueAllAlreadyProcessed = true;
    renderQueue();
  }
  if (msg.type === "AUTO_ERROR")   { clearExclusiveRunning("step"); setAutoMode(false); alert(msg.message); }
  if (msg.type === "AUTO_STOPPED")   { clearExclusiveRunning("step"); setAutoMode(false); }
  if (msg.type === "LOAD_TAB_RECYCLED") {
    // The tab was closed and replaced (background.js does this every 20 pages
    // to shed accumulated per-tab browser overhead); keep the tracked id in
    // sync so Stop still closes the right tab.
    if (msg.kind === "loadAll") loadAllTabId = msg.tabId;
    else loadRosterUpdatesTabId = msg.tabId;
  }
  if (msg.type === "LOAD_ALL_PROGRESS") {
    setLoadAllButton(true, msg.retrying ? `${msg.page} (retrying ${msg.retry}/3)` : msg.page);
  }
  if (msg.type === "LOAD_ALL_DONE") {
    loadAllTabId = null;
    browser.runtime.sendMessage({ type: "UNWATCH_LOAD_TAB" }).catch(() => {});
    setLoadAllButton(false);
    if (msg.denied) alert(`Load All Activity stopped on page ${msg.pages}: ESPN said you don't have permission to view this page. Check that the ESPN League ID is correct and that you're logged into ESPN as a member of this league.`);
    else if (msg.hungAborted) alert(`Load All Activity stopped: ESPN stopped responding on page ${msg.pages} after several retries. Try again later.`);
    else if (msg.aborted) alert(`Load All Activity stopped after ${msg.pages} pages (safety limit reached).`);
  }
  if (msg.type === "ROSTER_UPDATES_PROGRESS") {
    setLoadRosterUpdatesButton(true, msg.retrying ? `${msg.page} (retrying ${msg.retry}/3)` : msg.page);
  }
  if (msg.type === "ROSTER_UPDATES_DONE") {
    loadRosterUpdatesTabId = null;
    browser.runtime.sendMessage({ type: "UNWATCH_LOAD_TAB" }).catch(() => {});
    setLoadRosterUpdatesButton(false);
    if (msg.denied) alert(`Load Roster Updates stopped on page ${msg.pages}: ESPN said you don't have permission to view this page. Check that the ESPN League ID is correct and that you're logged into ESPN as a member of this league.`);
    else if (msg.hungAborted) alert(`Load Roster Updates stopped: ESPN stopped responding on page ${msg.pages} after several retries. Try again later.`);
    else if (msg.aborted) alert(`Load Roster Updates stopped after ${msg.pages} pages (safety limit reached).`);
  }
  if (msg.type === "UPPER_CUTOFF_CLEARED") {
    document.getElementById("upperCutoff").value = "";
    renderQueue();
  }
  if (msg.type === "DRAFT_LOAD_DONE") {
    draftTabId = null;
    setDraftLoadingState(false);
    renderQueue();
  }
  if (msg.type === "WATCHLIST_LOAD_DONE") {
    watchlistTabId = null;
    setWatchlistLoadingState(false);
    // Refresh the notes list live if the Player Notes modal happens to be open.
    if (!document.getElementById("notesModal").hidden) refreshNotesView();
  }
  if (msg.type === "LEAGUE_SETTINGS_LOAD_DONE") {
    leagueSettingsTabId = null;
    setLeagueSettingsLoadingState(false);
    const rosterCheckEl = document.getElementById("rosterSizeCheckmark");
    const ilCheckEl     = document.getElementById("ilSlotsCheckmark");
    if (msg.ok) {
      rosterCheckEl.hidden = true;
      ilCheckEl.hidden = true;
      if (msg.rosterSize != null) document.getElementById("rosterSize").value = msg.rosterSize;
      if (msg.ilSlots    != null) document.getElementById("ilSlots").value    = msg.ilSlots;
      updateFantraxRosterSize();
    } else {
      // Red X on both fields: whatever they currently show couldn't be
      // confirmed against ESPN just now, so it's obvious at a glance which
      // values might be stale rather than only finding out via the alert.
      const reason = msg.denied
        ? "ESPN said you don't have permission to view this page. Check that the ESPN League ID is correct and that you're logged into ESPN as a member of this league."
        : "Could not read this value from the page. Make sure you're logged into ESPN and the league ID is correct.";
      [rosterCheckEl, ilCheckEl].forEach(el => {
        el.textContent = "✗";
        el.style.color = "#c00";
        el.title = reason;
        el.hidden = false;
      });
      alert(msg.denied ? `Could not load League Settings: ${reason}` : "Could not read league settings from the page. Make sure you're logged into ESPN and the league ID is correct.");
    }
  }
  if (msg.type === "FANTRAX_SETTINGS_CHECK_DONE") {
    fantraxSettingsTabId = null;
    setFantraxSettingsLoadingState(false);
    if (msg.ok) {
      showRosterCheckmark(msg.maxTotal);
      showTradeDeadlineCheckmark(msg.tradeDeadline);
      // Persisted so the result survives closing and reopening the popup,
      // rather than resetting to "not checked" every time. requiredAtCheck
      // is what lets a reload tell "still valid" from "stale": if the ESPN
      // roster/IL values (and so the computed requirement) changed since,
      // the comparison in restoreFantraxCheckState() won't match and it
      // correctly falls back to pending instead of showing a stale result.
      const required = parseInt(document.getElementById("fantraxRosterSize").value, 10);
      browser.storage.local.set({
        fantraxLastCheck: {
          maxTotal: msg.maxTotal,
          requiredAtCheck: isNaN(required) ? null : required,
          tradeDeadline: msg.tradeDeadline
        }
      });
    } else {
      alert("Could not read league settings from the page. Make sure you're logged into Fantrax and the league ID is correct.");
    }
  }
});

// Draft Recap is a one-shot full-page parse (not a multi-page walk like Load All
// Activity). Tracks the tab it opened so a second click while loading can act as
// Stop by closing that tab, instead of opening yet another one.
let draftTabId = null;

function setDraftLoadingState(loading) {
  const btn = document.getElementById("linkEspnDraft");
  btn.classList.toggle("active", loading);
  btn.textContent = loading ? "■ Stop" : "▶ Load Draft Recap";
  btn.title = loading
    ? "Cancel loading the draft recap"
    : "Open the ESPN Draft Recap page and load every pick into the queue";
  if (loading) setExclusiveRunning(btn.id); else clearExclusiveRunning(btn.id);
}

// Same one-shot pattern as Load Draft Recap: tracks the tab it opened so a
// second click while loading acts as Stop by closing that tab.
let watchlistTabId = null;

function setWatchlistLoadingState(loading) {
  const btn = document.getElementById("linkEspnWatchlist");
  btn.classList.toggle("active", loading);
  btn.textContent = loading ? "■ Stop" : "▶ Load Watch List";
  btn.title = loading
    ? "Cancel loading the watch list"
    : "Open the ESPN Watch List page and add every player to Player Notes";
  if (loading) setExclusiveRunning(btn.id); else clearExclusiveRunning(btn.id);
}

let leagueSettingsTabId = null;

function setLeagueSettingsLoadingState(loading) {
  const btn = document.getElementById("loadLeagueSettingsBtn");
  btn.classList.toggle("active", loading);
  btn.textContent = loading ? "■ Stop" : "▶ Load League Settings";
  btn.title = loading
    ? "Cancel loading league settings"
    : "Open the ESPN League Settings page and fill in Roster Size / IL Bench Size below";
  if (loading) setExclusiveRunning(btn.id); else clearExclusiveRunning(btn.id);
}

let fantraxSettingsTabId = null;

function setFantraxSettingsLoadingState(loading) {
  const btn = document.getElementById("checkFantraxSettingsBtn");
  btn.classList.toggle("active", loading);
  btn.textContent = loading ? "■ Stop" : "▶ Check League Settings";
  btn.title = loading
    ? "Cancel checking league settings"
    : "Open Fantrax League Roster Settings and confirm Max Total Players covers your ESPN roster + IL";
  if (loading) setExclusiveRunning(btn.id); else clearExclusiveRunning(btn.id);
}

// Compares Fantrax's Max Total Players against ESPN roster size + IL slots.
// The value field itself stays red (.check-warning) as the "not verified"
// signal until a check actually confirms it's fine, at which point it clears
// and a green checkmark (or a red ✗ with the numbers, if Fantrax falls short)
// appears next to it.
function showRosterCheckmark(maxTotal) {
  const el      = document.getElementById("fantraxRosterCheckmark");
  const valueEl = document.getElementById("fantraxRosterSize");
  const required = parseInt(valueEl.value, 10);

  if (isNaN(required) || maxTotal == null || isNaN(maxTotal)) {
    valueEl.classList.add("check-warning");
    el.textContent = "";
    el.style.color = "";
    el.title = "Not checked yet. Click Check League Settings.";
    return;
  }

  const ok = maxTotal >= required;
  valueEl.classList.toggle("check-warning", !ok);
  el.textContent = ok ? "✓" : "✗";
  el.style.color = ok ? "#0a0" : "#c00";
  el.title = ok
    ? `Fantrax Max Total Players (${maxTotal}) covers the required ${required}.`
    : `Fantrax Max Total Players (${maxTotal}) is below the required ${required}.`;
}

// A set Trade Deadline Date makes Fantrax reject any trade replayed after that
// date outright, which silently used to get marked processed anyway even
// though the trade never actually went through. Blank is the only safe value
// for a league mirroring historical data indefinitely.
function showTradeDeadlineCheckmark(tradeDeadline) {
  const el      = document.getElementById("fantraxTradeDeadlineCheckmark");
  const valueEl = document.getElementById("fantraxTradeDeadlineValue");
  if (tradeDeadline === undefined) {
    valueEl.value = "(blank)";
    valueEl.classList.add("check-warning");
    el.textContent = "";
    el.style.color = "";
    el.title = "Not checked yet. Click Check League Settings.";
    return;
  }

  const ok = !tradeDeadline;
  valueEl.value = ok ? "(blank)" : tradeDeadline;
  valueEl.classList.toggle("check-warning", !ok);
  el.textContent = ok ? "✓" : "✗";
  el.style.color = ok ? "#0a0" : "#c00";
  el.title = ok
    ? "No Fantrax trade deadline is set: historical trades can be replayed at any time."
    : `Fantrax has a trade deadline of ${tradeDeadline} set. It will reject any trade replayed after that date. Clear it under Transactions & Periods > Trades.`;
}

// Restores the last "Check League Settings" result on popup open, so it
// doesn't reset to "not checked" every time the popup is closed and reopened.
// Must run after loadLeagueIds()/updateFantraxRosterSize() have already
// populated fantraxRosterSize's computed value, since that's what
// requiredAtCheck gets compared against to decide the saved result is still
// valid (the roster requirement changing since the check invalidates it).
async function restoreFantraxCheckState() {
  const { fantraxLastCheck } = await browser.storage.local.get("fantraxLastCheck");
  if (!fantraxLastCheck) return;

  const required = parseInt(document.getElementById("fantraxRosterSize").value, 10);
  if (!isNaN(required) && fantraxLastCheck.requiredAtCheck === required) {
    showRosterCheckmark(fantraxLastCheck.maxTotal);
  }
  if (fantraxLastCheck.tradeDeadline !== undefined) {
    showTradeDeadlineCheckmark(fantraxLastCheck.tradeDeadline);
  }
}

// Sync button state with background on popup open
browser.runtime.sendMessage({ type: "GET_AUTO_STATE" }).then(res => {
  if (res?.autoRunning) setAutoMode(true);
}).catch(() => {});

// ── Theme ──
async function loadTheme() {
  const res = await browser.storage.local.get("theme");
  applyTheme(res.theme || "light");
}

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  document.getElementById("themeToggle").title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
}

document.getElementById("themeToggle").onclick = async () => {
  const isDark = document.body.classList.contains("dark");
  const next   = isDark ? "light" : "dark";
  await browser.storage.local.set({ theme: next });
  applyTheme(next);
};

// ── GitHub link ──
document.getElementById("githubBtn").onclick = () => {
  browser.tabs.create({ url: "https://github.com/wazam/fantasy-sync-extension" });
};

// ── Load All History ──
const loadAllHistoryBtn = document.getElementById("loadAllHistoryBtn");
let loadAllTabId = null;

function setLoadAllButton(running, page) {
  loadAllHistoryBtn.classList.toggle("active", running);
  if (running) {
    loadAllHistoryBtn.textContent = "■ Stop";
    loadAllHistoryBtn.title = `Loading ESPN history, currently on page ${page}. Click to stop.`;
  } else {
    loadAllHistoryBtn.textContent = "▶ Load All Activity";
    loadAllHistoryBtn.title = "Walk every ESPN activity page from newest to oldest and load it all into the queue";
  }
  if (running) setExclusiveRunning(loadAllHistoryBtn.id); else clearExclusiveRunning(loadAllHistoryBtn.id);
}

loadAllHistoryBtn.addEventListener("click", async () => {
  const { espnAutoLoadAll, espnLeagueId } = await browser.storage.local.get(["espnAutoLoadAll", "espnLeagueId"]);

  if (espnAutoLoadAll) {
    // Stopping mid-run, same as Draft Recap/Watchlist/League Settings: whatever
    // page it's paused on isn't worth keeping open, and every page already
    // walked was appended to the queue as it went, so nothing is lost by closing it.
    await browser.storage.local.set({ espnAutoLoadAll: false });
    browser.runtime.sendMessage({ type: "UNWATCH_LOAD_TAB" }).catch(() => {});
    if (loadAllTabId !== null) browser.tabs.remove(loadAllTabId).catch(() => {});
    loadAllTabId = null;
    setLoadAllButton(false);
    return;
  }

  if (!espnLeagueId) {
    alert("Save your ESPN League ID first.");
    return;
  }

  await browser.storage.local.set({ espnAutoLoadAll: true });
  setLoadAllButton(true, 1);
  const tab = await browser.tabs.create({ url: `https://fantasy.espn.com/baseball/recentactivity?leagueId=${espnLeagueId}` });
  loadAllTabId = tab.id;
  browser.runtime.sendMessage({ type: "WATCH_LOAD_TAB", tabId: tab.id, kind: "loadAll" }).catch(() => {});
});

// Reflect in-progress state if the popup is reopened mid-run
browser.storage.local.get("espnAutoLoadAll").then(res => {
  if (res.espnAutoLoadAll) setLoadAllButton(true, "in progress");
});

// ── Load Roster Updates ──
// Separate pipeline from Load All History: walks ESPN's activity feed filtered
// to "Moved" (roster/lineup changes), for Manager Stats' Roster Updates by Hour
// / All Activity by Hour. Never touches the tx queue.
const loadRosterUpdatesBtn = document.getElementById("loadRosterUpdatesBtn");
let loadRosterUpdatesTabId = null;

function setLoadRosterUpdatesButton(running, page) {
  loadRosterUpdatesBtn.classList.toggle("active", running);
  if (running) {
    loadRosterUpdatesBtn.textContent = "■ Stop";
    loadRosterUpdatesBtn.title = `Loading ESPN roster updates, currently on page ${page}. Click to stop.`;
  } else {
    loadRosterUpdatesBtn.textContent = "▶ Load Roster Updates";
    loadRosterUpdatesBtn.title = "Walk every ESPN roster-update page and track when managers make lineup moves (not added to the tx queue)";
  }
  if (running) setExclusiveRunning(loadRosterUpdatesBtn.id); else clearExclusiveRunning(loadRosterUpdatesBtn.id);
}

loadRosterUpdatesBtn.addEventListener("click", async () => {
  const { espnAutoLoadRosterUpdates, espnLeagueId } = await browser.storage.local.get(["espnAutoLoadRosterUpdates", "espnLeagueId"]);

  if (espnAutoLoadRosterUpdates) {
    // Same reasoning as Load All Activity's Stop: every page already walked
    // was appended as it went, so nothing is lost by closing mid-run.
    await browser.storage.local.set({ espnAutoLoadRosterUpdates: false });
    browser.runtime.sendMessage({ type: "UNWATCH_LOAD_TAB" }).catch(() => {});
    if (loadRosterUpdatesTabId !== null) browser.tabs.remove(loadRosterUpdatesTabId).catch(() => {});
    loadRosterUpdatesTabId = null;
    setLoadRosterUpdatesButton(false);
    return;
  }

  if (!espnLeagueId) {
    alert("Save your ESPN League ID first.");
    return;
  }

  await browser.storage.local.set({ espnAutoLoadRosterUpdates: true });
  setLoadRosterUpdatesButton(true, 1);
  const tab = await browser.tabs.create({
    url: `https://fantasy.espn.com/baseball/recentactivity?leagueId=${espnLeagueId}&transactionType=1&activityType=2`
  });
  loadRosterUpdatesTabId = tab.id;
  browser.runtime.sendMessage({ type: "WATCH_LOAD_TAB", tabId: tab.id, kind: "rosterUpdates" }).catch(() => {});
});

// Reflect in-progress state if the popup is reopened mid-run
browser.storage.local.get("espnAutoLoadRosterUpdates").then(res => {
  if (res.espnAutoLoadRosterUpdates) setLoadRosterUpdatesButton(true, "in progress");
});

// Locks a button to its own current rendered width (its natural "idle label"
// width, measured the first time it's visible) so toggling to the much shorter
// "■ Stop" text doesn't shrink the button and shift the rest of its row.
function lockButtonWidth(id) {
  const btn = document.getElementById(id);
  if (!btn.style.minWidth) btn.style.minWidth = `${btn.offsetWidth}px`;
}

// ── League Settings ──
document.getElementById("leagueSettingsBtn").addEventListener("click", () => {
  document.getElementById("leagueSettingsModal").hidden = false;
  lockButtonWidth("loadLeagueSettingsBtn");
  lockButtonWidth("checkFantraxSettingsBtn");
});
document.getElementById("leagueSettingsCloseBtn").addEventListener("click", () => {
  document.getElementById("leagueSettingsModal").hidden = true;
});

// ── Player Notes ──
async function loadPlayerNotes() {
  const { playerNotes = [] } = await browser.storage.local.get("playerNotes");
  return playerNotes;
}

function renderPlayerNotes(list) {
  const container = document.getElementById("notesListItems");
  container.replaceChildren();

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No notes added yet.";
    container.appendChild(empty);
    return;
  }

  [...list].reverse().forEach(entry => {
    const row = document.createElement("div");
    row.className = "note-item";

    const name = document.createElement("span");
    name.className = "note-name";
    name.textContent = entry.name;
    name.title = entry.name;

    const note = document.createElement("span");
    note.className = "note-text";
    note.textContent = entry.note || "";
    note.title = entry.note || "";

    const del = document.createElement("button");
    del.className = "toolbar-icon";
    del.title = "Remove";
    del.textContent = "✕";
    del.addEventListener("click", async () => {
      const current = await loadPlayerNotes();
      const updated = current.filter(e => e.id !== entry.id);
      await browser.storage.local.set({ playerNotes: updated });
      refreshNotesView();
    });

    row.appendChild(name);
    row.appendChild(note);
    row.appendChild(del);
    container.appendChild(row);
  });
}

// Filters the full notes list by the search box (matches player name or note
// text) before rendering, so add/remove/search all stay in sync with each other.
async function refreshNotesView() {
  const all   = await loadPlayerNotes();
  const query = document.getElementById("noteSearchInput").value.trim().toLowerCase();

  const filtered = query
    ? all.filter(e => e.name.toLowerCase().includes(query) || (e.note || "").toLowerCase().includes(query))
    : all;

  renderPlayerNotes(filtered);
}

document.getElementById("noteSearchInput").addEventListener("input", refreshNotesView);

document.getElementById("notesBtn").addEventListener("click", async () => {
  document.getElementById("notesModal").hidden = false;
  document.getElementById("noteSearchInput").value = "";
  refreshNotesView();
  loadKnownPlayerNames();
  document.getElementById("noteNameInput").focus();
});

document.getElementById("notesCloseBtn").addEventListener("click", () => {
  document.getElementById("notesModal").hidden = true;
});

// ── Fix Broken Transaction ──
// Opens with one Name (+ optional MLB team) field per side ESPN's page left
// blank. Saving patches the queue entry in background.js and clears the flag
// blocking Auto Run/Step from processing it.
function openFixBrokenModal(tx, txKey) {
  const fieldsContainer = document.getElementById("fixBrokenFields");
  fieldsContainer.replaceChildren();

  const sides = [];
  if (tx.add?.broken)  sides.push("add");
  if (tx.drop?.broken) sides.push("drop");

  sides.forEach(side => {
    const label = side === "add" ? "Added player" : "Dropped player";

    const heading = document.createElement("div");
    heading.className = "sync-subhead";
    heading.textContent = label;
    fieldsContainer.appendChild(heading);

    const nameRow = document.createElement("div");
    nameRow.className = "row";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Player name";
    nameInput.dataset.side = side;
    nameInput.dataset.field = "name";
    nameInput.style.flex = "1";
    nameRow.appendChild(nameInput);
    fieldsContainer.appendChild(nameRow);

    const detailRow = document.createElement("div");
    detailRow.className = "row";
    const teamInput = document.createElement("input");
    teamInput.type = "text";
    teamInput.placeholder = "MLB team (e.g. NYY)";
    teamInput.dataset.side = side;
    teamInput.dataset.field = "mlbTeam";
    teamInput.style.flex = "1";
    const posInput = document.createElement("input");
    posInput.type = "text";
    posInput.placeholder = "Primary position (e.g. SS)";
    posInput.dataset.side = side;
    posInput.dataset.field = "position";
    posInput.style.flex = "1";
    detailRow.appendChild(teamInput);
    detailRow.appendChild(posInput);
    fieldsContainer.appendChild(detailRow);
  });

  const modal = document.getElementById("fixBrokenModal");
  modal.dataset.txKey = txKey;
  modal.hidden = false;
  fieldsContainer.querySelector("input")?.focus();
}

document.getElementById("fixBrokenCloseBtn").addEventListener("click", () => {
  document.getElementById("fixBrokenModal").hidden = true;
});

document.getElementById("fixBrokenSaveBtn").addEventListener("click", async () => {
  const modal = document.getElementById("fixBrokenModal");
  const key   = modal.dataset.txKey;
  const fixes = {};

  modal.querySelectorAll("#fixBrokenFields input[data-field='name']").forEach(nameInput => {
    const side = nameInput.dataset.side;
    const name = nameInput.value.trim();
    if (!name) return;
    const parts = name.split(/\s+/);
    const last  = parts.pop() || "";
    const first = parts.join(" ");
    const teamInput = modal.querySelector(`input[data-side="${side}"][data-field="mlbTeam"]`);
    const posInput  = modal.querySelector(`input[data-side="${side}"][data-field="position"]`);
    fixes[side] = {
      first, last,
      mlbTeam:  teamInput?.value.trim() || undefined,
      position: posInput?.value.trim().toUpperCase() || undefined
    };
  });

  if (!Object.keys(fixes).length) {
    alert("Enter at least one player name before saving.");
    return;
  }

  const res = await browser.runtime.sendMessage({ type: "FIX_BROKEN_TX", key, fixes });
  if (!res?.ok) {
    alert("Could not find this transaction in the queue anymore. It may have been reloaded: try rescraping and fixing it again.");
  }
  modal.hidden = true;
  renderQueue();
});

document.getElementById("statsBtn").addEventListener("click", () => {
  document.getElementById("statsModal").hidden = false;
  renderManagerStats();
});

document.getElementById("statsCloseBtn").addEventListener("click", () => {
  document.getElementById("statsModal").hidden = true;
});

// ── Manager Stats: most dropped/added, and per-manager activity by hour ──
// (all auto-generated from the scraped ESPN history)
async function loadTxHistory() {
  const { txHistory = [] } = await browser.storage.local.get("txHistory");
  return txHistory;
}

async function loadRosterUpdateHistory() {
  const { rosterUpdateHistory = [] } = await browser.storage.local.get("rosterUpdateHistory");
  return rosterUpdateHistory;
}

async function loadTeamRenames() {
  const { teamRenames = [] } = await browser.storage.local.get("teamRenames");
  return teamRenames;
}

// Resolves an old team name to whatever that team is called now, by walking
// the rename chain forward (handles more than one rename in a season). Never
// touches the stored history itself, just how it's grouped/displayed.
function buildTeamNameResolver(renames) {
  const map = new Map();
  renames.forEach(r => map.set(r.from, r.to));
  return function resolve(name) {
    const seen = new Set();
    while (map.has(name) && !seen.has(name)) {
      seen.add(name);
      name = map.get(name);
    }
    return name;
  };
}

// Collapses a team's roster-update rows into "sessions": consecutive rows
// within ROSTER_SESSION_WINDOW_MS of each other count as one check-in, keyed
// to the *first* row's time. Without this, a single visit that saves several
// paired swaps one at a time (the web UI's save behavior) would look like
// several separate check-ins, while the same visit saved as one batch (the
// app's save behavior) would look like just one, skewing Roster Updates by
// Hour toward whichever save method happened to be used.
const ROSTER_SESSION_WINDOW_MS = 15 * 60 * 1000;

function collapseRosterSessions(entries) {
  const byTeam = new Map();
  entries.forEach(e => {
    if (!e.team || !e.date) return;
    if (!byTeam.has(e.team)) byTeam.set(e.team, []);
    byTeam.get(e.team).push(new Date(e.date).getTime());
  });

  const sessions = [];
  byTeam.forEach((timestamps, team) => {
    timestamps.sort((a, b) => a - b);
    let sessionStart = null;
    let lastTs = null;
    timestamps.forEach(ts => {
      if (sessionStart === null || ts - lastTs > ROSTER_SESSION_WINDOW_MS) {
        if (sessionStart !== null) sessions.push({ team, date: sessionStart });
        sessionStart = ts;
      }
      lastTs = ts;
    });
    if (sessionStart !== null) sessions.push({ team, date: sessionStart });
  });

  return sessions;
}

// Shared by all three "by Hour" modes: either a single team's full hour-by-hour
// breakdown (teamFilter set) or the league overview of each team's single
// busiest hour (teamFilter empty). Trade entries are excluded either way since
// their timestamp is commissioner-approval time, not manager time.
function computeHourStats(entries, teamFilter) {
  if (teamFilter) {
    const counts = new Map();
    for (const entry of entries) {
      if (entry.dir === "TRADE") continue;
      if (entry.team !== teamFilter) continue;
      const hour = new Date(entry.date).getHours();
      counts.set(hour, (counts.get(hour) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([hour, count]) => [formatHour(hour), count]);
  }

  const perTeamHourCounts = new Map(); // team -> Map(hour -> count)
  for (const entry of entries) {
    if (entry.dir === "TRADE") continue;
    if (!entry.team) continue;
    const hour = new Date(entry.date).getHours();
    if (!perTeamHourCounts.has(entry.team)) perTeamHourCounts.set(entry.team, new Map());
    const hourCounts = perTeamHourCounts.get(entry.team);
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }
  return [...perTeamHourCounts.entries()]
    .map(([team, hourCounts]) => {
      const [peakHour, peakCount] = [...hourCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      return [`${team}: ${formatHour(peakHour)}`, peakCount];
    })
    .sort((a, b) => b[1] - a[1]);
}

function populateTeamFilterOptions(history) {
  const select  = document.getElementById("shameStatsTeamFilter");
  const current = select.value;
  const teams   = [...new Set(history.map(e => e.team).filter(Boolean))].sort();

  select.replaceChildren();
  const allOpt = document.createElement("option");
  allOpt.value = "";
  allOpt.textContent = "All Teams";
  select.appendChild(allOpt);

  teams.forEach(team => {
    const opt = document.createElement("option");
    opt.value = team;
    opt.textContent = team;
    select.appendChild(opt);
  });

  if (teams.includes(current)) select.value = current;
}

function formatHour(hour) {
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12} ${period}`;
}

function renderStatRows(rows, emptyMessage) {
  const container = document.getElementById("shameStatsItems");
  container.replaceChildren();

  if (!rows.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = emptyMessage || "No data yet. Run Load All Activity once to backfill season history.";
    container.appendChild(empty);
    return;
  }

  rows.forEach(([label, count]) => {
    const row = document.createElement("div");
    row.className = "stat-item";

    const labelEl = document.createElement("span");
    labelEl.textContent = label;

    const countEl = document.createElement("span");
    countEl.className = "stat-count";
    countEl.textContent = count;

    row.appendChild(labelEl);
    row.appendChild(countEl);
    container.appendChild(row);
  });
}

async function renderManagerStats() {
  const [rawHistory, rawRosterHistory, renames] = await Promise.all([
    loadTxHistory(),
    loadRosterUpdateHistory(),
    loadTeamRenames()
  ]);

  // Resolve every entry's team to its current name up front, so a mid-season
  // rename never splits one manager's stats across an old and new name.
  const resolve = buildTeamNameResolver(renames);
  const history       = rawHistory.map(e => e.team ? { ...e, team: resolve(e.team) } : e);
  const rosterHistory  = rawRosterHistory.map(e => ({ ...e, team: resolve(e.team) }));
  const rosterSessions = collapseRosterSessions(rosterHistory);

  populateTeamFilterOptions(history.concat(rosterHistory));

  const mode           = document.getElementById("statsMode").value;
  const teamFilterEl   = document.getElementById("shameStatsTeamFilter");
  const teamFilter     = teamFilterEl.value;
  const hint           = document.getElementById("statsModeHint");

  // Most Trades is already a per-team leaderboard with no per-player drilldown,
  // so filtering it by team has nothing left to narrow down.
  teamFilterEl.disabled = mode === "TRADE";

  if (mode === "HOUR" || mode === "LINEUP_HOUR" || mode === "ALL_HOUR") {
    const sourceEntries =
      mode === "HOUR"        ? history :
      mode === "LINEUP_HOUR" ? rosterSessions :
                                history.concat(rosterSessions);

    if (teamFilter) {
      // Drilled into one manager: their own hour-by-hour breakdown, busiest first.
      hint.hidden = true;
    } else {
      hint.hidden = false;
      hint.textContent =
        mode === "HOUR"
          ? "Each manager's single busiest hour for adds and drops. Pick a team above to see their full hour-by-hour breakdown."
        : mode === "LINEUP_HOUR"
          ? "Each manager's single busiest hour for in-app roster/lineup moves, excluding CPU and Lineup Protection auto-moves. Pick a team above to see their full hour-by-hour breakdown."
          : "Each manager's single busiest hour combining transactions and roster updates. Pick a team above to see their full hour-by-hour breakdown.";
    }

    const emptyMessage =
      mode === "HOUR"        ? "No data yet. Run Load All Activity once to backfill season history." :
      mode === "LINEUP_HOUR" ? "No data yet. Run Load Roster Updates once to backfill season history." :
                                "No data yet. Run Load All Activity and Load Roster Updates once to backfill season history.";

    renderStatRows(computeHourStats(sourceEntries, teamFilter), emptyMessage);
    return;
  }

  if (mode === "TRADE") {
    // A per-team leaderboard, not a per-player one: there's no single "traded
    // player" the way there is for an add/drop, and the point here is finding
    // which managers trade unusually often, not drilling into any one team.
    hint.hidden = false;
    hint.textContent = "Trades a team has been part of this season.";
    const counts = new Map();
    for (const entry of history) {
      if (entry.dir !== "TRADE" || !entry.team) continue;
      counts.set(entry.team, (counts.get(entry.team) || 0) + 1);
    }
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    renderStatRows(rows);
    return;
  }

  hint.hidden = false;
  hint.textContent = mode === "ADD"
    ? "Players a manager has added off waivers or free agency this season."
    : "Players a manager has dropped this season.";
  const counts = new Map();
  for (const entry of history) {
    if (entry.dir !== mode) continue;
    if (teamFilter && entry.team !== teamFilter) continue;
    counts.set(entry.name, (counts.get(entry.name) || 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  renderStatRows(rows);
}

document.getElementById("statsMode").addEventListener("change", renderManagerStats);
document.getElementById("shameStatsTeamFilter").addEventListener("change", renderManagerStats);

async function addPlayerNote() {
  const nameInput = document.getElementById("noteNameInput");
  const noteInput = document.getElementById("noteTextInput");
  const name = nameInput.value.trim();
  if (!name) return;
  const note = noteInput.value.trim();

  const list = await loadPlayerNotes();
  list.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, note, date: Date.now() });
  await browser.storage.local.set({ playerNotes: list });

  nameInput.value = "";
  noteInput.value = "";
  refreshNotesView();
  nameInput.focus();
}

document.getElementById("noteAddBtn").addEventListener("click", addPlayerNote);
document.getElementById("noteNameInput").addEventListener("keydown", e => { if (e.key === "Enter") addPlayerNote(); });
document.getElementById("noteTextInput").addEventListener("keydown", e => { if (e.key === "Enter") addPlayerNote(); });

// Suggests names already seen in the pending queue or scraped ESPN history.
// Rendered as a plain DOM dropdown (not a native <datalist>) since a native
// datalist popup is drawn by the browser outside the extension panel and can't
// be kept within its bounds.
let knownPlayerNames = [];

async function loadKnownPlayerNames() {
  const names = new Set();

  const addNames = tx => {
    if (tx.add)  names.add(`${tx.add.first} ${tx.add.last}`.trim());
    if (tx.drop) names.add(`${tx.drop.first} ${tx.drop.last}`.trim());
    if (tx.sides) Object.values(tx.sides).flat().forEach(p => names.add(`${p.first} ${p.last}`.trim()));
  };

  const [queueRes, historyRes] = await Promise.all([
    browser.runtime.sendMessage({ type: "GET_QUEUE" }).catch(() => null),
    browser.storage.local.get("txHistory")
  ]);

  (queueRes?.queue || []).forEach(addNames);
  (historyRes.txHistory || []).forEach(entry => { if (entry.name) names.add(entry.name); });

  knownPlayerNames = [...names].filter(Boolean).sort();
}

function renderNameSuggestions(query) {
  const box = document.getElementById("noteNameSuggestions");
  const q = query.trim().toLowerCase();

  if (!q) { box.hidden = true; return; }

  const matches = knownPlayerNames.filter(n => n.toLowerCase().includes(q)).slice(0, 20);
  box.replaceChildren();

  if (!matches.length) { box.hidden = true; return; }

  matches.forEach(name => {
    const item = document.createElement("div");
    item.className = "suggest-item";
    item.textContent = name;
    // mousedown (not click) fires before the input's blur, so the value is set
    // before the blur handler hides this dropdown.
    item.addEventListener("mousedown", e => {
      e.preventDefault();
      document.getElementById("noteNameInput").value = name;
      box.hidden = true;
    });
    box.appendChild(item);
  });

  box.hidden = false;
}

const noteNameInput = document.getElementById("noteNameInput");
noteNameInput.addEventListener("input", () => renderNameSuggestions(noteNameInput.value));
noteNameInput.addEventListener("focus", () => renderNameSuggestions(noteNameInput.value));
noteNameInput.addEventListener("blur", () => {
  setTimeout(() => { document.getElementById("noteNameSuggestions").hidden = true; }, 150);
});

// Clicking the dimmed backdrop (not the card itself) closes whichever modal it belongs to.
["leagueSettingsModal", "statsModal", "notesModal", "processedHistoryModal", "fixBrokenModal"].forEach(id => {
  const overlay = document.getElementById(id);
  overlay.addEventListener("click", e => {
    if (e.target === overlay) overlay.hidden = true;
  });
});

loadTheme();
loadLeagueIds().then(restoreFantraxCheckState);
loadCutoff().then(renderQueue);
loadUpperCutoff();
setupDragSelection();
