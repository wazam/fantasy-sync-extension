const ESPN_MONTHS = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
};

// Converts "Mon Apr 6 6:19 am" → "2026-04-06 06:19"
// Returns original string unchanged if it doesn't match ESPN format
function normalizeToISO(str) {
  const m = str.trim().match(/^(?:[A-Za-z]{3}\s+)?([A-Za-z]{3})\s+(\d{1,2})\s+(\d{1,2}):(\d{2})\s*(am|pm)$/i);
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
  const parts = (str || "2026-03-29").trim().split(" ");
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
  const res = await browser.storage.local.get(["espnLeagueId", "fantraxLeagueId"]);
  if (res.espnLeagueId)    document.getElementById("espnLeagueId").value    = res.espnLeagueId;
  if (res.fantraxLeagueId) document.getElementById("fantraxLeagueId").value = res.fantraxLeagueId;
  updateLinkButtons(res.espnLeagueId, res.fantraxLeagueId);
}

function updateLinkButtons(espnId, fantraxId) {
  const btnEspn          = document.getElementById("linkEspn");
  const btnFantraxRecent = document.getElementById("linkFantraxRecent");
  const btnFantraxClaim  = document.getElementById("linkFantraxClaim");
  const btnFantraxTrade  = document.getElementById("linkFantraxTrade");

  if (espnId) {
    btnEspn.classList.remove("disabled");
    btnEspn.onclick = () => browser.tabs.create({
      url: `https://fantasy.espn.com/baseball/recentactivity?leagueId=${espnId}`
    });
  } else {
    btnEspn.classList.add("disabled");
    btnEspn.onclick = () => alert("Save your ESPN League ID first.");
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
  } else {
    btnFantraxRecent.classList.add("disabled");
    btnFantraxRecent.onclick = () => alert("Save your Fantrax League ID first.");
    btnFantraxClaim.classList.add("disabled");
    btnFantraxClaim.onclick = () => alert("Save your Fantrax League ID first.");
    btnFantraxTrade.classList.add("disabled");
    btnFantraxTrade.onclick = () => alert("Save your Fantrax League ID first.");
  }
}

document.getElementById("saveLeagues").onclick = async () => {
  const espnId    = document.getElementById("espnLeagueId").value.trim();
  const fantraxId = document.getElementById("fantraxLeagueId").value.trim();
  await browser.storage.local.set({ espnLeagueId: espnId, fantraxLeagueId: fantraxId });
  updateLinkButtons(espnId, fantraxId);
};

async function loadCutoff() {
  const res = await browser.storage.local.get("cutoff");
  document.getElementById("cutoff").value = res.cutoff || "2026-03-29 00:00";
}

