// MV3 service worker (kept minimal for now).
// Later: central feature toggles, remote config, logs, hotkeys, etc.

chrome.runtime.onInstalled.addListener(() => {
  // eslint-disable-next-line no-console
  console.log("[Nexvia Novia] installed");
});

