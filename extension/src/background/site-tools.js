/**
 * URL ↔ tool rules (kept in sync with `popup.js` isToolRelevantOnPage + tool keys).
 * Used to show how many tools are on for the active tab in the action icon.
 */
export const TOOL_REGISTRY = [
  {
    key: "tool.listingFindHelper",
    test: (u) => /immotop\.lu|athome\.lu|wortimmo\.lu/i.test(u)
  },
  {
    key: "tool.listingPageFormatCommand",
    test: (u) => /pro\.immotop\.lu\/my-listings/i.test(u)
  },
  {
    key: "tool.easyListingCreatorHelper",
    test: (u) => /nexvia1832\.easy-serveur53\.com/i.test(u)
  },
  {
    key: "tool.addAgentToNexviaSite",
    test: (u) => /https:\/\/www\.nexvia\.lu\/(?:[\w-]+\/)?(buy|rent)/i.test(u)
  },
  {
    key: "tool.advancedNexviaFilters",
    test: (u) => /https:\/\/www\.nexvia\.lu\/(?:[\w-]+\/)?(buy|rent)/i.test(u)
  },
  {
    key: "tool.modernPropertyCards",
    test: (u) => /https:\/\/www\.nexvia\.lu\/(?:[\w-]+\/)?(buy|rent)/i.test(u)
  },
  {
    key: "tool.easyUiCleanerV321",
    test: (u) => /easy-serveur53\.com/i.test(u)
  },
  {
    key: "tool.easyPhotoUpgrader",
    test: (u) => /easy-serveur53\.com/i.test(u)
  },
  {
    key: "tool.easyReferenceInsert",
    test: (u) => /easy-serveur53\.com/i.test(u)
  },
  {
    key: "tool.continuousAdBudgetWarning",
    test: (u) => /facebook\.com/i.test(u)
  }
];

/** Toolbar icon: active site with ≥1 tool on */
export const NEXVIA_BLUE = "#1F4099";
/** Toolbar icon: no active tools (or inapplicable page) */
export const INACTIVE_BG = "#999999";
/** “Notification” count bubble: dark blue, white number */
export const NOTIFICATION_BUBBLE = "#0a1f3d";

/**
 * @param {string|undefined} url
 * @param {Record<string, boolean>} store `chrome.storage.sync` subset
 * @returns {number}
 */
export function countActiveToolsForUrl(url, store) {
  if (!url || !/^https?:/i.test(url)) {
    return 0;
  }
  let n = 0;
  for (const { key, test } of TOOL_REGISTRY) {
    if (!test(url)) continue;
    const on = store[key] !== undefined ? store[key] : true;
    if (on) n += 1;
  }
  return n;
}
