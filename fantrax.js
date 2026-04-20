console.log("[EXT] content script injected:", location.href);

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function normalizeTeamName(raw) {
  return raw.trim().replace(/\s*\*+\s*$/, "");
}

// ── Claim/Drop helpers ────────────────────────────────────────────────────────

function selectTeam(teamName) {
  const select = document.getElementById("ddTeams");
  if (!select) return false;

  for (let opt of select.options) {
    if (normalizeTeamName(opt.text) === teamName) {
      select.value = opt.value;
      select.dispatchEvent(new Event("change"));
      return true;
    }
  }
  return false;
}

// Generate Fantrax search strings to try for a player, from most to least specific.
// Covers: dot/no-dot initials (TJ ↔ T.J.), accent stripping, hyphen variants,
// hyphenated-first → initials (Jean-Carlos → J.C.), and last-name-only fallback.
function nameVariants(player) {
  const variants = [];
  const seen = new Set();

  function add(last, first) {
    const l = last.replace(/'/g, "").trim();
    const f = first.trim();
    const s = f ? `${l}, ${f}` : l;
    if (!s || seen.has(s)) return;
    seen.add(s);
    variants.push(s);
  }

  function stripAccents(s) {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  const rawLast  = player.last;
  const rawFirst = player.first;
  const aLast    = stripAccents(rawLast);
  const aFirst   = stripAccents(rawFirst);

  // 1. Primary as-is (+ accent-stripped)
  add(rawLast, rawFirst);
  if (aLast !== rawLast || aFirst !== rawFirst) add(aLast, aFirst);

  // 2. Remove dots from first name: "T.J." → "TJ", "J.C." → "JC"
  const firstNoDots = rawFirst.replace(/\./g, "");
  if (firstNoDots !== rawFirst) add(rawLast, firstNoDots);

  // 3. Add dots to all-cap initials: "TJ" → "T.J.", "PJ" → "P.J.", "JPC" → "J.P.C."
  if (/^[A-Z]{2,3}$/.test(rawFirst)) {
    add(rawLast, rawFirst.split("").join(".") + ".");
  }
  // Handle "T.J" missing trailing dot → "T.J."
  if (/^[A-Z]\.[A-Z]$/.test(rawFirst)) add(rawLast, rawFirst + ".");

  // 4. Hyphenated first name → initials: "Jean-Carlos" → "J.C." and "JC"
  if (rawFirst.includes("-")) {
    const parts = rawFirst.split("-");
    add(rawLast, parts.map(p => p[0] + ".").join(""));  // "J.C."
    add(rawLast, parts.map(p => p[0]).join(""));         // "JC"
  }

  // 5. Last name hyphen variants: "Fitz-Gerald" → "Fitz Gerald", "FitzGerald"
  if (rawLast.includes("-")) {
    add(rawLast.replace(/-/g, " "), rawFirst);
    add(rawLast.replace(/-/g, ""),  rawFirst);
  }

  // 5b. Accent-stripped last name only (e.g. "Peña" → "Pena")
  if (aLast !== rawLast) add(aLast, "");

  // 5c. First segment of hyphenated last name: "Fitz-Gerald" → "Fitz"
  if (rawLast.includes("-")) add(rawLast.split("-")[0], "");

  // 6. Last name only — broadest fallback
  add(rawLast, "");

  return variants;
}

// Fill the Fantrax claim search box with a search string and wait for results.
async function tryFillAdd(searchStr) {
  const input = document.getElementById("txtNameSearch");
  if (!input) return 0;
  input.value = searchStr;
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  await delay(800); // wait for async search to populate #tblPool
  return document.querySelectorAll("#tblPool tbody tr").length;
}

// Try all name variants in order. Returns { ok, count, searchStr }.
// ok=true means exactly 1 result found — safe to proceed.
// ok=false means 0 (not found) or >1 (ambiguous) — caller should alert.
async function fillAddWithFallback(player) {
  const variants = nameVariants(player);

  for (const searchStr of variants) {
    const count = await tryFillAdd(searchStr);
    console.log(`[EXT] claim search "${searchStr}" → ${count} result(s)`);
    if (count === 1) return { ok: true, count, searchStr };
    if (count  > 1) {
      // Disambiguate by MLB team when available
      if (player.mlbTeam) {
        const mlbRe = new RegExp(`\\b${player.mlbTeam}\\b`);
        const rows  = [...document.querySelectorAll("#tblPool tbody tr")];
        const match = rows.find(r => mlbRe.test(r.textContent));
        if (match) {
          match.click();
          await delay(600);
          return { ok: true, count, searchStr };
        }
      }
      return { ok: false, count, searchStr }; // ambiguous — stop here
    }
    // count === 0: try next variant
  }

  return { ok: false, count: 0, searchStr: variants[0] };
}

function selectDrop(player) {
  const ddTeams   = document.getElementById("ddTeams");
  const selectedId = ddTeams?.value;
  const teamTable  = selectedId ? document.querySelector(`#tblTeam_${selectedId}`) : null;
  const rows = teamTable ? teamTable.querySelectorAll("tr") : document.querySelectorAll("#dvTeam tr");
  // Fantrax shows active-slot rows as "First Last", reserve-slot rows as "Last, First"
  const fullName     = `${player.first} ${player.last}`.toLowerCase();
  const reversedName = `${player.last}, ${player.first}`.toLowerCase();
  const lastLower    = player.last.toLowerCase();

  // Pass 1: exact full name — handles both display formats
  for (let row of rows) {
    const nameCell = row.querySelector(".player a");
    if (!nameCell) continue;
    const cellText = nameCell.innerText.trim().toLowerCase();
    if (cellText === fullName || cellText === reversedName) {
      row.click();
      return true;
    }
  }
  // Pass 2: last name substring — fallback for suffix variants (Jr., Sr., III, etc.)
  for (let row of rows) {
    const nameCell = row.querySelector(".player a");
    if (!nameCell) continue;
    if (nameCell.innerText.trim().toLowerCase().includes(lastLower)) {
      row.click();
      return true;
    }
  }

  console.warn("[EXT] selectDrop: no match for", player.first, player.last);
  return false;
}

// ── Trade helpers ─────────────────────────────────────────────────────────────

function selectTradeTeam(side, teamName) {
  const id = side === "left" ? "ddTeamsLeft" : "ddTeamsRight";
  const select = document.getElementById(id);
  if (!select) return false;

  for (let opt of select.options) {
    if (normalizeTeamName(opt.text) === teamName) {
      select.value = opt.value;
      select.dispatchEvent(new Event("change"));
      return true;
    }
  }
  console.warn("[EXT] selectTradeTeam: not found:", teamName, "in", side);
  return false;
}

function clickTradePlayer(player, side) {
  // tml_ = left team's players (trading to right); tmr_ = right team's players
  const prefix  = side === "left" ? "tml_" : "tmr_";
  const rows     = document.querySelectorAll(`tr[id^="${prefix}"]`);
  const fullName = `${player.first} ${player.last}`.toLowerCase();
  const lastName = player.last.replace(/'/g, "");
  const lastRe   = new RegExp(`\\b${lastName}\\b`, "i");

  // Pass 1: exact full name
  for (let row of rows) {
    const nameEl = row.querySelector(".name a.hand");
    if (!nameEl) continue;
    if (nameEl.innerText.trim().toLowerCase() === fullName) {
      row.querySelector("a.pointer")?.click();
      return true;
    }
  }
  // Pass 2: whole-word last name
  for (let row of rows) {
    const nameEl = row.querySelector(".name a.hand");
    if (!nameEl) continue;
    if (lastRe.test(nameEl.innerText.trim())) {
      row.querySelector("a.pointer")?.click();
      return true;
    }
  }

  console.warn("[EXT] clickTradePlayer: not found:", player.first, player.last, "in", side);
  return false;
}

async function waitForOKAndClick(maxMs = 8000, forceDropAction = false) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const alertBox = document.getElementById("dvAlertBox");
    if (alertBox && alertBox.style.display !== "none") {
      const btn = alertBox.querySelector(".filterButton.curve2");
      if (btn && btn.textContent.trim() === "OK") {
        // If this is a drop transaction, force the action dropdown to "Drop" (value 1).
        // Fantrax defaults to "Move to IR" for IL-eligible players.
        // __submitIndeed reads the dropdown value at runtime — do NOT call
        // __claimRosterActionChanged(), which resets the value back to IR for
        // IL-eligible players and is the root cause of the incorrect submission.
        if (forceDropAction) {
          const actionDd = alertBox.querySelector("#ddClaimRosterAction");
          if (actionDd) actionDd.value = "1"; // "Drop" — set silently, no event dispatch
        }
        const okBtn = alertBox.querySelector(".filterButton.curve2");
        if (!okBtn || okBtn.textContent.trim() !== "OK") { await delay(300); continue; }
        okBtn.click();
        await delay(400);
        return true;
      }
    }
    await delay(300);
  }
  console.warn("[EXT] OK popup not found within", maxMs, "ms");
  return false;
}

// Click the Fantrax submit button then dismiss OK popups.
// forceDropAction=true: ensure the Choose... popup uses "Drop" not "Move to IR".
// expectedPopups: if known, click exactly that many with no dead-wait after the last.
//                 if null (default), loop until no popup appears within 600ms.
async function clickSubmitAndAwaitPopups(forceDropAction = false, expectedPopups = null) {
  const submitBtn = document.querySelector(".filterButton.filterCenter");
  if (!submitBtn) { console.warn("[EXT] Submit button not found"); return; }
  submitBtn.click();

  if (expectedPopups !== null) {
    for (let i = 0; i < expectedPopups; i++) {
      const maxMs  = i === 0 ? 6000 : 8000; // generous window for Success! — server-side IL/drop ops can be slow
      const force  = i === 0 ? forceDropAction : false;
      if (i > 0) await delay(300); // brief settle before Success! popup to avoid missing the click
      const clicked = await waitForOKAndClick(maxMs, force);
      if (!clicked) break; // popup didn't appear — stop early
    }
  } else {
    // Unknown count — loop with short timeout so we don't over-wait
    let clicked = await waitForOKAndClick(6000, forceDropAction);
    while (clicked) {
      clicked = await waitForOKAndClick(600);
    }
  }
}

async function processTrade(tx) {
  const [teamLeft, teamRight] = tx.teams;

  selectTradeTeam("left", teamLeft);
  await delay(1500);
  selectTradeTeam("right", teamRight);
  await delay(2000); // wait for both rosters to load

  for (const player of (tx.sides[teamLeft] || [])) {
    clickTradePlayer(player, "left");
    await delay(600);
  }
  for (const player of (tx.sides[teamRight] || [])) {
    clickTradePlayer(player, "right");
    await delay(600);
  }

  await delay(500);

  // Submit Trade button
  let submitted = false;
  for (let btn of document.querySelectorAll(".filterButton.curve2")) {
    if (btn.textContent.includes("Submit Trade")) {
      btn.click();
      submitted = true;
      break;
    }
  }
  if (!submitted) console.warn("[EXT] Submit Trade button not found");

  // Wait for the success popup then click OK.
  // Send TRANSACTION_DONE immediately after clicking — before any delay — so
  // background.js nulls out expectedPath before the trade page auto-reload
  // fires tabs.onUpdated. If we wait 400ms first, the reload may beat the message
  // and cause RUN_NEXT to fire on the freshly-loaded trade page.
  const start = Date.now();
  while (Date.now() - start < 8000) {
    const alertBox = document.getElementById("dvAlertBox");
    if (alertBox && alertBox.style.display !== "none") {
      const btn = alertBox.querySelector(".filterButton.curve2");
      if (btn && btn.textContent.trim() === "OK") {
        btn.click();
        browser.runtime.sendMessage({ type: "TRANSACTION_DONE" }).catch(() => {});
        return; // page will reload and destroy this script — nothing more to do
      }
    }
    await delay(300);
  }
  console.warn("[EXT] Trade success popup not found within 8s");
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

async function processNext() {
  const tx = await browser.runtime.sendMessage({ type: "GET_NEXT" });

  if (!tx) {
    await browser.runtime.sendMessage({ type: "PROCESSING_DONE" });
    alert("No more transactions.");
    return;
  }

  const onTradePage = location.href.includes("trade.go");
  const onClaimPage = location.href.includes("claimDrop");

  if (tx.type === "TRADE") {
    if (!onTradePage) {
      await browser.runtime.sendMessage({ type: "REWIND_QUEUE" });
      alert("Navigate to the Fantrax Commissioner Trade page for this transaction.");
      return;
    }
    await processTrade(tx); // TRANSACTION_DONE sent inside processTrade before page reloads
    return;
  }

  if (!onClaimPage) {
    await browser.runtime.sendMessage({ type: "REWIND_QUEUE" });
    alert("Navigate to the Fantrax Commissioner Claim/Drop page for this transaction.");
    return;
  }

  if (tx.team) selectTeam(tx.team);
  await delay(1200); // wait for team roster to load

  if (tx.add) {
    // ── Fill add player ──
    const result = await fillAddWithFallback(tx.add);

    if (!result.ok) {
      const playerName = `${tx.add.first} ${tx.add.last}`;
      const ts = new Date().toLocaleTimeString();
      if (result.count === 0) {
        alert(
          `[${ts}] No Fantrax result found for: ${playerName}\n\n` +
          `All name variants were tried. Please search for the player manually and complete this transaction on Fantrax.`
        );
      } else {
        alert(
          `[${ts}] ${result.count} results found for "${result.searchStr}" (${playerName})\n\n` +
          `Multiple players matched. Please select the correct player and complete this transaction manually on Fantrax.`
        );
      }
      browser.runtime.sendMessage({ type: "STOP_AUTO" }).catch(() => {});
      browser.runtime.sendMessage({ type: "QUEUE_REFRESH" }).catch(() => {});
      return;
    }

    // ── ADD-only ──
    if (!tx.drop) {
      await delay(400);
      // All claim/drop transactions show 2 popups: Choose... + Success!
      await clickSubmitAndAwaitPopups(false, 2);
      browser.runtime.sendMessage({ type: "TRANSACTION_DONE" }).catch(() => {});
      return;
    }
  }

  // ── ADD+DROP or DROP-only ──
  await delay(800);
  if (tx.drop) selectDrop(tx.drop);

  await delay(1200);
  // All claim/drop transactions show 2 popups: Choose... + Success!
  // forceDropAction=true overrides "Move to IR" default in the Choose... popup.
  await clickSubmitAndAwaitPopups(!!tx.drop, 2);
  browser.runtime.sendMessage({ type: "TRANSACTION_DONE" }).catch(() => {});
}

// ── Draft import helpers (playerImport.go) ────────────────────────────────────

function poolRows() {
  return [...document.querySelectorAll("#tblPool tbody tr, #tblPool thead tr")]
    .filter(r => !r.querySelector("td[colspan]") && r.querySelector("td.draft"));
}

async function doSearch(term) {
  const input = document.getElementById("txtNameSearch");
  if (!input) return 0;
  input.value = term;
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  await delay(900);
  return poolRows().length;
}

async function findAndClickPlayer(player) {
  const reversedName = player.first ? `${player.last}, ${player.first}`.trim() : player.last;
  const mlbRe = player.mlbTeam ? new RegExp(`\\b${player.mlbTeam}\\b`) : null;
  const variants = nameVariants(player);

  for (const term of variants) {
    const count = await doSearch(term);
    if (count === 0) continue;

    const rows = poolRows();

    // Single result — click its draft icon
    if (count === 1) {
      const draftLink = rows[0].querySelector("td.draft a");
      if (draftLink) { draftLink.click(); await delay(600); return true; }
    }

    // Pass 1: exact name + team (e.g. "Smith, Will" LAD C vs RP N/A)
    if (mlbRe) {
      for (const row of rows) {
        const nameTxt = row.querySelector("td.player a")?.textContent.trim() || "";
        if (nameTxt === reversedName && mlbRe.test(row.textContent)) {
          const draftLink = row.querySelector("td.draft a");
          if (draftLink) { draftLink.click(); await delay(600); return true; }
        }
      }
    }

    // Pass 2: exact name only
    for (const row of rows) {
      const nameTxt = row.querySelector("td.player a")?.textContent.trim() || "";
      if (nameTxt === reversedName) {
        const draftLink = row.querySelector("td.draft a");
        if (draftLink) { draftLink.click(); await delay(600); return true; }
      }
    }

    // Pass 3: team only — last resort, only for last-name-only searches (not "Last, First")
    if (!term.includes(",") && mlbRe) {
      for (const row of rows) {
        if (mlbRe.test(row.textContent)) {
          const draftLink = row.querySelector("td.draft a");
          if (draftLink) { draftLink.click(); await delay(600); return true; }
        }
      }
    }
  }
  return false;
}

async function runImport() {
  const res   = await browser.runtime.sendMessage({ type: "GET_QUEUE" });
  const picks = (res.queue || []).filter(tx => tx.type === "DRFT" && tx.add);

  if (!picks.length) {
    alert("[EXT] No DRFT transactions in queue.\nLoad the ESPN draft recap page first.");
    return;
  }

  // Sort by idx descending (highest idx = pick 1 = oldest) to get overall pick order
  const sorted = [...picks].sort((a, b) => b.idx - a.idx);

  // Group by ESPN team, preserving pick order within each team
  const teamMap = new Map();
  for (const tx of sorted) {
    if (!teamMap.has(tx.team)) teamMap.set(tx.team, []);
    teamMap.get(tx.team).push(tx);
  }

  // Order teams by their first overall pick (slot 1 = team with pick 1, etc.)
  const teamFirstPickPos = new Map(sorted.map((tx, i) => [tx.team, i]).reverse());
  const ordered = [...teamMap.entries()]
    .sort((a, b) => teamFirstPickPos.get(a[0]) - teamFirstPickPos.get(b[0]));

  const ddTeams = document.getElementById("ddTeams");
  const options = [...ddTeams.options];

  // Normalize team name for fuzzy matching: lowercase, collapse curly/smart quotes
  const norm = s => s.trim().toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u201c\u201d]/g, '"');

  let processed = 0;

  for (let i = 0; i < ordered.length; i++) {
    const [espnTeam, teamPicks] = ordered[i];
    const slot = i + 1;

    // 1. Exact name match
    // 2. Case-insensitive name match
    // 3. Normalized name match (handles apostrophe variants, etc.)
    // 4. Legacy fallback: option text is the numeric slot number
    const opt = options.find(o => o.text.trim() === espnTeam)
      || options.find(o => o.text.trim().toLowerCase() === espnTeam.toLowerCase())
      || options.find(o => norm(o.text) === norm(espnTeam))
      || options.find(o => o.text.trim() === String(slot));

    if (!opt) {
      alert(
        `[EXT Import] No Fantrax team found for ESPN team "${espnTeam}".\n\n` +
        `Make sure Fantrax team names match ESPN team names, then restart the import.`
      );
      return;
    }

    ddTeams.value = opt.value;
    ddTeams.dispatchEvent(new Event("change", { bubbles: true }));
    await delay(1200);

    console.log(`[EXT Import] "${espnTeam}" → Fantrax "${opt.text.trim()}": ${teamPicks.length} picks`);

    for (const tx of teamPicks) {
      const name = `${tx.add.first} ${tx.add.last}`.trim();
      const ok = await findAndClickPlayer(tx.add);
      if (!ok) {
        alert(
          `[EXT Import] Player not found — import stopped.\n\n` +
          `Player: ${name}\n` +
          `Team: ${espnTeam}\n\n` +
          `Add this player manually, then restart the import.`
        );
        return;
      }
      processed++;
      await delay(300);
    }

    // Verify the team table now has exactly the right number of players.
    // Fantrax places player rows in <thead> (not <tbody>); player rows have an id attribute.
    const teamTable   = document.querySelector(`#tblTeam_${opt.value}`);
    const actualCount = teamTable
      ? teamTable.querySelectorAll("thead tr[id]").length
      : -1;
    if (actualCount !== teamPicks.length) {
      alert(
        `[EXT Import] Team count mismatch — import stopped.\n\n` +
        `Team: ${espnTeam}\n` +
        `Expected: ${teamPicks.length} players\n` +
        `Found in table: ${actualCount}\n\n` +
        `Check the team roster, correct it manually, then restart the import.`
      );
      return;
    }
  }

  // ── Finish Draft ───────────────────────────────────────────────────────────

  const finishBtn = [...document.querySelectorAll("#dvDraftSaveButtons .filterButton")]
    .find(el => el.textContent.trim() === "Finish Draft");
  if (!finishBtn) {
    alert("[EXT Import] Could not find \"Finish Draft\" button — please click it manually.");
    return;
  }
  finishBtn.click();
  await delay(800);

  const okBtn = [...document.querySelectorAll(".filterButton")]
    .find(el => el.textContent.trim() === "OK"
             && el.getAttribute("onclick")?.includes("__doFinishDraft"));
  if (!okBtn) {
    alert("[EXT Import] Could not find \"OK\" confirmation button — please click it manually.");
    return;
  }
  okBtn.click();

  // Wait for "DRAFT COMPLETED" message to appear (up to 30s)
  const completed = await new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      const el = document.getElementById("dvDraftCompletedMsg");
      if (el && el.offsetParent !== null) return resolve(true);
      if (Date.now() - start > 30000) return resolve(false);
      setTimeout(check, 500);
    };
    check();
  });

  if (!completed) {
    alert("[EXT Import] Draft completion not confirmed after 30s — check the page manually.");
    return;
  }

  console.log("[EXT Import] Draft completed successfully.");
  browser.runtime.sendMessage({ type: "TRANSACTION_DONE", drftBatch: true }).catch(() => {});
}

// ── Message listener ──────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "RUN_NEXT" || msg.type === "NEXT_TRANSACTION") processNext();
  if (msg.type === "RUN_IMPORT") runImport();
});
