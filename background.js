let queue = [];
let index = 0;

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
    queue.push(...msg.data);
    queue.sort((a, b) => a.date - b.date);
    index = 0;
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
          return tx;
        }
      }

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