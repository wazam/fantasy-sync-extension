let queue = [];
let index = 0;
const seenKeys = new Set();

function txKey(tx) {
  const t = tx.date ? new Date(tx.date).getTime() : 0;
  return [
    tx.team  || "",
    tx.type  || "",
    tx.add  ? tx.add.first  + "|" + tx.add.last  : "",
    tx.drop ? tx.drop.first + "|" + tx.drop.last : "",
    t
  ].join("||");
}

async function getCutoffDate() {
  const res = await browser.storage.local.get("cutoff");
  return parseCutoffStr(res.cutoff || "2026-03-29");
}

function parseCutoffStr(str) {
  const parts = str.trim().split(" ");
  const [y, m, d] = parts[0].split("-").map(Number);
  let hour = 0, min = 0;
  if (parts[1]) {
    const tp = parts[1].split(":").map(Number);
    hour = tp[0] || 0;
    min  = tp[1] || 0;
  }
  return new Date(y, m - 1, d, hour, min, 0);
}

browser.runtime.onMessage.addListener((msg) => {

  if (msg.type === "ESPN_TRANSACTIONS_APPEND") {
    const fresh = msg.data.filter(tx => {
      const key = txKey(tx);
      if (seenKeys.has(key)) return false;
      seenKeys.add(key);
      return true;
    });

    if (!fresh.length) {
      console.log("[EXT] No new transactions (all already indexed).");
      return;
    }

    queue.push(...fresh);
    // primary: oldest date first; tiebreaker: higher data-idx = older on ESPN page
    queue.sort((a, b) => a.date - b.date || b.idx - a.idx);
    index = 0;
    console.log("[EXT] Queue size:", queue.length, "(added", fresh.length, "new)");
    updateBadge();
    // notify popup if it happens to be open
    browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
  }

  if (msg.type === "GET_QUEUE") {
    return Promise.resolve({ queue, index });
  }

  if (msg.type === "GET_NEXT") {
    return (async () => {

      const cutoff = await getCutoffDate();

      while (index < queue.length) {
        const tx = queue[index++];

        if (!tx.date) continue;

        if (tx.date >= cutoff) {
          updateBadge();
          return tx;
        }
      }

      updateBadge();
      return null;
    })();
  }
});

browser.commands.onCommand.addListener(async (command) => {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab?.id || !isFantrax(tab)) {
    console.log("[EXT] Ignored: not Fantrax");
    return;
  }

  if (command === "next-transaction") {
    browser.tabs.sendMessage(tab.id, { type: "RUN_NEXT" });
  }
});

function isFantrax(tab) {
  return tab?.url?.includes("fantrax");
}

async function updateBadge() {
  const cutoff = await getCutoffDate();
  const remaining = queue.slice(index).filter(
    tx => tx.date && new Date(tx.date) >= cutoff
  ).length;

  browser.browserAction.setBadgeText({ text: remaining > 0 ? String(remaining) : "" });
  browser.browserAction.setBadgeBackgroundColor({ color: "#1a73e8" });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.cutoff) updateBadge();
});