let queue = [];
let index = 0;
let prevIndex = 0;
const seenKeys    = new Set();
const excludedKeys = new Set();
let upperCutoff = null; // "YYYY-MM-DD HH:MM" or null

function txKey(tx) {
  const t = tx.date ? new Date(tx.date).getTime() : 0;

  if (tx.type === "TRADE") {
    // key = sorted list of all player names + timestamp (order-independent)
    const players = Object.values(tx.sides || {})
      .flat()
      .map(p => `${p.first}|${p.last}`)
      .sort()
      .join(",");
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
    return Promise.resolve({ queue, index, excludedKeys: [...excludedKeys] });
  }

  if (msg.type === "REWIND_QUEUE") {
    index = prevIndex;
    updateBadge();
    return Promise.resolve();
  }

  if (msg.type === "SET_UPPER_CUTOFF") {
    upperCutoff = msg.value || null;
    updateBadge();
    return Promise.resolve();
  }

  if (msg.type === "TOGGLE_EXCLUDE") {
    const key = msg.key;
    if (excludedKeys.has(key)) excludedKeys.delete(key);
    else                        excludedKeys.add(key);
    updateBadge();
    browser.runtime.sendMessage({ type: "QUEUE_UPDATED" }).catch(() => {});
    return Promise.resolve();
  }

  if (msg.type === "PROCESSING_DONE") {
    return (async () => {
      if (upperCutoff) {
        await browser.storage.local.set({ cutoff: upperCutoff });
        await browser.storage.local.remove("upperCutoff"); // clear so next popup open defaults to now
        browser.runtime.sendMessage({ type: "CUTOFF_SAVED" }).catch(() => {});
      }
    })();
  }

  if (msg.type === "GET_NEXT") {
    return (async () => {

      const cutoff = await getCutoffDate();
      const upper  = upperCutoff ? parseCutoffStr(upperCutoff) : null;
      prevIndex = index;

      while (index < queue.length) {
        const tx = queue[index++];

        if (!tx.date) continue;

        const txDate = new Date(tx.date);
        if (txDate < cutoff) continue;
        if (upper && txDate > upper) continue;
        if (excludedKeys.has(txKey(tx))) continue;

        updateBadge();
        return tx;
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
  const upper  = upperCutoff ? parseCutoffStr(upperCutoff) : null;
  const remaining = queue.slice(index).filter(tx => {
    if (!tx.date) return false;
    const d = new Date(tx.date);
    if (d < cutoff) return false;
    if (upper && d > upper) return false;
    if (excludedKeys.has(txKey(tx))) return false;
    return true;
  }).length;

  browser.browserAction.setBadgeText({ text: remaining > 0 ? String(remaining) : "" });
  browser.browserAction.setBadgeBackgroundColor({ color: "#1a73e8" });
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.cutoff) updateBadge();
});