async function loadUpperCutoff() {
  const res = await browser.storage.local.get("upperCutoff");
  const val = res.upperCutoff || dateToISO(new Date());
  document.getElementById("upperCutoff").value = val;
  browser.runtime.sendMessage({ type: "SET_UPPER_CUTOFF", value: val }).catch(() => {});
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
    if (!row || !row.dataset.date || e.ctrlKey) return;
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

// ── Queue rendering ───────────────────────────────────────────────────────────

async function renderQueue() {
  const list = document.getElementById("queue-list");
  const res  = await browser.runtime.sendMessage({ type: "GET_QUEUE" });

  // Keep background upper cutoff in sync with whatever the input shows
  const upperVal = (document.getElementById("upperCutoff")?.value || "").trim();
  if (upperVal) browser.runtime.sendMessage({ type: "SET_UPPER_CUTOFF", value: upperVal }).catch(() => {});

  list.replaceChildren();

  if (!res || !res.queue || !res.queue.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No transactions loaded yet.";
    list.appendChild(empty);
    return;
  }

  const cutoff          = parseCutoffStr(document.getElementById("cutoff").value);
  const upperCutoffDate = upperVal ? parseCutoffStr(upperVal) : null;
  const excludedSet     = new Set(res.excludedKeys || []);

  // Compute effective next index, mirroring GET_NEXT logic in background
  let nextEffectiveIdx = -1;
  for (let i = res.index; i < res.queue.length; i++) {
    const tx = res.queue[i];
    if (!tx.date) continue;
    const d = new Date(tx.date);
    if (d < cutoff) continue;
    if (upperCutoffDate && d > upperCutoffDate) continue;
    if (excludedSet.has(txKeyForRow(tx))) continue;
    nextEffectiveIdx = i;
    break;
  }
  const nextLabel = nextEffectiveIdx >= 0 ? `#${nextEffectiveIdx + 1}` : "none";

  const header = document.createElement("div");
  header.className = "queue-header";
  header.textContent = `${res.queue.length} transactions \u2014 next: ${nextLabel}`;
  list.appendChild(header);

  [...res.queue].reverse().forEach((tx, revIdx) => {
    const i      = res.queue.length - 1 - revIdx; // remap to original queue index
    const txDate = tx.date ? new Date(tx.date) : null;
    const txKey  = txKeyForRow(tx);

    const isCutoff   = txDate && txDate < cutoff;
    const isAbove    = txDate && upperCutoffDate && txDate > upperCutoffDate;
    const isDone     = i < res.index;
    const isExcluded = excludedSet.has(txKey);

    const cls = "tx-row"
      + (isCutoff   ? " tx-cutoff"   : "")
      + (isAbove    ? " tx-above"    : "")
      + (isDone     ? " tx-done"     : "")
      + (isExcluded ? " tx-excluded" : "");

    function makeRow(dateText, typeText, teamText) {
      const row = document.createElement("div");
      row.className = cls;
      row.dataset.txKey = txKey;
      if (txDate) {
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

      // Row 1 — Team A: receives bGives (+), gives aGives (-)
      const r1 = makeRow(formatDate(tx.date), "TRD", teamA);
      bGives.forEach(p => addPlayerToken(r1.playersSpan, `+${p.last}`, "add"));
      aGives.forEach(p => addPlayerToken(r1.playersSpan, `-${p.last}`, "drop"));
      r1.playersSpan.title = [
        ...bGives.map(p => `+${p.first} ${p.last}`),
        ...aGives.map(p => `-${p.first} ${p.last}`)
      ].join("  ");
      list.appendChild(r1.row);

      // Row 2 — Team B: receives aGives (+), gives bGives (-)
      const r2 = makeRow("", "", teamB);
      aGives.forEach(p => addPlayerToken(r2.playersSpan, `+${p.last}`, "add"));
      bGives.forEach(p => addPlayerToken(r2.playersSpan, `-${p.last}`, "drop"));
      r2.playersSpan.title = [
        ...aGives.map(p => `+${p.first} ${p.last}`),
        ...bGives.map(p => `-${p.first} ${p.last}`)
      ].join("  ");
      list.appendChild(r2.row);

    } else {
      const typeLabel = tx.type === "ADD_DROP" ? "A+D" : (tx.type || "?");
      const { row, playersSpan } = makeRow(formatDate(tx.date), typeLabel, tx.team || "");

      if (tx.add)  addPlayerToken(playersSpan, `+${tx.add.last}`,  "add");
      if (tx.drop) addPlayerToken(playersSpan, `-${tx.drop.last}`, "drop");
      const playerTitle = [
        tx.add  ? `+${tx.add.first} ${tx.add.last}`   : null,
        tx.drop ? `-${tx.drop.first} ${tx.drop.last}` : null
      ].filter(Boolean).join("  ");
      if (playerTitle) playersSpan.title = playerTitle;

      list.appendChild(row);
    }
  });
}

// ── Cutoff inputs: save on blur or Enter ──────────────────────────────────────

async function saveCutoff() {
  const raw       = document.getElementById("cutoff").value.trim();
  const converted = normalizeToISO(raw);
  document.getElementById("cutoff").value = converted;
  await browser.storage.local.set({ cutoff: converted });
  renderQueue();
}

async function saveUpperCutoff() {
  const val = document.getElementById("upperCutoff").value.trim();
  if (!val) return;
  await browser.storage.local.set({ upperCutoff: val });
  browser.runtime.sendMessage({ type: "SET_UPPER_CUTOFF", value: val }).catch(() => {});
  renderQueue();
}

document.getElementById("cutoff").addEventListener("blur",    saveCutoff);
document.getElementById("upperCutoff").addEventListener("blur", saveUpperCutoff);

document.getElementById("cutoff").addEventListener("keydown",    e => { if (e.key === "Enter") e.target.blur(); });
document.getElementById("upperCutoff").addEventListener("keydown", e => { if (e.key === "Enter") e.target.blur(); });

document.getElementById("nowBtn").onclick = async () => {
  const now = dateToISO(new Date());
  document.getElementById("upperCutoff").value = now;
  await browser.storage.local.set({ upperCutoff: now });
  browser.runtime.sendMessage({ type: "SET_UPPER_CUTOFF", value: now }).catch(() => {});
  renderQueue();
};

document.getElementById("next").onclick = async () => {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (!tab?.url?.includes("fantrax")) {
    alert("Please navigate to the Fantrax Claim/Drop page first.");
    return;
  }

  browser.tabs.sendMessage(tab.id, { type: "RUN_NEXT" });

  // re-render after a short delay so index has advanced
  setTimeout(renderQueue, 300);
};

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "QUEUE_UPDATED") renderQueue();
  if (msg.type === "CUTOFF_SAVED")  loadCutoff().then(() => loadUpperCutoff().then(renderQueue));
});

// ── Theme ──
async function loadTheme() {
  const res = await browser.storage.local.get("theme");
  applyTheme(res.theme || "light");
}

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  document.getElementById("themeToggle").textContent = theme === "dark" ? "☀️" : "🌙";
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

loadTheme();
loadLeagueIds();
loadCutoff().then(renderQueue);
loadUpperCutoff();
setupDragSelection();
