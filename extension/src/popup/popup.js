const ASSIST = [
  {
    id: "listingFinder",
    key: "tool.listingFindHelper",
    name: "Listing Finder",
    desc: "Helps find the right listing on a page",
    hasOptions: false,
    hasEdit: false
  },
  {
    id: "formatChanger",
    key: "tool.listingPageFormatCommand",
    name: "Format Changer",
    desc: "Automatically upgrade and downgrade listing formats",
    hasOptions: false,
    hasEdit: false
  },
  {
    id: "listingCreator",
    key: "tool.easyListingCreatorHelper",
    name: "Easy Listing Creator",
    desc: "Helping hand to build a listing",
    hasOptions: true,
    hasEdit: false
  },
  {
    id: "continuousAdBudgetWarning",
    key: "tool.continuousAdBudgetWarning",
    name: "Meta Adcheck",
    desc: "Facebook: Payment summary warn, red highlight, Publish",
    hasOptions: true,
    hasEdit: false
  }
];

const NEXVIA_ENHANCEMENTS = [
  {
    id: "agentChip",
    key: "tool.addAgentToNexviaSite",
    name: "Agent Chip",
    desc: "Adds the agent contact pill to listings",
    hasOptions: true,
    hasEdit: false
  },
  {
    id: "advancedNexviaFilters",
    key: "tool.advancedNexviaFilters",
    name: "Advanced Filters",
    desc: "Modern filters; optional map view (options)",
    hasOptions: true,
    hasEdit: false
  },
  {
    id: "modernPropertyCards",
    key: "tool.modernPropertyCards",
    name: "Modern Cards",
    desc: "Improved property cards with preview features",
    hasOptions: false,
    hasEdit: false
  }
];

const OTHER_ENHANCEMENTS = [
  {
    id: "easyCleaner",
    key: "tool.easyUiCleanerV321",
    name: "Interface Cleaner",
    desc: "Cleans up Easy for easier navigation",
    hasOptions: true,
    hasEdit: false
  },
  {
    id: "easyPhotoUpgrader",
    key: "tool.easyPhotoUpgrader",
    name: "Photo Upgrader",
    desc: "Resizes photo cards and flags images that are not 3:2",
    hasOptions: false,
    hasEdit: false
  },
  {
    id: "easyReferenceInsert",
    key: "tool.easyReferenceInsert",
    name: "Description Helper",
    desc: "Autofills listing URL in description and small text corrections",
    hasOptions: true,
    hasEdit: false
  }
];

const ALL_ENHANCEMENTS = NEXVIA_ENHANCEMENTS.concat(OTHER_ENHANCEMENTS);

/** Sub-option of Advanced Filters; list/map on buy search (`nexvia-map-view.js`). */
const NEXVIA_MAP_VIEW_OPTION_KEY = "tool.nexviaMapView";
/** Advanced Filters: show the sort dropdown on Nexvia listings. */
const ENABLE_NEXVIA_SORTING_KEY = "option.advancedNexviaFilters.enableSorting";
/** Map view: 0–100, merges nearby pins on screen (see `nexvia-map-view.js`). */
const MAP_CLUSTER_FLEX_KEY = "option.nexviaMapView.clusterFlexibility";
const MAP_CLUSTER_FLEX_DEFAULT = 20;

function isPopupToggleTool(tool) {
  return (
    ASSIST.some((t) => t.key === tool.key) ||
    NEXVIA_ENHANCEMENTS.some((t) => t.key === tool.key) ||
    OTHER_ENHANCEMENTS.some((t) => t.key === tool.key)
  );
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.appendChild(c));
  return node;
}

/**
 * When a per-tool switch changes, the checkbox + CSS `:has()` already match state.
 * We only need to realign the Edit button — avoid `render()` (innerHTML + height
 * resync) so the pill can animate on stable DOM and the popup does not "shimmer".
 */
function updateToolRowAfterToggle(rowEl, tool, enabled, pageUrl, masterOn) {
  if (!rowEl || !tool.hasEdit) return;
  const editBtn = rowEl.querySelector("button.text-btn");
  if (!editBtn || editBtn.hidden) return;
  const onPageOk = isToolRelevantOnPage(tool, pageUrl);
  editBtn.disabled = !tool.hasEdit || !enabled || !onPageOk || !masterOn;
  if (!masterOn) {
    editBtn.title = 'Turn on "Enable tools" in the Settings tab.';
  } else {
    editBtn.title = !enabled || !onPageOk
      ? "Enable this tool and open a matching page."
      : "On-page show/hide (Start editing on the page)";
  }
}

/** Same gear path as the “Settings” tab in the tabbar (`popup.html`), for per-tool options buttons. */
const SETTINGS_GEAR_SVG_18 = `<svg xmlns="http://www.w3.org/2000/svg" class="cog-icon-svg" viewBox="0 0 24 24" width="18" height="18" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
<circle cx="12" cy="12" r="3"/>
</svg>`;

/**
 * Not a second gear: subtle 2×2 lead-in mark for each tool row.
 */
const TOOL_LEAD_SVG_16 = `<svg xmlns="http://www.w3.org/2000/svg" class="tool-lead-svg" viewBox="0 0 24 24" width="16" height="16" focusable="false" aria-hidden="true">
<circle cx="9" cy="9" r="1.5" fill="currentColor"/>
<circle cx="15" cy="9" r="1.5" fill="currentColor"/>
<circle cx="9" cy="15" r="1.5" fill="currentColor"/>
<circle cx="15" cy="15" r="1.5" fill="currentColor"/>
</svg>`;

function cogIcon() {
  const wrap = el("span", { class: "cog-icon" });
  wrap.innerHTML = SETTINGS_GEAR_SVG_18;
  return wrap;
}

function toolRowLeadIcon() {
  const wrap = el("span", { class: "tool-lead-icon" });
  wrap.innerHTML = TOOL_LEAD_SVG_16;
  return wrap;
}

function setStatus(text) {
  const s = document.getElementById("popupStatus");
  if (!s) return;
  if (!text) {
    s.textContent = "";
    s.hidden = true;
    return;
  }
  s.textContent = text;
  s.hidden = false;
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tabs[0] || null;
}

function isToolRelevantOnPage(tool, pageUrl) {
  if (!pageUrl) return false;
  if (tool.id === "listingFinder") {
    return /immotop\.lu|athome\.lu|wortimmo\.lu/i.test(pageUrl);
  }
  if (tool.id === "formatChanger") {
    return /pro\.immotop\.lu\/my-listings/i.test(pageUrl);
  }
  if (tool.id === "listingCreator") {
    return /nexvia1832\.easy-serveur53\.com/i.test(pageUrl);
  }
  if (
    tool.id === "agentChip" ||
    tool.id === "advancedNexviaFilters" ||
    tool.id === "modernPropertyCards"
  ) {
    return /https:\/\/www\.nexvia\.lu\/(?:[\w-]+\/)?(buy|rent)/i.test(pageUrl);
  }
  if (tool.id === "easyCleaner" || tool.id === "easyPhotoUpgrader" || tool.id === "easyReferenceInsert") {
    return /easy-serveur53\.com/i.test(pageUrl);
  }
  if (tool.id === "continuousAdBudgetWarning") {
    return /facebook\.com/i.test(pageUrl);
  }
  return false;
}

async function getToolStates() {
  const defaults = Object.fromEntries(
    ASSIST.map((t) => [t.key, true]).concat(ALL_ENHANCEMENTS.map((t) => [t.key, true]))
  );
  defaults[NEXVIA_MAP_VIEW_OPTION_KEY] = true;
  defaults[ENABLE_NEXVIA_SORTING_KEY] = true;
  defaults[MAP_CLUSTER_FLEX_KEY] = MAP_CLUSTER_FLEX_DEFAULT;
  const res = await chrome.storage.sync.get({ ...defaults, [NP_TOOLS_MASTER_KEY]: true });
  return res;
}

function isMasterOn(states) {
  return states[NP_TOOLS_MASTER_KEY] !== false;
}

async function setToolStates(next) {
  await chrome.storage.sync.set(next);
}

