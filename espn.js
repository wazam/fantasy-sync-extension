console.log("[EXT] content script injected:", location.href);

function parseName(full) {
  const parts = full.trim().split(" ");
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts.slice(-1)[0]
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
    // querySelectorAll gets ALL detail spans — ADD_DROP rows have two
    const details = row.querySelectorAll(".transaction-details");
    if (!details.length) return;

    let add = null;
    let drop = null;
    let team = null;

    details.forEach(detail => {
      const text = detail.innerText;
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
    else if (add) type = "ADD";
    else if (drop) type = "DROP";

    if (!type) return;

    results.push({
      type,
      team,
      add,
      drop,
      date: parseDate(row)
    });
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