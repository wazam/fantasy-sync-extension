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

  const mm  = String(monthNum).padStart(2, "0");
  const dd  = String(day).padStart(2, "0");
  const hh  = String(hour).padStart(2, "0");

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
  const d = new Date(val);
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
  const h = dt.getHours();
  const mins = dt.getMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${months[dt.getMonth()]} ${dt.getDate()} ${h12}:${mins}${ampm}`;
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

async function renderQueue() {
  const list = document.getElementById("queue-list");
  const res = await browser.runtime.sendMessage({ type: "GET_QUEUE" });

  list.replaceChildren();

  if (!res || !res.queue || !res.queue.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No transactions loaded yet.";
    list.appendChild(empty);
    return;
  }

  const cutoff = parseCutoffStr(document.getElementById("cutoff").value);

  let nextEffectiveIdx = -1;
  for (let i = res.index; i < res.queue.length; i++) {
    const tx = res.queue[i];
    if (tx.date && new Date(tx.date) >= cutoff) { nextEffectiveIdx = i; break; }
  }
  const nextLabel = nextEffectiveIdx >= 0 ? `#${nextEffectiveIdx + 1}` : "none";

  const header = document.createElement("div");
  header.className = "queue-header";
  header.textContent = `${res.queue.length} transactions \u2014 next: ${nextLabel}`;
  list.appendChild(header);

  [...res.queue].reverse().forEach((tx, i) => {
    i = res.queue.length - 1 - i; // remap to original index for done/cutoff logic
    const txDate = tx.date ? new Date(tx.date) : null;
    const isCutoff = txDate && txDate < cutoff;
    const isDone   = i < res.index;

    const cls = "tx-row" + (isCutoff ? " tx-cutoff" : "") + (isDone ? " tx-done" : "");

    function makeRow(dateText, typeText, teamText) {
      const row = document.createElement("div");
      row.className = cls;
      if (txDate) {
        row.title = "Click to set as cutoff";
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
          const el = document.getElementById("cutoff");
          el.value = dateToISO(txDate);
          el.focus(); el.select();
        });
        row.addEventListener("dblclick", async () => {
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

    function addPlayerToken(span, last, cls) {
      const s = document.createElement("span");
      s.className = cls;
      s.textContent = last;
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

document.getElementById("save").onclick = async () => {
  const raw       = document.getElementById("cutoff").value.trim();
  const converted = normalizeToISO(raw);

  document.getElementById("cutoff").value = converted;
  await browser.storage.local.set({ cutoff: converted });
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
  const next = isDark ? "light" : "dark";
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