const AGENT_PILL_SIZE_KEY = "option.agentChipPillSizePx";
const AGENT_PILL_DEFAULT = 48;

const EASY_REF_KEY_URL = "option.easyRefInsert.urlInDescription";
const EASY_REF_KEY_DASH = "option.easyRefInsert.dashToHyphen";
const EASY_REF_DEFAULTS = { [EASY_REF_KEY_URL]: true, [EASY_REF_KEY_DASH]: true };

/** When false, all tools are inactive on pages (per-tool keys unchanged). */
const NP_TOOLS_MASTER_KEY = "nn.toolsMasterEnabled";

/** Last tab the user was on (for "last" start mode) */
const NP_POPUP_LAST_TAB_KEY = "nn.popupLastTab";

/**
 * Where to go when the popup opens: "last" (remember) or a fixed tab id.
 * Synced; default "last".
 */
const NP_POPUP_START_KEY = "nn.popupStartTab";

/** Legacy “enhancements” tab id stored in sync → Nexvia.lu (`nexvia-enhance`). */
function canonicalizeMainTab(tab) {
  if (tab === "enhancements") return "nexvia-enhance";
  return tab;
}

function isValidLastTab(tab) {
  const t = canonicalizeMainTab(tab);
  return t === "assist" || t === "nexvia-enhance" || t === "web-enhance" || t === "settings";
}

function isValidOpenPref(v) {
  if (v === "last") return true;
  return isValidLastTab(v);
}

let popupHeightSyncQueued = false;

/**
 * Sets :root --nn-main-body-content-min-px to (vertical padding of #mainBody +) the
 * largest natural height among the three tab panels so the popup is always tall
 * enough for the tallest tab without a document-level scroll.
 */
function getMainBodyInnerContentWidth() {
  const el = document.getElementById("mainBody");
  if (!el) return 0;
  const s = getComputedStyle(el);
  const pl = parseFloat(s.paddingLeft) || 0;
  const pr = parseFloat(s.paddingRight) || 0;
  return Math.max(0, el.clientWidth - pl - pr);
}

function applyTabPanelVisibleState() {
  const d = document.getElementById("nexpilotTabbar")?.getAttribute("data-active") || "assist";
  const pa = document.getElementById("panelAssist");
  const pn = document.getElementById("panelNexviaEnhance");
  const pw = document.getElementById("panelWebEnhance");
  const ps = document.getElementById("panelSettings");
  if (pa) pa.hidden = d !== "assist";
  if (pn) pn.hidden = d !== "nexvia-enhance";
  if (pw) pw.hidden = d !== "web-enhance";
  if (ps) ps.hidden = d !== "settings";
}

function syncPopupHeightToMaxTab() {
  const mainBody = document.getElementById("mainBody");
  if (!mainBody) return;
  const panels = Array.from(mainBody.querySelectorAll(":scope > .tabpanel"));
  if (panels.length < 1) return;

  const w = getMainBodyInnerContentWidth();
  if (w < 1) return;

  const s = getComputedStyle(mainBody);
  const py = (parseFloat(s.paddingTop) || 0) + (parseFloat(s.paddingBottom) || 0);

  let maxH = 0;
  for (const p of panels) {
    p.removeAttribute("hidden");
    p.removeAttribute("style");
    p.style.setProperty("position", "fixed", "important");
    p.style.setProperty("left", "-24000px", "important");
    p.style.setProperty("top", "0", "important");
    p.style.setProperty("width", `${w}px`, "important");
    p.style.setProperty("box-sizing", "border-box", "important");
    p.style.setProperty("visibility", "hidden", "important");
    p.style.setProperty("pointer-events", "none", "important");
    p.style.setProperty("height", "auto", "important");
    p.style.setProperty("min-height", "0", "important");
    p.style.setProperty("max-height", "none", "important");
    p.style.setProperty("flex", "0 0 auto", "important");
    const h = p.offsetHeight;
    if (h > maxH) maxH = h;
  }

  for (const p of panels) {
    p.removeAttribute("style");
  }
  applyTabPanelVisibleState();

  maxH = Math.max(80, maxH);
  const minBody = Math.ceil(maxH + py);
  document.documentElement.style.setProperty("--nn-main-body-content-min-px", `${minBody}px`);
}

function queueSyncPopupHeightToMaxTab() {
  if (popupHeightSyncQueued) return;
  popupHeightSyncQueued = true;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      popupHeightSyncQueued = false;
      syncPopupHeightToMaxTab();
    });
  });
}

/** Default on/off for every `tool.*` key plus the master switch (per-tool options are not touched). */
function buildDefaultToolSyncPayload() {
  const out = { [NP_TOOLS_MASTER_KEY]: true };
  for (const t of ASSIST) {
    out[t.key] = true;
  }
  for (const t of ALL_ENHANCEMENTS) {
    out[t.key] = true;
  }
  out[NEXVIA_MAP_VIEW_OPTION_KEY] = true;
  out[ENABLE_NEXVIA_SORTING_KEY] = true;
  return out;
}

let popupInitialTabSet = false;
let settingsPanelWired = false;
const CHECK_UPDATES_BTN_DEFAULT = "Check for updates";
/** How long the button shows a result (e.g. “Up to date”) before the label resets */
const UPDATE_CHECK_RESULT_MS = 2200;
/** After the label is reset, keep the button disabled & dimmed (Chrome throttles repeat checks) */
const UPDATE_CHECK_COOLDOWN_MS = 3500;

let checkUpdateUiTimers = { result: null, cooldown: null };
let checkUpdateInFlight = false;

function clearCheckUpdateUiTimers() {
  if (checkUpdateUiTimers.result) {
    clearTimeout(checkUpdateUiTimers.result);
    checkUpdateUiTimers.result = null;
  }
  if (checkUpdateUiTimers.cooldown) {
    clearTimeout(checkUpdateUiTimers.cooldown);
    checkUpdateUiTimers.cooldown = null;
  }
}

async function easyCleanerSend(tabId, action, extra = {}) {
  return chrome.tabs.sendMessage(tabId, { type: "nexpilot:easyUiCleaner", action, ...extra });
}

const SUBVIEW_PANEL = {
  easy: "easyCleanerOptions",
  agent: "agentChipOptions",
  advFilters: "advancedNexviaFiltersOptions",
  ref: "easyRefInsertOptions",
  listing: "listingCreatorOptions",
  meta: "metaAdcheckOptions"
};

const CABW_SUPPRESS_KEY = "option.continuousAdBudget.suppressIfPageContains";
const CABW_HIDE_PUBLISH_KEY = "option.continuousAdBudget.hidePublishButton";
const CABW_HIGHLIGHT_KEY = "option.continuousAdBudget.highlightRedIfPageContains";
const CABW_SUPPRESS_DEFAULT = "Your ad will run continuously.";
const CABW_HIGHLIGHT_DEFAULT = "Run ad continuously";

function shouldAnimateSubviewPanel() {
  if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return false;
  }
  return true;
}

const MAIN_SHELL_UNDER_OPTIONS_CLASS = "main-shell--under-options";

function subviewAnimNameOk(e, name) {
  const n = e && e.animationName;
  if (n == null || n === "") return true;
  return n === name || String(n).includes("nnpilot-subview");
}

/**
 * @param {HTMLElement} el
 * @param {(e: AnimationEvent) => void} onEnd
 */
function runWhenSubviewAnimDone(el, expectedName, onEnd) {
  const ms = 380;
  let done = false;
  const finish = (e) => {
    if (done) return;
    if (e) {
      if (e.target !== el) return;
      if (e.type === "animationend" && e.animationName && !subviewAnimNameOk(e, expectedName)) return;
    }
    done = true;
    clearTimeout(tid);
    el.removeEventListener("animationend", onAnim);
    onEnd();
  };
  const onAnim = (e) => finish(e);
  const tid = setTimeout(() => finish(null), ms);
  el.addEventListener("animationend", onAnim, { once: true });
}

