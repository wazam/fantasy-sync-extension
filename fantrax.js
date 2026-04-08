console.log("[EXT] content script injected:", location.href);

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function normalizeTeamName(raw) {
  return raw.trim().replace(/\s*\*+\s*$/, "");
}

// ── Claim/Drop helpers ────────────────────────────────────────────────────────

function formatFantraxName(player) {
  const last = player.last.replace(/'/g, "");
  return `${last}, ${player.first}`;
}

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

function fillAdd(player) {
  const input = document.getElementById("txtNameSearch");
  if (!input) return;
  input.value = formatFantraxName(player);
  input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
}

function selectDrop(player) {
  const rows = document.querySelectorAll("#dvTeam tr");
  const fullName = `${player.first} ${player.last}`.toLowerCase();
  const lastNameRe = new RegExp(`\\b${player.last}\\b`, "i");

  for (let row of rows) {
    const nameCell = row.querySelector(".player a");
    if (!nameCell) continue;
    if (nameCell.innerText.trim().toLowerCase() === fullName) {
      row.click();
      return true;
    }
  }
  for (let row of rows) {
    const nameCell = row.querySelector(".player a");
    if (!nameCell) continue;
    if (lastNameRe.test(nameCell.innerText.trim())) {
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

async function waitForOKAndClick(maxMs = 6000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    for (let btn of document.querySelectorAll(".filterButton.curve2")) {
      if (btn.textContent.trim() === "OK") {
        btn.click();
        return true;
      }
    }
    await delay(300);
  }
  console.warn("[EXT] Trade OK popup not found within", maxMs, "ms");
  return false;
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

  // Click OK on success popup, then page reloads automatically
  await waitForOKAndClick();
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

async function processNext() {
  const tx = await browser.runtime.sendMessage({ type: "GET_NEXT" });

  if (!tx) {
    alert("No more transactions.");
    return;
  }

  const onTradePage    = location.href.includes("trade.go");
  const onClaimPage    = location.href.includes("claimDrop");

  if (tx.type === "TRADE") {
    if (!onTradePage) {
      await browser.runtime.sendMessage({ type: "REWIND_QUEUE" });
      alert("Navigate to the Fantrax Commissioner Trade page for this transaction.");
      return;
    }
    await processTrade(tx);
    return;
  }

  if (!onClaimPage) {
    await browser.runtime.sendMessage({ type: "REWIND_QUEUE" });
    alert("Navigate to the Fantrax Commissioner Claim/Drop page for this transaction.");
    return;
  }

  if (tx.team) selectTeam(tx.team);

  // ADD-only: team roster loads so commissioner can move a player to IR, then submit manually
  if (tx.add && !tx.drop) {
    setTimeout(() => {
      fillAdd(tx.add);
      alert(
        `ADD ONLY \u2014 [${tx.team}]\n` +
        `Claim: ${tx.add.first} ${tx.add.last}\n\n` +
        `The team roster is now loaded below.\n` +
        `Move a player to IR to free a slot, then click Submit manually.`
      );
    }, 1200);
    return;
  }

  setTimeout(() => {
    if (tx.add) fillAdd(tx.add);

    setTimeout(() => {
      if (tx.drop) selectDrop(tx.drop);

      setTimeout(() => {
        const submitBtn = document.querySelector(".filterButton.filterCenter");
        if (submitBtn) {
          submitBtn.click();
        } else {
          console.warn("[EXT] Submit button not found");
        }
      }, 1200);

    }, 1200);

  }, 1200);
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "RUN_NEXT" || msg.type === "NEXT_TRANSACTION") {
    processNext();
  }
});
