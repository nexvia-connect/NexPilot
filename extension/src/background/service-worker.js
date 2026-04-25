// MV3 service worker: toolbar icon = full Nexvia blue tile, max white hex, blue count inside hex (no side badge).
import { TOOL_REGISTRY, countActiveToolsForUrl } from "./site-tools.js";
import { buildActionIconForSizes } from "./draw-action-icon.js";
import { NP_TOOLS_MASTER_KEY } from "./np-constants.js";

const TOOL_KEYS = TOOL_REGISTRY.map((t) => t.key);
const BLANK = buildActionIconForSizes(0);

async function getEnabledToolStore() {
  const s = await chrome.storage.sync.get(TOOL_KEYS.concat(NP_TOOLS_MASTER_KEY));
  if (s[NP_TOOLS_MASTER_KEY] === false) {
    return Object.fromEntries(TOOL_KEYS.map((k) => [k, false]));
  }
  return s;
}

/**
 * @param {chrome.tabs.Tab} tab
 * @param {Record<string, boolean>} [store] optional pre-fetched store
 */
async function applyActionIconForTab(tab, store) {
  if (tab == null || tab.id == null) {
    return;
  }
  const s = store ?? (await getEnabledToolStore());
  const url = tab.url || "";
  const n = url.startsWith("http") ? countActiveToolsForUrl(url, s) : 0;
  const imageData = n > 0 ? buildActionIconForSizes(n) : BLANK;
  const title =
    n > 0
      ? `NexPilot — ${n} active tool${n === 1 ? "" : "s"} on this page`
      : "NexPilot";
  const id = tab.id;
  const apply = async () => {
    await chrome.action.setIcon({ tabId: id, imageData });
    await chrome.action.setTitle({ tabId: id, title });
    await chrome.action.setBadgeText({ tabId: id, text: "" });
  };
  try {
    await apply();
  } catch {
    // Older Chrome: setIcon may not support tabId
    try {
      await chrome.action.setIcon({ imageData });
      await chrome.action.setTitle({ title });
      await chrome.action.setBadgeText({ text: "" });
    } catch (e2) {
      // eslint-disable-next-line no-console
      console.warn("[NexPilot] setIcon failed", e2);
    }
  }
}

async function refreshIconsForAllActiveTabs() {
  const store = await getEnabledToolStore();
  const tabs = await chrome.tabs.query({ active: true });
  for (const t of tabs) {
    if (t.id != null) {
      await applyActionIconForTab(t, store);
    }
  }
}

function scheduleRefresh() {
  void refreshIconsForAllActiveTabs();
}

chrome.runtime.onInstalled.addListener(() => {
  // eslint-disable-next-line no-console
  console.log("[NexPilot] installed");
  scheduleRefresh();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleRefresh();
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  void (async () => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      await applyActionIconForTab(tab);
    } catch {
      // tab may be gone
    }
  })();
});

chrome.tabs.onUpdated.addListener((_id, changeInfo, tab) => {
  if (tab?.id == null) return;
  if (changeInfo.url != null) {
    void applyActionIconForTab(tab);
    return;
  }
  if (changeInfo.status === "complete") {
    void applyActionIconForTab(tab);
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "sync") return;
  if (
    !Object.keys(changes).some(
      (k) => TOOL_KEYS.includes(k) || k === NP_TOOLS_MASTER_KEY
    )
  ) {
    return;
  }
  scheduleRefresh();
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "nn-reload-extension") {
    chrome.runtime.reload();
  }
});

/** Cross-origin text fetch (e.g. S3) when the page’s fetch is blocked by CORS. */
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "nexpilot:fetchUrlText" || !msg.url) return;
  (async () => {
    try {
      const r = await fetch(String(msg.url), { credentials: "omit" });
      if (!r.ok) {
        sendResponse({ ok: false, error: `HTTP ${r.status}` });
        return;
      }
      const t = await r.text();
      sendResponse({ ok: true, text: t });
    } catch (e) {
      sendResponse({ ok: false, error: (e && e.message) || "fetch failed" });
    }
  })();
  return true;
});

void refreshIconsForAllActiveTabs();