/**
 * Show a tool options subview over the tab+body (swipe in from the right); hide + swipe out to the right.
 * @param {"easy"|"agent"|"advFilters"|"ref"|"listing"|"meta"} which
 * @param {boolean} open
 * @param {{ animate?: boolean }} [opts] Defaults to animate: true. Use false to swap panels instantly.
 */
function setSubviewState(which, open, opts) {
  const { animate = true } = opts || {};
  const subId = SUBVIEW_PANEL[which];
  const sub = subId ? document.getElementById(subId) : null;
  const mainShell = document.getElementById("mainShell");
  if (!mainShell || !sub) return;

  for (const id of Object.values(SUBVIEW_PANEL)) {
    const el = document.getElementById(id);
    if (!el || el === sub) continue;
    el.hidden = true;
    el.classList.remove("subview--animating-in", "subview--animating-out");
  }

  if (open) {
    sub.hidden = false;
    sub.classList.remove("subview--animating-out");
    mainShell.classList.add(MAIN_SHELL_UNDER_OPTIONS_CLASS);
    mainShell.setAttribute("aria-hidden", "true");
    mainShell.setAttribute("inert", "");
    if (animate && shouldAnimateSubviewPanel()) {
      sub.classList.remove("subview--animating-in");
      requestAnimationFrame(() => {
        runWhenSubviewAnimDone(sub, "nnpilot-subview-in", () => {
          sub.classList.remove("subview--animating-in");
          queueSyncPopupHeightToMaxTab();
        });
        sub.classList.add("subview--animating-in");
      });
    } else {
      queueSyncPopupHeightToMaxTab();
    }
    return;
  }

  const canExitAnim = animate && shouldAnimateSubviewPanel() && !sub.hasAttribute("hidden");
  if (canExitAnim) {
    sub.classList.remove("subview--animating-in");
    void sub.offsetWidth;
    runWhenSubviewAnimDone(sub, "nnpilot-subview-out", () => {
      sub.classList.remove("subview--animating-in", "subview--animating-out");
      sub.hidden = true;
      mainShell.classList.remove(MAIN_SHELL_UNDER_OPTIONS_CLASS);
      mainShell.removeAttribute("aria-hidden");
      mainShell.removeAttribute("inert");
      queueSyncPopupHeightToMaxTab();
    });
    sub.classList.add("subview--animating-out");
  } else {
    sub.classList.remove("subview--animating-in", "subview--animating-out");
    sub.hidden = true;
    mainShell.classList.remove(MAIN_SHELL_UNDER_OPTIONS_CLASS);
    mainShell.removeAttribute("aria-hidden");
    mainShell.removeAttribute("inert");
    queueSyncPopupHeightToMaxTab();
  }
}

function setEasyOptionsOpen(open, opts) {
  setSubviewState("easy", open, opts);
}

function setAgentOptionsOpen(open, opts) {
  setSubviewState("agent", open, opts);
}

function setListingCreatorOptionsOpen(open, opts) {
  setSubviewState("listing", open, opts);
}

function setEasyRefInsertOptionsOpen(open, opts) {
  setSubviewState("ref", open, opts);
}

function setMetaAdcheckOptionsOpen(open, opts) {
  setSubviewState("meta", open, opts);
}

function setAdvancedNexviaFiltersOptionsOpen(open, opts) {
  setSubviewState("advFilters", open, opts);
}

function setEasyPathsPanelOpen(open) {
  const p = document.getElementById("easyOptsPathsPanel");
  const b = document.getElementById("easyOptsShowPaths");
  if (p) p.hidden = !open;
  if (b) {
    b.textContent = open ? "Hide paths" : "Show paths";
    b.setAttribute("aria-expanded", open ? "true" : "false");
  }
}

/** Page has +/- overlay + bottom bar. Sync with easy-ui-cleaner `editMode` via message responses. */
function setEasyEditModeButton(isEditing) {
  const b = document.getElementById("easyOptsEditShowHide");
  if (!b) return;
  b.textContent = isEditing ? "Apply & exit" : "Start editing";
  b.setAttribute("aria-pressed", isEditing ? "true" : "false");
  b.setAttribute(
    "aria-label",
    isEditing
      ? "Apply changes and leave on-page show/hide mode (same as Confirm on the page)"
      : "Start on-page show/hide mode: use +/− on the page, then apply here or on the page"
  );
  b.title = isEditing
    ? "Same as Confirm in the page bar. Saves the current +/− choices and closes the on-page tools."
    : "Opens the same +/− mode on the page. You can also finish with Confirm in the bottom bar.";
}

let easyOptionsInited = false;
function initEasyOptionsPanel() {
  if (easyOptionsInited) return;
  easyOptionsInited = true;

  const back = document.getElementById("easyOptsBack");
  const close = document.getElementById("easyOptsClose");
  const save = document.getElementById("easyOptsSave");
  const reset = document.getElementById("easyOptsReset");
  const ta = document.getElementById("easyOptsTextarea");
  const hint = document.getElementById("easyOptsHint");

  const hideHint = () => {
    if (hint) {
      hint.textContent = "";
      hint.hidden = true;
    }
  };

  const goBack = () => {
    hideHint();
    setEasyOptionsOpen(false, { animate: true });
  };

  back?.addEventListener("click", goBack);
  close?.addEventListener("click", goBack);

  const showPathsBtn = document.getElementById("easyOptsShowPaths");
  showPathsBtn?.addEventListener("click", () => {
    const p = document.getElementById("easyOptsPathsPanel");
    if (!p) return;
    setEasyPathsPanelOpen(!!p.hidden);
  });

  save?.addEventListener("click", async () => {
    hideHint();
    setStatus("");
    const tab = await getActiveTab();
    if (!tab?.id || !/easy-serveur53\.com/i.test(tab.url || "")) {
      setStatus("Open an Easy tab, refresh it, then save again.");
      return;
    }
    try {
      const res = await easyCleanerSend(tab.id, "saveOptions", { text: ta?.value ?? "" });
      if (!res?.ok) {
        setStatus(res?.error || "Save failed.");
        return;
      }
      if (ta && res.text != null) ta.value = res.text;
      if (res.editMode != null) setEasyEditModeButton(!!res.editMode);
      setStatus("Saved. The active Easy tab has been updated if it’s still there.");
      setEasyOptionsOpen(false, { animate: true });
    } catch {
      setStatus("Couldn’t save. Open an Easy tab, reload it, and try again.");
    }
  });

  reset?.addEventListener("click", async () => {
    hideHint();
    if (
      !window.confirm(
        "Reset to default hidden fields? This will overwrite the current list on this Easy site."
      )
    ) {
      return;
    }
    setStatus("");
    const tab = await getActiveTab();
    if (!tab?.id || !/easy-serveur53\.com/i.test(tab.url || "")) {
      setStatus("Open an Easy tab, refresh it, then try reset again.");
      return;
    }
    try {
      const res = await easyCleanerSend(tab.id, "resetOptionsDefaults", { skipConfirm: true });
      if (res?.cancelled) return;
      if (!res?.ok) {
        setStatus(res?.error || "Reset failed.");
        return;
      }
      if (ta && res.text != null) ta.value = res.text;
      if (res.editMode != null) setEasyEditModeButton(!!res.editMode);
      setStatus("Reset to defaults on the active Easy tab.");
      setEasyOptionsOpen(false, { animate: true });
    } catch {
      setStatus("Couldn’t reset. Open an Easy tab, reload it, and try again.");
    }
  });

  const editShowHide = document.getElementById("easyOptsEditShowHide");
  editShowHide?.addEventListener("click", async () => {
    hideHint();
    setStatus("");
    try {
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error("No active tab.");
      if (!/easy-serveur53\.com/i.test(tab.url || "")) {
        setStatus("Open an Easy tab, reload the page, then use Start editing here.");
        return;
      }
      const res = await easyCleanerSend(tab.id, "toggleEdit");
      if (!res?.ok) {
        if (res?.error) setStatus(String(res.error));
        return;
      }
      if (res.editMode != null) setEasyEditModeButton(!!res.editMode);
      if (hint) {
        if (res.editMode == null) {
          hint.textContent =
            "Toggled the on-page +/− tools. Use the main button to apply or the Confirm bar on the page.";
        } else if (res.editMode) {
          hint.textContent =
            "Use +/− on the page, then Apply & exit here or tap Confirm in the page bar.";
        } else {
          hint.textContent =
            "On-page show/hide is off. Start editing again to change which fields are hidden.";
        }
        hint.hidden = false;
      }
    } catch {
      setStatus("Couldn’t reach the Easy page. Open an Easy tab, reload it, and try again.");
    }
  });
}

