console.log("[EXT] content script injected:", location.href);

function formatFantraxName(player) {
  const last = player.last.replace(/'/g, "");
  return `${last}, ${player.first}`;
}

function selectTeam(teamName) {
  const select = document.getElementById("ddTeams");
  if (!select) return false;

  for (let opt of select.options) {
    // strip trailing " *" that Fantrax appends to the commissioner's team
    const optText = opt.text.trim().replace(/\s*\*+\s*$/, "");
    if (optText === teamName) {
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
  const fullName  = `${player.first} ${player.last}`.toLowerCase();
  const lastName  = player.last.toLowerCase();

  // pass 1: exact full name match
  for (let row of rows) {
    const nameCell = row.querySelector(".player a");
    if (!nameCell) continue;
    if (nameCell.innerText.trim().toLowerCase() === fullName) {
      row.click();
      return true;
    }
  }

  // pass 2: exact last name match (whole word, not substring)
  const lastNameRe = new RegExp(`\\b${lastName}\\b`, "i");
  for (let row of rows) {
    const nameCell = row.querySelector(".player a");
    if (!nameCell) continue;
    if (lastNameRe.test(nameCell.innerText.trim())) {
      row.click();
      return true;
    }
  }

  console.warn("[EXT] selectDrop: no match found for", player.first, player.last);
  return false;
}

async function processNext() {
  const tx = await browser.runtime.sendMessage({ type: "GET_NEXT" });

  if (!tx) {
    alert("No more transactions.");
    return;
  }

  if (tx.team) selectTeam(tx.team);

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

        confirm(
          `Submitted: [${tx.team}]\n` +
          `Add: ${tx.add ? tx.add.first + " " + tx.add.last : "-"}\n` +
          `Drop: ${tx.drop ? tx.drop.first + " " + tx.drop.last : "-"}\n\n` +
          `OK to continue to next transaction.`
        );
      }, 1200);

    }, 1200);

  }, 1200);
}

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "RUN_NEXT" || msg.type === "NEXT_TRANSACTION") {
    processNext();
  }
});