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

  const header = document.createElement("div");
  header.className = "queue-header";
  header.textContent = `${res.queue.length} transactions \u2014 next: #${res.index + 1}`;
  list.appendChild(header);

  [...res.queue].reverse().forEach((tx, i) => {
    i = res.queue.length - 1 - i; // remap to original index for done/cutoff logic
    const txDate = tx.date ? new Date(tx.date) : null;
    const isCutoff = txDate && txDate < cutoff;
    const isDone   = i < res.index;

    const row = document.createElement("div");
    row.className = "tx-row" + (isCutoff ? " tx-cutoff" : "") + (isDone ? " tx-done" : "");

    const typeLabel = tx.type === "ADD_DROP" ? "A+D" : (tx.type || "?");

    const dateSpan = document.createElement("span");
    dateSpan.className = "tx-date";
    dateSpan.textContent = formatDate(tx.date);

    const typeSpan = document.createElement("span");
    typeSpan.className = "tx-type";
    typeSpan.textContent = typeLabel;

    const teamSpan = document.createElement("span");
    teamSpan.className = "tx-team";
    teamSpan.textContent = tx.team || "";

    const playersSpan = document.createElement("span");
    playersSpan.className = "tx-players";
    if (tx.add) {
      const s = document.createElement("span");
      s.className = "add";
      s.textContent = `+${tx.add.last}`;
      playersSpan.appendChild(s);
    }
    if (tx.add && tx.drop) {
      playersSpan.appendChild(document.createTextNode(" "));
    }
    if (tx.drop) {
      const s = document.createElement("span");
      s.className = "drop";
      s.textContent = `-${tx.drop.last}`;
      playersSpan.appendChild(s);
    }

    row.appendChild(dateSpan);
    row.appendChild(typeSpan);
    row.appendChild(teamSpan);
    row.appendChild(playersSpan);
    list.appendChild(row);
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

loadCutoff().then(renderQueue);