let agentOptionsInited = false;
function initAgentOptionsPanel() {
  if (agentOptionsInited) return;
  agentOptionsInited = true;

  const back = document.getElementById("agentOptsBack");
  const close = document.getElementById("agentOptsClose");
  const save = document.getElementById("agentOptsSave");
  const reset = document.getElementById("agentOptsReset");
  const range = document.getElementById("agentPillSizeRange");
  const out = document.getElementById("agentPillSizeValue");
  const hint = document.getElementById("agentOptsHint");

  const hideHint = () => {
    if (hint) {
      hint.textContent = "";
      hint.hidden = true;
    }
  };

  const goBack = () => {
    hideHint();
    setAgentOptionsOpen(false, { animate: true });
  };

  const syncOut = () => {
    if (out && range) out.textContent = range.value;
  };

  back?.addEventListener("click", goBack);
  close?.addEventListener("click", goBack);
  range?.addEventListener("input", syncOut);

  save?.addEventListener("click", async () => {
    hideHint();
    setStatus("");
    const v = range ? Math.min(96, Math.max(32, parseInt(range.value, 10) || AGENT_PILL_DEFAULT)) : AGENT_PILL_DEFAULT;
    try {
      await chrome.storage.sync.set({ [AGENT_PILL_SIZE_KEY]: v });
      if (out) out.textContent = String(v);
      if (range) range.value = String(v);
      setStatus(
        "Saved. Open a Nexvia buy or rent listing to see the new size, or refresh a listing tab that’s already open."
      );
      setAgentOptionsOpen(false, { animate: true });
    } catch {
      setStatus("Couldn’t save options.");
    }
  });

  reset?.addEventListener("click", async () => {
    hideHint();
    if (!window.confirm("Reset adviser pill size to the default (48px)?")) return;
    setStatus("");
    try {
      await chrome.storage.sync.set({ [AGENT_PILL_SIZE_KEY]: AGENT_PILL_DEFAULT });
      if (range) range.value = String(AGENT_PILL_DEFAULT);
      if (out) out.textContent = String(AGENT_PILL_DEFAULT);
      setStatus("Adviser pill size reset to 48px (default).");
      setAgentOptionsOpen(false, { animate: true });
    } catch {
      setStatus("Couldn’t reset options.");
    }
  });
}

/** Empty = Meta Adcheck does nothing on Facebook. */
function normalizeMetaAdSuppress(raw) {
  return String(raw ?? "").trim().slice(0, 280);
}

let metaAdcheckOptionsInited = false;

function initMetaAdcheckOptionsPanel() {
  if (metaAdcheckOptionsInited) return;
  metaAdcheckOptionsInited = true;

  const back = document.getElementById("metaAdOptsBack");
  const close = document.getElementById("metaAdOptsClose");
  const save = document.getElementById("metaAdOptsSave");
  const reset = document.getElementById("metaAdOptsReset");
  const suppressInp = document.getElementById("metaAdSuppressText");
  const highlightInp = document.getElementById("metaAdHighlightText");
  const hidePublishChk = document.getElementById("metaAdHidePublishChk");
  const hint = document.getElementById("metaAdOptsHint");

  const hideHint = () => {
    if (hint) {
      hint.textContent = "";
      hint.hidden = true;
    }
  };

  const goBack = () => {
    hideHint();
    setMetaAdcheckOptionsOpen(false, { animate: true });
    setStatus("");
  };

  back?.addEventListener("click", goBack);
  close?.addEventListener("click", goBack);

  hidePublishChk?.addEventListener("change", async () => {
    hideHint();
    setStatus("");
    try {
      await chrome.storage.sync.set({
        [CABW_HIDE_PUBLISH_KEY]: Boolean(hidePublishChk.checked)
      });
      setStatus("Saved.");
    } catch {
      setStatus("Couldn’t save.");
    }
  });

  save?.addEventListener("click", async () => {
    hideHint();
    setStatus("");
    const suppressText = normalizeMetaAdSuppress(suppressInp?.value ?? "");
    const highlightText = normalizeMetaAdSuppress(highlightInp?.value ?? "");
    const hidePublish = Boolean(hidePublishChk?.checked);
    if (suppressInp) suppressInp.value = suppressText;
    if (highlightInp) highlightInp.value = highlightText;
    try {
      await chrome.storage.sync.set({
        [CABW_SUPPRESS_KEY]: suppressText,
        [CABW_HIGHLIGHT_KEY]: highlightText,
        [CABW_HIDE_PUBLISH_KEY]: hidePublish
      });
      setStatus("Saved.");
      setMetaAdcheckOptionsOpen(false, { animate: true });
    } catch {
      setStatus("Couldn’t save options.");
    }
  });

  reset?.addEventListener("click", async () => {
    hideHint();
    if (
      !window.confirm("Reset Meta Adcheck to defaults?")
    ) {
      return;
    }
    setStatus("");
    try {
      await chrome.storage.sync.set({
        [CABW_SUPPRESS_KEY]: CABW_SUPPRESS_DEFAULT,
        [CABW_HIGHLIGHT_KEY]: CABW_HIGHLIGHT_DEFAULT,
        [CABW_HIDE_PUBLISH_KEY]: true
      });
      if (suppressInp) suppressInp.value = CABW_SUPPRESS_DEFAULT;
      if (highlightInp) highlightInp.value = CABW_HIGHLIGHT_DEFAULT;
      if (hidePublishChk) hidePublishChk.checked = true;
      setStatus("Reset.");
      setMetaAdcheckOptionsOpen(false, { animate: true });
    } catch {
      setStatus("Couldn’t reset options.");
    }
  });
}

async function openMetaAdcheckOptionsFromCog() {
  setStatus("");
  initMetaAdcheckOptionsPanel();
  const suppressInp = document.getElementById("metaAdSuppressText");
  const highlightInp = document.getElementById("metaAdHighlightText");
  const hidePublishChk = document.getElementById("metaAdHidePublishChk");
  const hint = document.getElementById("metaAdOptsHint");
  if (hint) {
    hint.textContent = "";
    hint.hidden = true;
  }
  try {
    const res = await chrome.storage.sync.get({
      [CABW_SUPPRESS_KEY]: CABW_SUPPRESS_DEFAULT,
      [CABW_HIGHLIGHT_KEY]: CABW_HIGHLIGHT_DEFAULT,
      [CABW_HIDE_PUBLISH_KEY]: true
    });
    const suppressText = normalizeMetaAdSuppress(res[CABW_SUPPRESS_KEY]);
    const highlightText = normalizeMetaAdSuppress(res[CABW_HIGHLIGHT_KEY]);
    if (suppressInp) suppressInp.value = suppressText;
    if (highlightInp) highlightInp.value = highlightText;
    if (hidePublishChk) hidePublishChk.checked = res[CABW_HIDE_PUBLISH_KEY] !== false;
    setMetaAdcheckOptionsOpen(true, { animate: true });
  } catch {
    setStatus("Couldn’t load options.");
  }
}

async function openAgentChipOptionsFromCog() {
  setStatus("");
  initAgentOptionsPanel();
  const range = document.getElementById("agentPillSizeRange");
  const out = document.getElementById("agentPillSizeValue");
  const hint = document.getElementById("agentOptsHint");
  if (hint) {
    hint.textContent = "";
    hint.hidden = true;
  }
  try {
    const res = await chrome.storage.sync.get({ [AGENT_PILL_SIZE_KEY]: AGENT_PILL_DEFAULT });
    const v = Math.min(96, Math.max(32, parseInt(String(res[AGENT_PILL_SIZE_KEY]), 10) || AGENT_PILL_DEFAULT));
    if (range) range.value = String(v);
    if (out) out.textContent = String(v);
    setAgentOptionsOpen(true, { animate: true });
  } catch {
    setStatus("Couldn’t load options.");
  }
}

