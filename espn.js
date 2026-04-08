console.log("[EXT] content script injected:", location.href);

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

function parseDate(row) {
  const dateEl = row.querySelector(".date");
  const timeEl = row.querySelector(".time");

  if (!dateEl || !timeEl) return null;

  const dateText = dateEl.innerText.trim();   // "Sun Apr 5"
  const timeText = timeEl.innerText.trim();   // "8:29 pm"

  // Parse date
  const [, monthStr, day] = dateText.match(/\w+ (\w+) (\d+)/) || [];

  const months = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
  };

  // Parse time
  const [, hourRaw, minute, ampm] = timeText.match(/(\d+):(\d+)\s*(am|pm)/i) || [];

  let hour = parseInt(hourRaw, 10);
  const min = parseInt(minute, 10);

  if (ampm.toLowerCase() === "pm" && hour !== 12) hour += 12;
  if (ampm.toLowerCase() === "am" && hour === 12) hour = 0;

  return new Date(2026, months[monthStr], parseInt(day), hour, min);
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
        const m = text.match(/dropped (.*?),/);
        if (m) drop = parseName(m[1]);
      }
      if (text.includes("added")) {
        const m = text.match(/added (.*?),/);
        if (m) add = parseName(m[1]);
      }
    });

    let type = null;
    if (add && drop) type = "ADD_DROP";
    else if (add)    type = "ADD";
    else if (drop)   type = "DROP";
    if (!type) return;

    results.push({ type, team, add, drop, date: parseDate(row), idx });
  });

  return results;
}

// wait until table exists
async function waitForTable() {
  for (let i = 0; i < 20; i++) {
    const exists = document.querySelector("tbody tr");
    if (exists) return;
    await new Promise(r => setTimeout(r, 500));
  }
}

// main scrape (NO pagination auto-click)
async function scrapeCurrentPage() {
  await waitForTable();
  return extractTransactions();
}

// send ONLY if data exists
(async () => {
  const data = await scrapeCurrentPage();

  if (!data.length) {
    console.log("[EXT] No transactions found on this page.");
    return;
  }

  browser.runtime.sendMessage({
    type: "ESPN_TRANSACTIONS_APPEND",
    data
  });

  console.log("[EXT] ESPN page scraped:", data.length);
})();