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
        const m = text.match(/dropped (.*?),\s*([A-Z]{2,3})\b/);
        if (m) { drop = parseName(m[1]); drop.mlbTeam = m[2]; }
      }
      if (text.includes("added")) {
        const m = text.match(/added (.*?),\s*([A-Z]{2,3})\b/);
        if (m) { add = parseName(m[1]); add.mlbTeam = m[2]; }
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

async function scrapeActivityPage(params) {
  await waitForContent("tbody tr");
  const data = extractTransactions();

  if (!data.length) {
    console.log("[EXT] No transactions found on this page.");
    return;
  }

  // Extract the ESPN page number from the URL (&page=N) so background.js can
  // order same-timestamp transactions correctly across pages regardless of load order.
  // Page 1 (the default/newest page) has no &page= param, so it defaults to 1.
  const pageNum = parseInt(params.get("page") || "1", 10) || 1;

  browser.runtime.sendMessage({
    type: "ESPN_TRANSACTIONS_APPEND",
    data,
    page: pageNum
  });

  console.log("[EXT] ESPN page scraped:", data.length, "(page", pageNum + ")");
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
    return;
  }

  const draftTs = parseDraftDatetime();
  if (!draftTs) return;

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
    return;
  }

  console.log(`[EXT] Draft: ${transactions.length} picks parsed, sending to queue`);
  browser.runtime.sendMessage({ type: "ESPN_TRANSACTIONS_APPEND", data: transactions, page: 0 });
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
  } else {
    await scrapeActivityPage(params);
  }
})();