let advancedFiltersOptionsInited = false;
function initAdvancedNexviaFiltersOptionsPanel() {
  if (advancedFiltersOptionsInited) return;
  advancedFiltersOptionsInited = true;
  const back = document.getElementById("advFiltersOptsBack");
  const close = document.getElementById("advFiltersOptsClose");
  const mapChk = document.getElementById("advFiltersMapViewChk");
  const goBack = () => {
    setAdvancedNexviaFiltersOptionsOpen(false, { animate: true });
    setStatus("");
  };
  back?.addEventListener("click", goBack);
  close?.addEventListener("click", goBack);
  const reloadNexviaBuyRentIfMatch = async () => {
    const tab = await getActiveTab();
    if (tab?.id && /https:\/\/www\.nexvia\.lu\/(?:[\w-]+\/)?(buy|rent)/i.test(tab.url || "")) {
      await chrome.tabs.reload(tab.id);
      setStatus("Refreshed the page so filter options take effect.");
    }
  };
  mapChk?.addEventListener("change", async () => {
    setStatus("");
    try {
      await chrome.storage.sync.set({ [NEXVIA_MAP_VIEW_OPTION_KEY]: mapChk.checked });
      await reloadNexviaBuyRentIfMatch();
    } catch {
      setStatus("Couldn’t save option.");
    }
  });
  const sortChk = document.getElementById("advFiltersEnableSortingChk");
  sortChk?.addEventListener("change", async () => {
    setStatus("");
    try {
      await chrome.storage.sync.set({ [ENABLE_NEXVIA_SORTING_KEY]: sortChk.checked });
      await reloadNexviaBuyRentIfMatch();
    } catch {
      setStatus("Couldn’t save option.");
    }
  });
  const clusterRange = document.getElementById("advFiltersMapClusterRange");
  const clusterOut = document.getElementById("advFiltersMapClusterValue");
  const syncClusterRangeOutput = () => {
    if (!clusterRange || !clusterOut) return;
    const v = Math.min(100, Math.max(0, parseInt(String(clusterRange.value), 10) || 0));
    clusterOut.textContent = String(v);
  };
  clusterRange?.addEventListener("input", syncClusterRangeOutput);
  clusterRange?.addEventListener("change", async () => {
    setStatus("");
    try {
      const v = Math.min(100, Math.max(0, parseInt(String(clusterRange?.value), 10) || 0));
      await chrome.storage.sync.set({ [MAP_CLUSTER_FLEX_KEY]: v });
      syncClusterRangeOutput();
      setStatus("Clustering saved. Open map view updates automatically.");
    } catch {
      setStatus("Couldn’t save clustering.");
    }
  });
}

async function openAdvancedNexviaFiltersOptionsFromCog() {
  setStatus("");
  initAdvancedNexviaFiltersOptionsPanel();
  const mapChk = document.getElementById("advFiltersMapViewChk");
  const sortChk = document.getElementById("advFiltersEnableSortingChk");
  const clusterRange = document.getElementById("advFiltersMapClusterRange");
  const clusterOut = document.getElementById("advFiltersMapClusterValue");
  try {
    const r = await chrome.storage.sync.get({
      [NEXVIA_MAP_VIEW_OPTION_KEY]: true,
      [ENABLE_NEXVIA_SORTING_KEY]: true,
      [MAP_CLUSTER_FLEX_KEY]: MAP_CLUSTER_FLEX_DEFAULT,
    });
    if (mapChk) mapChk.checked = r[NEXVIA_MAP_VIEW_OPTION_KEY] !== false;
    if (sortChk) sortChk.checked = r[ENABLE_NEXVIA_SORTING_KEY] !== false;
    if (clusterRange) {
      const cv = Math.min(100, Math.max(0, parseInt(String(r[MAP_CLUSTER_FLEX_KEY]), 10) || MAP_CLUSTER_FLEX_DEFAULT));
      clusterRange.value = String(cv);
    }
    if (clusterOut && clusterRange) clusterOut.textContent = clusterRange.value;
    setAdvancedNexviaFiltersOptionsOpen(true, { animate: true });
  } catch {
    setStatus("Couldn’t load options.");
  }
}

let listingOptionsInited = false;
function initListingCreatorOptionsPanel() {
  if (listingOptionsInited) return;
  listingOptionsInited = true;

  const back = document.getElementById("listingOptsBack");
  const close = document.getElementById("listingOptsClose");
  const apply = document.getElementById("listingOptsApply");
  const reset = document.getElementById("listingOptsReset");
  const ta = document.getElementById("listingOptsTextarea");
  const hint = document.getElementById("listingOptsHint");

  const hideHint = () => {
    if (hint) {
      hint.textContent = "";
      hint.hidden = true;
    }
  };

  const goBack = () => {
    hideHint();
    setListingCreatorOptionsOpen(false, { animate: true });
    setStatus("");
  };

  back?.addEventListener("click", goBack);
  close?.addEventListener("click", goBack);

  apply?.addEventListener("click", async () => {
    hideHint();
    setStatus("");
    const tab = await getActiveTab();
    if (!tab?.id || !/nexvia1832\.easy-serveur53\.com/.test(tab.url || "")) {
      setStatus("Open the nexvia1832 Easy tab, then try again.");
      return;
    }
    try {
      const res = await chrome.tabs.sendMessage(tab.id, {
        type: "nexpilot:easyListing",
        action: "apply",
        text: ta?.value ?? ""
      });
      if (!res?.ok) {
        setStatus(res?.error || "Load failed.");
        return;
      }
      setStatus("Applied. The on-page tool updates on that tab when the extension is active there.");
      setListingCreatorOptionsOpen(false, { animate: true });
    } catch {
      setStatus("Couldn’t reach the page. Reload the Easy tab and try again.");
    }
  });

  reset?.addEventListener("click", async () => {
    hideHint();
    if (!window.confirm("Clear all stored listing JSON for this site? (Same as a full reset in the old panel.)")) {
      return;
    }
    setStatus("");
    const tab = await getActiveTab();
    if (!tab?.id || !/nexvia1832\.easy-serveur53\.com/.test(tab.url || "")) {
      setStatus("Open the nexvia1832 Easy tab, then try again.");
      return;
    }
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "nexpilot:easyListing", action: "reset" });
      if (!res?.ok) {
        setStatus(res?.error || "Clear failed.");
        return;
      }
      if (ta) ta.value = "";
      setStatus("Cleared from page storage on the active tab.");
      setListingCreatorOptionsOpen(false, { animate: true });
    } catch {
      setStatus("Couldn’t reach the page. Reload the Easy tab and try again.");
    }
  });
}

async function openListingCreatorOptionsFromCog() {
  setStatus("");
  initListingCreatorOptionsPanel();
  const ta = document.getElementById("listingOptsTextarea");
  const hint = document.getElementById("listingOptsHint");
  if (hint) {
    hint.textContent = "";
    hint.hidden = true;
  }
  const tab = await getActiveTab();
  if (!tab?.id) {
    if (ta) ta.value = "";
    setListingCreatorOptionsOpen(true, { animate: true });
    return;
  }
  if (!/nexvia1832\.easy-serveur53\.com/.test(tab.url || "")) {
    if (ta) ta.value = "";
    setListingCreatorOptionsOpen(true, { animate: true });
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "nexpilot:easyListing", action: "getData" });
    if (!res?.ok) {
      if (ta) ta.value = "";
      if (hint) {
        hint.textContent = res?.error || "Couldn’t read data. Reload the tab and try again.";
        hint.hidden = false;
      }
      setListingCreatorOptionsOpen(true, { animate: true });
      return;
    }
    if (ta) ta.value = res.text != null ? String(res.text) : "";
    if (hint) {
      hint.textContent = "";
      hint.hidden = true;
    }
    setListingCreatorOptionsOpen(true, { animate: true });
  } catch {
    if (ta) ta.value = "";
    if (hint) {
      hint.textContent = "Couldn’t reach the page. Reload the Easy tab, then use the cog again to load from the page.";
      hint.hidden = false;
    }
    setListingCreatorOptionsOpen(true, { animate: true });
  }
}

