(async function () {
  "use strict";

  if (window.nnEasyUiCleanerV321) return;
  window.nnEasyUiCleanerV321 = true;

  const TOOL_KEY = "tool.easyUiCleanerV321";
  try {
    const enabled = self.__npToolEnabled
      ? await self.__npToolEnabled(TOOL_KEY, true)
      : (await chrome.storage.sync.get({ [TOOL_KEY]: true }))[TOOL_KEY];
    if (!enabled) return;
  } catch {
    // default enabled
  }

  const STORAGE_KEY = "hidden_form_elements";
  const DEFAULT_HIDDEN = new Set();

  let hiddenInputs = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"));
  const DEFAULT_LIST_URL = "https://nexvia-connect.github.io/easy-scripts/cleaner-default.txt";
  const STYLES_URL = "https://nexvia-connect.github.io/easy-scripts/styles/ui-cleaner-style.css";
  const MATERIAL_ICONS_URL = "https://fonts.googleapis.com/icon?family=Material+Icons+Outlined";

  async function initDefaults() {
    try {
      const res = await fetch(DEFAULT_LIST_URL, { cache: "no-store" });
      const txt = await res.text();
      txt
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((id) => DEFAULT_HIDDEN.add(id));
    } catch {
      // ignore: defaults still empty
    }

    if (!localStorage.getItem(STORAGE_KEY) && DEFAULT_HIDDEN.size > 0) {
      hiddenInputs = new Set(DEFAULT_HIDDEN);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(hiddenInputs)));
      applyHiddenStates();
    }
  }

  let editMode = false;
  let mutationLock = false;
  let editBar = null;

  /**
   * Full-width description: first `mat-card` in `.col-xxl-4` spans the row (port of Tampermonkey
   * “Easy full-width description” script).
   */
  function applyFullWidthDescription() {
    const cols = document.querySelectorAll(".col-xxl-4");
    if (!cols.length) return;

    cols.forEach((col) => {
      const card = col.querySelector("mat-card");
      if (card) {
        col.style.width = "100%";
        col.style.maxWidth = "100%";
        col.style.flex = "1 1 100%";
        col.style.padding = "0";

        card.style.width = "100%";
        card.style.maxWidth = "100%";
        card.style.flex = "1 1 100%";
        card.style.boxShadow = "none";
        card.style.background = "transparent";
        card.style.padding = "0px";
      }
    });
  }

  let fullWidthRaf = 0;
  function scheduleFullWidthDescription() {
    if (fullWidthRaf) return;
    fullWidthRaf = requestAnimationFrame(() => {
      fullWidthRaf = 0;
      applyFullWidthDescription();
    });
  }

  function getFullPath(el) {
    const path = [];
    let current = el;
    while (current && current !== document.body) {
      const tag = current.tagName;
      const siblings = Array.from(current.parentNode.children).filter((e) => e.tagName === tag);
      const index = siblings.indexOf(current);
      path.unshift(`${tag}:nth-of-type(${index + 1})`);
      current = current.parentNode;
    }
    return path.join(" > ");
  }

  function getElementIdentifier(el) {
    return getFullPath(el);
  }

  function getHideableElements() {
    const isNexPilotUi = (el) =>
      el?.closest?.("#nn-easy-cleaner-editbar,[data-nexpilot='easy-cleaner-editbar']");

    return Array.from(
      document.querySelectorAll(
        [
          ".form-group",
          ".row.mb-3",
          "fieldset",
          "legend",
          ".badges",
          ".fa-plus",
          ".fa-compass",
          ".fa-star",
          ".fa-heart",
          ".leftpanel-item",
          ".col > .form-group",
          ".col .form-group button",
          ".fiche-footing .btn-left button",
          ".fiche-footing .btn-right button",
          ".mat-tab-label",
          ".card.col-3"
        ].join(", ")
      )
    )
      .filter(Boolean)
      .filter((el) => !isNexPilotUi(el));
  }

  function applyHiddenStates() {
    if (mutationLock) return;
    mutationLock = true;
    requestAnimationFrame(() => {
      getHideableElements().forEach((el) => {
        const id = getElementIdentifier(el);
        if (!id) return;
        el.style.display = hiddenInputs.has(id) ? "none" : "";
        if (editMode) {
          el.style.display = "";
          el.classList.toggle("dimmed-input", hiddenInputs.has(id));
        } else {
          el.classList.remove("dimmed-input");
        }
      });
      mutationLock = false;
    });
  }

  function addEditButtons() {
    getHideableElements().forEach((el) => {
      const id = getElementIdentifier(el);
      if (!id) return;
      if (el.querySelector(".input-hide-button")) return;

      const btn = document.createElement("div");
      btn.className = "input-hide-button";
      btn.setAttribute("data-id", id);
      btn.textContent = hiddenInputs.has(id) ? "+" : "-";
      if (hiddenInputs.has(id)) btn.classList.add("restore");

      btn.style.position = "absolute";
      btn.style.zIndex = "10";
      if (el.tagName === "LEGEND") {
        btn.style.top = "0";
        btn.style.right = "4px";
      } else if (el.tagName === "FIELDSET") {
        btn.style.top = "0";
        btn.style.right = "28px";
      } else {
        btn.style.top = "4px";
        btn.style.right = "4px";
      }

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (hiddenInputs.has(id)) {
          hiddenInputs.delete(id);
          el.classList.remove("dimmed-input");
          btn.textContent = "-";
          btn.classList.remove("restore");
        } else {
          hiddenInputs.add(id);
          el.classList.add("dimmed-input");
          btn.textContent = "+";
          btn.classList.add("restore");
        }
      });

      btn.addEventListener("mouseenter", () => el.classList.add("hovered"));
      btn.addEventListener("mouseleave", () => el.classList.remove("hovered"));

      el.classList.add("edit-overlay");
      el.style.position = "relative";
      el.appendChild(btn);
    });
  }

  function removeEditButtons() {
    document.querySelectorAll(".input-hide-button").forEach((btn) => btn.remove());
    document.querySelectorAll(".edit-overlay").forEach((el) => {
      el.classList.remove("edit-overlay");
      el.classList.remove("hovered");
    });
  }

  function removeEditBar() {
    if (editBar) {
      editBar.remove();
      editBar = null;
    }
  }

  function ensureEditBar() {
    removeEditBar();
    const bar = document.createElement("div");
    bar.id = "nn-easy-cleaner-editbar";
    bar.setAttribute("data-nexpilot", "easy-cleaner-editbar");
    bar.style.position = "fixed";
    bar.style.right = "12px";
    bar.style.bottom = "12px";
    bar.style.zIndex = "2147483646";
    bar.style.display = "inline-flex";
    bar.style.gap = "8px";
    bar.style.alignItems = "center";
    bar.style.padding = "8px 10px";
    bar.style.borderRadius = "10px";
    bar.style.background = "rgba(0,0,0,0.75)";
    bar.style.color = "#fff";
    bar.style.font = "12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    bar.style.boxShadow = "0 6px 18px rgba(0,0,0,0.35)";

    const help = document.createElement("div");
    help.textContent = "Click +/− to hide or restore fields, then confirm.";
    help.style.maxWidth = "min(60vw, 360px)";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.textContent = "Confirm";
    confirmBtn.style.border = "1px solid #444";
    confirmBtn.style.background = "#0e6efd";
    confirmBtn.style.color = "#fff";
    confirmBtn.style.borderRadius = "8px";
    confirmBtn.style.padding = "6px 10px";
    confirmBtn.style.fontWeight = "700";
    confirmBtn.style.cursor = "pointer";
    confirmBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      confirmEditState();
    });

    bar.appendChild(help);
    bar.appendChild(confirmBtn);
    document.body.appendChild(bar);
    editBar = bar;
  }

  function confirmEditState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(hiddenInputs)));
    editMode = false;
    removeEditButtons();
    removeEditBar();
    applyHiddenStates();
  }

  function applyHiddenListFromText(text) {
    hiddenInputs = new Set(
      String(text)
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean)
    );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(hiddenInputs)));
    applyHiddenStates();
    if (editMode) {
      removeEditButtons();
      addEditButtons();
    }
  }

  function getOptionsText() {
    return Array.from(hiddenInputs).join("\n");
  }

  function toggleEditMode() {
    if (editMode) {
      confirmEditState();
      return;
    }
    editMode = true;
    addEditButtons();
    ensureEditBar();
    applyHiddenStates();
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== "nexpilot:easyUiCleaner") {
      return;
    }
    try {
      if (message.action === "toggleEdit") {
        toggleEditMode();
        sendResponse({ ok: true, editMode });
        return;
      }
      if (message.action === "getOptions") {
        sendResponse({ ok: true, text: getOptionsText(), editMode });
        return;
      }
      if (message.action === "saveOptions") {
        applyHiddenListFromText(message.text == null ? "" : message.text);
        sendResponse({ ok: true, text: getOptionsText(), editMode });
        return;
      }
      if (message.action === "resetOptionsDefaults") {
        if (!message.skipConfirm && !window.confirm("Reset to default hidden fields? This will overwrite current settings.")) {
          sendResponse({ ok: false, cancelled: true });
          return;
        }
        hiddenInputs = new Set(DEFAULT_HIDDEN);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(hiddenInputs)));
        applyHiddenStates();
        if (editMode) {
          removeEditButtons();
          addEditButtons();
        }
        sendResponse({ ok: true, text: getOptionsText(), editMode });
        return;
      }
      sendResponse({ ok: false, error: "Unknown action" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  });

  new MutationObserver(() => {
    scheduleFullWidthDescription();
    if (editMode) {
      addEditButtons();
      applyHiddenStates();
    } else {
      applyHiddenStates();
    }
  }).observe(document.body, { childList: true, subtree: true });

  async function injectRemoteAssets() {
    if (!document.getElementById("nn-material-icons-outlined")) {
      const iconLink = document.createElement("link");
      iconLink.id = "nn-material-icons-outlined";
      iconLink.rel = "stylesheet";
      iconLink.href = MATERIAL_ICONS_URL;
      document.head.appendChild(iconLink);
    }

    if (!document.getElementById("nn-easy-ui-cleaner-css")) {
      const style = document.createElement("style");
      style.id = "nn-easy-ui-cleaner-css";
      try {
        const res = await fetch(STYLES_URL, { cache: "no-store" });
        if (res.ok) style.textContent = await res.text();
      } catch {
        // ignore
      }
      document.head.appendChild(style);
    }
  }

  await injectRemoteAssets();
  await initDefaults();

  applyFullWidthDescription();
  applyHiddenStates();
})();