let easyRefOptionsInited = false;
function initEasyRefInsertOptionsPanel() {
  if (easyRefOptionsInited) return;
  easyRefOptionsInited = true;
  const back = document.getElementById("easyRefOptsBack");
  const close = document.getElementById("easyRefOptsClose");
  const goBack = () => {
    setEasyRefInsertOptionsOpen(false, { animate: true });
    setStatus("");
  };
  back?.addEventListener("click", goBack);
  close?.addEventListener("click", goBack);
  document.querySelectorAll("input[data-easyref-key]").forEach((el) => {
    el.addEventListener("change", async () => {
      const k = el.getAttribute("data-easyref-key");
      if (!k) return;
      setStatus("");
      try {
        await chrome.storage.sync.set({ [k]: el.checked });
        const tab = await getActiveTab();
        if (tab?.id && /easy-serveur53\.com/i.test(tab.url || "")) {
          await chrome.tabs.reload(tab.id);
        }
      } catch {
        setStatus("Couldn’t save option.");
      }
    });
  });
}

async function openEasyRefInsertOptionsFromCog() {
  setStatus("");
  initEasyRefInsertOptionsPanel();
  try {
    const r = await chrome.storage.sync.get(EASY_REF_DEFAULTS);
    const u = document.getElementById("easyRefChkUrl");
    const d = document.getElementById("easyRefChkDash");
    if (u) u.checked = r[EASY_REF_KEY_URL] !== false;
    if (d) d.checked = r[EASY_REF_KEY_DASH] !== false;
    setEasyRefInsertOptionsOpen(true, { animate: true });
  } catch {
    setStatus("Couldn’t load options.");
  }
}

function setEasyCleanerOnPageControlsEnabled(on) {
  const editBtn = document.getElementById("easyOptsEditShowHide");
  if (editBtn) {
    editBtn.disabled = !on;
    editBtn.title = on
      ? ""
      : "Open an Easy site tab, reload, then you can use Start editing and the path list from here.";
  }
  const showPathsBtn = document.getElementById("easyOptsShowPaths");
  if (showPathsBtn) {
    showPathsBtn.disabled = !on;
  }
}

async function openEasyCleanerOptionsFromCog() {
  setStatus("");
  initEasyOptionsPanel();
  const ta = document.getElementById("easyOptsTextarea");
  const hint = document.getElementById("easyOptsHint");
  if (hint) {
    hint.textContent = "";
    hint.hidden = true;
  }

  const tab = await getActiveTab();
  const onEasy = Boolean(tab?.id && /easy-serveur53\.com/i.test(tab.url || ""));

  if (!onEasy) {
    if (ta) ta.value = "";
    setEasyPathsPanelOpen(false);
    setEasyEditModeButton(false);
    setEasyCleanerOnPageControlsEnabled(false);
    setEasyOptionsOpen(true, { animate: true });
    return;
  }

  try {
    const res = await easyCleanerSend(tab.id, "getOptions");
    if (!res?.ok) {
      if (ta) ta.value = "";
      setEasyPathsPanelOpen(false);
      setEasyEditModeButton(false);
      setEasyCleanerOnPageControlsEnabled(true);
      if (hint) {
        hint.textContent = res?.error || "Couldn’t load options. Reload the Easy tab and try again.";
        hint.hidden = false;
      }
      setEasyOptionsOpen(true, { animate: true });
      return;
    }
    if (ta) ta.value = res.text ?? "";
    setEasyPathsPanelOpen(false);
    setEasyEditModeButton(!!res.editMode);
    setEasyCleanerOnPageControlsEnabled(true);
    setEasyOptionsOpen(true, { animate: true });
  } catch {
    if (ta) ta.value = "";
    setEasyPathsPanelOpen(false);
    setEasyEditModeButton(false);
    setEasyCleanerOnPageControlsEnabled(onEasy);
    if (hint) {
      hint.textContent = "Couldn’t load options. Open an Easy tab, reload the page, and try again.";
      hint.hidden = false;
    }
    setEasyOptionsOpen(true, { animate: true });
  }
}

function renderToolRow(tool, enabled, pageUrl, masterOn) {
  const checkboxId = `sw-${tool.key.replace(/[^a-z0-9]/gi, "-")}`;

  const onPageOk = isToolRelevantOnPage(tool, pageUrl);

  const name = el("div", { class: "tool-name", text: tool.name });
  const desc = el("div", { class: "tool-desc", text: tool.desc });

  const input = el("input", { id: checkboxId, type: "checkbox" });
  input.checked = Boolean(masterOn && enabled);
  input.disabled = !masterOn;

  const pill = el("span", { class: "pill" });
  const label = el("label", { class: "switch", for: checkboxId }, [input, pill]);

  const editBtn = el("button", { class: "text-btn", type: "button", text: "Edit" });
  editBtn.hidden = !tool.hasEdit;
  editBtn.disabled = !tool.hasEdit || !enabled || !onPageOk || !masterOn;
  if (!masterOn) {
    editBtn.title = 'Turn on “Enable tools” in the Settings tab.';
  } else {
    editBtn.title = tool.hasEdit
      ? !enabled || !onPageOk
        ? "Enable this tool and open a matching page."
        : "On-page show/hide (Start editing on the page)"
      : "";
  }

  const optionsCogDisabled = tool.hasOptions && !masterOn;

  const actionEls = [editBtn];
  if (tool.hasOptions) {
    const cogBtn = el("button", { class: "icon-btn tool-options-cog", type: "button" });
    cogBtn.appendChild(cogIcon());
    const ariaOpts =
      tool.id === "easyCleaner"
        ? "Interface Cleaner: hidden paths, Save, and on-page show/hide (Start editing / Apply and exit)"
        : tool.id === "listingCreator"
          ? "Easy Listing Creator: load or clear JSON in page storage (bypass)"
          : tool.id === "advancedNexviaFilters"
            ? "Advanced Filters: map view and related options"
            : tool.id === "easyReferenceInsert"
              ? "Description Helper: per-rule text fixes (URL, dashes, …)"
              : tool.id === "continuousAdBudgetWarning"
                ? "Meta Adcheck"
                : "Options";
    cogBtn.setAttribute("aria-label", ariaOpts);
    cogBtn.disabled = optionsCogDisabled;
    if (!masterOn) {
      cogBtn.title = 'Turn on “Enable tools” in the Settings tab.';
    } else {
      cogBtn.title =
        tool.id === "easyCleaner"
          ? "Paths, save, and on-page +/−. You can open from any tab; load/save when an Easy site is active."
          : tool.id === "listingCreator"
            ? "Read or load listing JSON. Open a nexvia1832 Easy tab to load from the page, or prepare JSON here any time."
            : tool.id === "advancedNexviaFilters"
              ? "Map view on buy search and other filter options"
              : tool.id === "easyReferenceInsert"
                ? "Toggles for URL in description and dash fixes (works from any tab)"
                : tool.id === "continuousAdBudgetWarning"
                  ? "Meta Adcheck"
                  : "Adviser pill size (Nexvia listings); same options from any tab";
    }
    cogBtn.addEventListener("click", async () => {
      setStatus("");
      if (cogBtn.disabled) return;
      if (tool.id === "easyCleaner") {
        await openEasyCleanerOptionsFromCog();
      } else if (tool.id === "listingCreator") {
        await openListingCreatorOptionsFromCog();
      } else if (tool.id === "agentChip") {
        await openAgentChipOptionsFromCog();
      } else if (tool.id === "advancedNexviaFilters") {
        await openAdvancedNexviaFiltersOptionsFromCog();
      } else if (tool.id === "easyReferenceInsert") {
        await openEasyRefInsertOptionsFromCog();
      } else if (tool.id === "continuousAdBudgetWarning") {
        await openMetaAdcheckOptionsFromCog();
      }
    });
    actionEls.push(cogBtn);
  }

  const actions = el("div", { class: "tool-actions" }, actionEls);
  const textBlock = el("div", { class: "tool-text" }, [name, desc]);
  const lead = toolRowLeadIcon();
  const controls = el("div", { class: "tool-controls" }, [actions, label]);
  const top = el("div", { class: "tool-top" }, [lead, textBlock, controls]);

  input.addEventListener("change", async () => {
    if (!masterOn) {
      input.checked = Boolean(enabled);
      return;
    }
    const newEnabled = input.checked;
    await setToolStates({ [tool.key]: newEnabled });
    const activeTab = await getActiveTab();
    const pageUrl = activeTab?.url || "";
    // Content scripts load with the page; refresh the tab when it matches this tool’s sites.
    let reloadedForToolToggle = false;
    if (isPopupToggleTool(tool)) {
      try {
        if (activeTab?.id && isToolRelevantOnPage(tool, pageUrl)) {
          await chrome.tabs.reload(activeTab.id);
          reloadedForToolToggle = true;
        }
      } catch {
        // e.g. restricted URL, or reload not allowed
      }
    }
    const row = input.closest(".tool");
    if (row) {
      updateToolRowAfterToggle(row, tool, newEnabled, pageUrl, masterOn);
    }
    if (reloadedForToolToggle) {
      setStatus("Refreshed the page so this change takes effect.");
      queueSyncPopupHeightToMaxTab();
    }
  });

  return el("div", { class: "tool" }, [top]);
}

/**
 * @param {"assist"|"nexvia-enhance"|"web-enhance"|"settings"|"enhancements"} tab `enhancements` is legacy and maps to nexvia-enhance.
 * @param {{ persist?: boolean }} [opts] If `persist: false`, do not update stored "last tab" (e.g. opening on a fixed tab should not erase memory for "last tab" mode).
 */
function setTab(tab, opts = {}) {
  const persist = opts.persist !== false;
  tab = canonicalizeMainTab(tab);
  const isAssist = tab === "assist";
  const isNexviaEnhance = tab === "nexvia-enhance";
  const isWebEnhance = tab === "web-enhance";
  const isSettings = tab === "settings";
  const tabbar = document.getElementById("nexpilotTabbar");
  if (tabbar) {
    tabbar.setAttribute("data-active", tab);
  }
  document.getElementById("tabAssist")?.classList.toggle("is-active", isAssist);
  document.getElementById("tabNexviaEnhance")?.classList.toggle("is-active", isNexviaEnhance);
  document.getElementById("tabWebEnhance")?.classList.toggle("is-active", isWebEnhance);
  document.getElementById("tabSettings")?.classList.toggle("is-active", isSettings);
  document.getElementById("tabAssist")?.setAttribute("aria-selected", isAssist ? "true" : "false");
  document.getElementById("tabNexviaEnhance")?.setAttribute("aria-selected", isNexviaEnhance ? "true" : "false");
  document.getElementById("tabWebEnhance")?.setAttribute("aria-selected", isWebEnhance ? "true" : "false");
  document.getElementById("tabSettings")?.setAttribute("aria-selected", isSettings ? "true" : "false");

  const pa = document.getElementById("panelAssist");
  const pn = document.getElementById("panelNexviaEnhance");
  const pw = document.getElementById("panelWebEnhance");
  const ps = document.getElementById("panelSettings");
  if (pa) pa.hidden = !isAssist;
  if (pn) pn.hidden = !isNexviaEnhance;
  if (pw) pw.hidden = !isWebEnhance;
  if (ps) ps.hidden = !isSettings;
  const rootTitle = document.getElementById("rootTitle");
  const rootSubtitle = document.getElementById("rootSubtitle");
  if (rootTitle) {
    if (isAssist) rootTitle.textContent = "Assist";
    else if (isNexviaEnhance) rootTitle.textContent = "Nexvia.lu";
    else if (isWebEnhance) rootTitle.textContent = "Easy";
    else rootTitle.textContent = "Settings";
  }
  if (rootSubtitle) {
    if (isAssist) rootSubtitle.textContent = "Active workflows and actions";
    else if (isNexviaEnhance) {
      rootSubtitle.textContent = "Website improvements and features";
    } else if (isWebEnhance) {
      rootSubtitle.textContent = "Improved Easy website features";
    } else rootSubtitle.textContent = "Extension preferences and version";
  }

  if (persist) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.sync) {
        void chrome.storage.sync.set({ [NP_POPUP_LAST_TAB_KEY]: tab });
      }
    } catch {
      // ignore
    }
  }
}

function interpretUpdateStatus(status, newVersion) {
  const s = (status == null ? "" : String(status)).toLowerCase().replace(/ /g, "_");
  if (s === "update_available") {
    return {
      text: newVersion
        ? `Update available (${String(newVersion)}). Reload the extension to finish, or let Chrome update it in the background.`
        : "An update is available. Reload the extension to finish, or let Chrome update it in the background.",
      ok: true,
      showReload: true,
      warn: false,
      feedback: "updated"
    };
  }
  if (s === "no_update" || s === "noupdate") {
    return {
      text: "You’re on the latest version for this install (e.g. Chrome Web Store or managed).",
      ok: true,
      showReload: false,
      warn: false,
      feedback: "up_to_date"
    };
  }
  if (s === "throttled" || s === "update_throttled") {
    return {
      text: "Update check throttled. Try again later, or in chrome://extensions use “Check for update”.",
      ok: false,
      showReload: false,
      warn: true,
      feedback: "message"
    };
  }
  if (s === "dev_mode" || s === "not_allowed" || s === "notallowed") {
    return {
      text: "This copy is unpacked or in developer mode. The team will get real updates from a Web Store–based install. Locally, refresh via chrome://extensions → Reload for this extension.",
      ok: false,
      showReload: true,
      warn: true,
      feedback: "message"
    };
  }
  return {
    text: s
      ? `Update status: ${String(status)}. The team should install a published or managed build to use Check for updates.`
      : "Check for updates is only for extensions installed from the Chrome Web Store or a managed (policy) source.",
    ok: false,
    showReload: false,
    warn: true,
    feedback: "message"
  };
}

async function runRequestUpdateCheck() {
  if (typeof chrome === "undefined" || typeof chrome.runtime?.requestUpdateCheck !== "function") {
    return {
      text: "Update checks are not available in this environment.",
      ok: false,
      showReload: false,
      warn: true,
      feedback: "message"
    };
  }
  return new Promise((resolve) => {
    function dispatch(info) {
      if (info == null) {
        resolve(interpretUpdateStatus("unknown", null));
        return;
      }
      if (typeof info === "string") {
        resolve(interpretUpdateStatus(info, null));
        return;
      }
      if (Array.isArray(info) && info.length) {
        resolve(interpretUpdateStatus(String(info[0] ?? "unknown"), info[1] ?? null));
        return;
      }
      if (typeof info === "object" && "status" in info) {
        const ver = "updateVersion" in info || "version" in info ? (info.updateVersion ?? info.version) : null;
        resolve(interpretUpdateStatus(String((info).status), ver));
        return;
      }
      resolve(interpretUpdateStatus(String(info), null));
    }
    const maybe = chrome.runtime.requestUpdateCheck();
    if (maybe && typeof maybe.then === "function") {
      maybe
        .then((info) => dispatch(info))
        .catch((e) => {
          resolve({
            text: (e && e.message) || "Check failed. Try from chrome://extensions, or use a store-based install.",
            ok: false,
            showReload: false,
            warn: true,
            feedback: "message"
          });
        });
      return;
    }
    try {
      chrome.runtime.requestUpdateCheck((s) => {
        dispatch(s);
      });
    } catch (e) {
      resolve({
        text: (e && e.message) || "This build can’t use Check for updates. Use a Web Store or managed install so the team gets automatic updates from GitHub via a published build.",
        ok: false,
        showReload: false,
        warn: true,
        feedback: "message"
      });
    }
  });
}

function initSettingsPanelOnce() {
  if (settingsPanelWired) return;
  settingsPanelWired = true;
  const vNum = document.getElementById("npVersionText");
  if (vNum) {
    try {
      vNum.textContent = chrome.runtime.getManifest().version;
    } catch {
      vNum.textContent = "—";
    }
  }
  const m = document.getElementById("npMasterTools");
  if (m) {
    m.addEventListener("change", async () => {
      setStatus("");
      const on = m.checked;
      try {
        await chrome.storage.sync.set({ [NP_TOOLS_MASTER_KEY]: on });
      } catch {
        m.checked = !on;
        setStatus("Couldn’t save the master switch.");
        return;
      }
      setStatus(
        on
          ? "NexPilot tools are enabled again. Reloading the active tab…"
          : "All tools are off until you turn this back on. Reloading the active tab…"
      );
      try {
        const tab = await getActiveTab();
        if (tab?.id != null) await chrome.tabs.reload(tab.id);
      } catch {
        // restricted URL, etc.
      }
      await render();
    });
  }
  const checkBtn = document.getElementById("npCheckUpdates");
  const reloadBtn = document.getElementById("npReloadForUpdate");
  const umsg = document.getElementById("npUpdateMsg");
  if (checkBtn) {
    checkBtn.addEventListener("click", async () => {
      if (checkUpdateInFlight) return;
      checkUpdateInFlight = true;
      clearCheckUpdateUiTimers();

      if (umsg) {
        umsg.hidden = true;
        umsg.textContent = "";
        umsg.className = "settings-update-msg";
      }
      if (reloadBtn) reloadBtn.hidden = true;
      setStatus("");

      checkBtn.disabled = true;
      checkBtn.textContent = CHECK_UPDATES_BTN_DEFAULT;

      const result = await runRequestUpdateCheck();
      const fb = result.feedback || "message";

      if (fb === "up_to_date" || fb === "updated") {
        if (umsg) umsg.hidden = true;
        if (reloadBtn) reloadBtn.hidden = !result.showReload;
        checkBtn.textContent = fb === "up_to_date" ? "Up to date" : "Update found";
        checkBtn.setAttribute("aria-label", checkBtn.textContent);

        checkUpdateUiTimers.result = setTimeout(() => {
          checkUpdateUiTimers.result = null;
          checkBtn.textContent = CHECK_UPDATES_BTN_DEFAULT;
          checkBtn.setAttribute("aria-label", "Check for extension updates");

          checkUpdateUiTimers.cooldown = setTimeout(() => {
            checkUpdateUiTimers.cooldown = null;
            checkBtn.disabled = false;
            checkUpdateInFlight = false;
          }, UPDATE_CHECK_COOLDOWN_MS);
        }, UPDATE_CHECK_RESULT_MS);
        return;
      }

      if (umsg) {
        umsg.hidden = false;
        umsg.textContent = result.text;
        let cls = "settings-update-msg";
        if (result.ok) cls += " settings-update-msg--ok";
        else if (result.warn) cls += " settings-update-msg--warn";
        umsg.className = cls;
      }
      if (reloadBtn) reloadBtn.hidden = !result.showReload;
      checkBtn.textContent = CHECK_UPDATES_BTN_DEFAULT;
      checkBtn.setAttribute("aria-label", "Check for extension updates");

      checkUpdateUiTimers.cooldown = setTimeout(() => {
        checkUpdateUiTimers.cooldown = null;
        checkBtn.disabled = false;
        checkUpdateInFlight = false;
      }, UPDATE_CHECK_COOLDOWN_MS);
    });
  }
  if (reloadBtn) {
    reloadBtn.addEventListener("click", () => {
      try {
        chrome.runtime.reload();
      } catch {
        setStatus("Couldn’t reload the extension.");
      }
    });
  }
  const resetAll = document.getElementById("npResetAllTools");
  if (resetAll) {
    resetAll.addEventListener("click", async () => {
      if (
        !window.confirm(
          "Turn every tool on and re-enable the master switch? Per-tool options (paths, sizes, etc.) are not changed."
        )
      ) {
        return;
      }
      setStatus("");
      try {
        await chrome.storage.sync.set(buildDefaultToolSyncPayload());
        setStatus("All tools reset to default. Refreshing the active tab…");
        try {
          const tab = await getActiveTab();
          if (tab?.id != null) {
            await chrome.tabs.reload(tab.id);
          }
        } catch {
          // restricted URL, etc.
        }
        await render();
        setStatus("All tools are on again (defaults).");
      } catch {
        setStatus("Couldn’t reset tools. Try again.");
      }
    });
  }
  const openOn = document.getElementById("npPopupStartTab");
  if (openOn) {
    openOn.addEventListener("change", async () => {
      const v = canonicalizeMainTab(openOn.value);
      if (!isValidOpenPref(v)) return;
      setStatus("");
      try {
        await chrome.storage.sync.set({ [NP_POPUP_START_KEY]: v });
        setStatus("Takes effect the next time you open the popup.");
      } catch {
        setStatus("Couldn’t save start tab.");
        await render();
      }
    });
  }
}

async function render() {
  const tools = document.getElementById("tools");
  const nexviaEnhancementsTools = document.getElementById("nexviaEnhancementsTools");
  const webEnhancementsTools = document.getElementById("webEnhancementsTools");
  tools.innerHTML = "";
  if (nexviaEnhancementsTools) nexviaEnhancementsTools.innerHTML = "";
  if (webEnhancementsTools) webEnhancementsTools.innerHTML = "";

  const activeTab = await getActiveTab();
  const pageUrl = activeTab?.url || "";
  setStatus("");

  const states = await getToolStates();
  const masterOn = isMasterOn(states);
  initSettingsPanelOnce();
  const m = document.getElementById("npMasterTools");
  if (m) m.checked = masterOn;

  const startPrefs = await chrome.storage.sync.get({
    [NP_POPUP_START_KEY]: "last",
    [NP_POPUP_LAST_TAB_KEY]: "assist"
  });
  const startPref = startPrefs[NP_POPUP_START_KEY];
  let startNorm = isValidOpenPref(startPref) ? startPref : "last";
  if (startNorm !== "last") {
    startNorm = canonicalizeMainTab(startNorm);
  }
  const openOnEl = document.getElementById("npPopupStartTab");
  if (openOnEl) {
    openOnEl.value = startNorm;
    if (startNorm !== "last" && openOnEl.value !== startNorm) {
      openOnEl.value = "last";
    }
  }
  if (startPref === "enhancements") {
    try {
      await chrome.storage.sync.set({ [NP_POPUP_START_KEY]: "nexvia-enhance" });
    } catch {
      // ignore
    }
  }

  ASSIST.forEach((tool) => tools.appendChild(renderToolRow(tool, states[tool.key], pageUrl, masterOn)));
  NEXVIA_ENHANCEMENTS.forEach((tool) =>
    nexviaEnhancementsTools?.appendChild(renderToolRow(tool, states[tool.key], pageUrl, masterOn))
  );
  OTHER_ENHANCEMENTS.forEach((tool) =>
    webEnhancementsTools?.appendChild(renderToolRow(tool, states[tool.key], pageUrl, masterOn))
  );

  if (!popupInitialTabSet) {
    popupInitialTabSet = true;
    const last = startPrefs[NP_POPUP_LAST_TAB_KEY];
    if (startNorm === "last") {
      setTab(isValidLastTab(last) ? canonicalizeMainTab(last) : "assist", { persist: true });
    } else {
      setTab(startNorm, { persist: false });
    }
  }

  document.getElementById("tabAssist").onclick = () => {
    setTab("assist");
  };
  document.getElementById("tabNexviaEnhance").onclick = () => {
    setTab("nexvia-enhance");
  };
  document.getElementById("tabWebEnhance").onclick = () => {
    setTab("web-enhance");
  };
  const ts = document.getElementById("tabSettings");
  if (ts) {
    ts.onclick = () => {
      setTab("settings");
    };
  }

  queueSyncPopupHeightToMaxTab();
}

initEasyOptionsPanel();
void render();
