/* global chrome */
/**
 * Easy Listing Creator Helper — decodes #/...?data= (Base64 JSON, UTF-8) from the
 * hash, persists to localStorage, and shows one NexPilot “Listing creation”
 * card. Assist tool for https://nexvia1832.easy-serveur53.com/
 */
(function () {
  "use strict";

  if (window.nnEasyListingCreatorHelper) return;
  window.nnEasyListingCreatorHelper = true;

  const TOOL_KEY = "tool.easyListingCreatorHelper";
  const STORAGE_KEY = "easy_listing_data";
  const LAST_USED_KEY = "easy_listing_last_used";

  let jsonData = {};
  /** The single NexPilot nn-card; header ✕ minimizes to the bottom pill. */
  let listingCard = null;
  /** Scrolling content root inside `NexPilotUI.getBody(listingCard)`. */
  let sectionBox = null;
  const LISTING_CREATOR_ID = "elch-listing-creator";
  let isProcessingDropdowns = false;
  const filledFields = new Set();
  const filledDropdowns = new Set();

  let listingRefPollingInterval = null;
  let isPollingForListingRef = false;
  let fillFormFieldsTimeout = null;
  let lastFillAttempt = 0;

  /**
   * @param {string} b64
   * @returns {string}
   */
  function base64ToUtf8(b64) {
    let s = String(b64).trim();
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = s.length % 4;
    if (pad) s += "====".slice(0, 4 - pad);
    const binary = atob(s);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  }

  (async function boot() {
    try {
      const ok = self.__npToolEnabled
        ? await self.__npToolEnabled(TOOL_KEY, true)
        : (await chrome.storage.sync.get({ [TOOL_KEY]: true }))[TOOL_KEY] !== false;
      if (!ok) return;
    } catch {
      // default on
    }

    injectFontAssets();
    run();
  })();

  function injectFontAssets() {
    if (document.getElementById("elch-icon-font")) return;
    const link = document.createElement("link");
    link.id = "elch-icon-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/icon?family=Material+Icons";
    document.head.appendChild(link);
  }

  function ensureToastCss() {
    if (document.getElementById("elch-toast-css")) return;
    const s = document.createElement("style");
    s.id = "elch-toast-css";
    s.textContent = `
    .elch-toast{position:absolute;top:-24px;left:50%;transform:translateX(-50%);
    font-size:11px;padding:4px 6px;border-radius:6px;background:#111;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.25);
    opacity:0;pointer-events:none;transition:opacity 120ms,transform 120ms;white-space:nowrap;z-index:9;}
    .elch-toast.show{opacity:1;transform:translateX(-50%) translateY(-2px);}
    .elch-toast.elch-toast--overlay{position:fixed;z-index:2147483640;}`.replace(/\s+/g, " ");
    document.head.appendChild(s);
  }

  function showCopyToast(anchorEl, text, duration) {
    ensureToastCss();
    const host = anchorEl.closest(".elch-entry > div:last-child");
    /* Icon-only cells: place label under the copy icon. */
    const below = host && host.offsetHeight < 40;
    const r = anchorEl.getBoundingClientRect();
    const root = anchorEl.getRootNode();
    const overlay =
      root instanceof ShadowRoot ? root.getElementById("nn-overlay") : null;
    const port = overlay || document.body;
    let toast = port.querySelector(".elch-toast--overlay");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "elch-toast elch-toast--overlay";
      port.appendChild(toast);
    }
    if (below) {
      toast.style.setProperty("top", `${Math.round(r.bottom + 4)}px`);
      toast.style.setProperty("left", `${Math.round(r.left + r.width / 2)}px`);
      toast.style.setProperty("transform", "translateX(-50%)");
    } else {
      toast.style.setProperty("top", `${Math.round(r.top - 4)}px`);
      toast.style.setProperty("left", `${Math.round(r.left + r.width / 2)}px`);
      toast.style.setProperty("transform", "translate(-50%, -100%)");
    }
    toast.style.setProperty("position", "fixed");
    if (overlay) {
      toast.style.setProperty("z-index", "calc(var(--nn-z, 2147483000) + 50)");
    } else {
      toast.style.setProperty("z-index", "2147483646");
    }
    toast.textContent = text;
    // eslint-disable-next-line no-unused-expressions
    toast.offsetHeight;
    toast.classList.add("show");
    clearTimeout(toast.__t);
    toast.__t = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => {
        if (toast && toast.parentNode) toast.remove();
      }, 160);
    }, duration || 1500);
  }

  function run() {
    const importedFromUrl = loadFromHashOrStorage();
    window.addEventListener("hashchange", () => {
      if (consumeHashData()) {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          jsonData = raw ? JSON.parse(raw) : {};
        } catch {
          jsonData = {};
        }
        triggerPostImportPageRefresh();
      }
    });

    if (importedFromUrl) {
      triggerPostImportPageRefresh();
      return;
    }

    void buildListingPanel();
  }

  function consumeHashData() {
    if (!location.hash.includes("data=")) return false;
    const q = location.hash.indexOf("?");
    if (q < 0) return false;
    let params;
    try {
      params = new URLSearchParams(location.hash.slice(q + 1));
    } catch {
      return false;
    }
    const encoded = params.get("data");
    if (!encoded) return false;
    function decodePayload(raw) {
      return base64ToUtf8(raw);
    }
    let decodedStr;
    try {
      decodedStr = decodePayload(decodeURIComponent(encoded));
    } catch {
      try {
        decodedStr = decodePayload(encoded);
      } catch {
        // eslint-disable-next-line no-alert
        alert("Failed to load shared listing data from URL.");
        return false;
      }
    }
    try {
      const parsed = JSON.parse(decodedStr);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      localStorage.setItem(LAST_USED_KEY, String(Date.now()));
      // Full page reload to a clean #/ (see triggerPostImportPageRefresh) so Easy doesn’t stay in a bad route
      return true;
    } catch {
      // eslint-disable-next-line no-alert
      alert("Failed to load shared listing data from URL.");
      return false;
    }
  }

  /**
   * @returns {boolean} true if listing JSON was just imported from a `data=` hash param
   */
  function loadFromHashOrStorage() {
    const fromUrl = consumeHashData();
    const saved = localStorage.getItem(STORAGE_KEY);
    const lastUsed = parseInt(localStorage.getItem(LAST_USED_KEY) || "0", 10);
    const now = Date.now();
    jsonData = {};
    if (fromUrl && saved) {
      try {
        jsonData = JSON.parse(saved);
      } catch {
        // ignore; leave {}
      }
      return true;
    }
    if (saved && (!lastUsed || now - lastUsed <= 3600000)) {
      try {
        jsonData = JSON.parse(saved);
        localStorage.setItem(LAST_USED_KEY, String(now));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LAST_USED_KEY);
        jsonData = {};
      }
    }
    return false;
  }

  function triggerPostImportPageRefresh() {
    const clean = `${location.origin}${location.pathname}#/`;
    try {
      history.replaceState(null, "", clean);
    } catch {
      // ignore
    }
    try {
      location.reload();
    } catch {
      // if reload is blocked, fall back to a hard navigation
      try {
        location.replace(clean);
      } catch {
        // last resort: leave it to the user
      }
    }
  }

  async function waitForNexPilotUI(maxWaitMs = 12000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxWaitMs) {
      const u = window.NexPilotUI;
      if (u && typeof u.createCard === "function" && typeof u.getBody === "function" && u.revealCard) return u;
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 40));
    }
    return null;
  }

  function injectHelperCssInShadowRoot(shadowRoot) {
    if (!shadowRoot || !chrome?.runtime?.getURL) return;
    if (shadowRoot.getElementById("elch-helper-css")) return;
    // Material Icons is linked in `document` for legacy paths, but stylesheets there
    // do not apply inside the overlay shadow — a copy here restores ligature icons.
    const mat = document.createElement("link");
    mat.id = "elch-material-icons";
    mat.rel = "stylesheet";
    mat.href = "https://fonts.googleapis.com/icon?family=Material+Icons";
    const link = document.createElement("link");
    link.id = "elch-helper-css";
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("src/assist/easy-listing-creator-helper.css");
    shadowRoot.appendChild(mat);
    shadowRoot.appendChild(link);
  }

  function recalculateHeight() {
    /* .elch-lc-scroller max-height; no legacy floater to resize */
  }

  /**
   * Single `NexPilotUI` card (header ✕ → NexPilot pill; no separate + circle or success popup).
   */
  async function buildListingPanel() {
    if (!document.body) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => {
          void buildListingPanel();
        });
      }
      return;
    }
    const API = await waitForNexPilotUI();
    if (!API) {
      // eslint-disable-next-line no-console
      console.warn("[NexPilot] UI shell missing; expect overlay.js before this script.");
      return;
    }
    listingCard = await API.createCard({
      id: LISTING_CREATOR_ID,
      title: "Listing creation",
      width: 450,
      anchor: "top-left"
    });
    const body = API.getBody(listingCard);
    body.classList.add("nn-body--tight");
    if (body.firstChild) {
      void API.revealCard(LISTING_CREATOR_ID);
      if (!sectionBox) {
        const found = body.querySelector(".elch-lc-scroller, .elch-sections");
        if (found) sectionBox = found;
      }
      if (sectionBox) showSections();
      return;
    }
    const shadow = listingCard.getRootNode();
    if (shadow instanceof ShadowRoot) injectHelperCssInShadowRoot(shadow);
    sectionBox = document.createElement("div");
    sectionBox.className = "elch-sections elch-lc-scroller";
    body.appendChild(sectionBox);
    await API.revealCard(LISTING_CREATOR_ID);
    showSections();
  }

  function copyToClipboard(val) {
    return navigator.clipboard.writeText(val);
  }

  function extractMarkdownLink(str) {
    const m = String(str).match(/^\[([^\]]+)]\(([^)]+)\)\s*$/);
    if (m) return { label: m[1], url: m[2] };
    const loose = String(str).match(/\[([^\]]+)]\(([^)]+)\)/);
    return loose ? { label: loose[1], url: loose[2] } : null;
  }

  function showIconFeedback(el) {
    const prev = el.style.color;
    el.style.color = "white";
    setTimeout(() => {
      el.style.color = prev || "#2196F3";
    }, 1500);
  }

  function determineType(key, val) {
    if (val === "true" || val === "false" || val === true || val === false) return "boolean";
    const s = String(val).trim();
    const keyStr = String(key);
    if (key === "Download file" || key === "Download description") return "fetchText";
    // Same as “Download description”: URL points to a text file; copy fetches then pastes the body.
    if (keyStr.toLowerCase() === "description" && /^https?:\/\//i.test(s)) return "fetchText";
    if (extractMarkdownLink(String(val))) return "markdown";
    if (
      typeof key === "string" &&
      ["photos", "floorplans", "Visit 'listing errors'", "Visit 'hidden listings'"].includes(key) &&
      String(val).startsWith("http")
    ) {
      return "externalOpen";
    }
    if (String(val).startsWith("http") && /\.(zip|pdf|docx?|xlsx?|jpg|png|jpeg|gif)/i.test(String(val))) {
      return "downloadLink";
    }
    if (String(val).startsWith("http")) return "copyText";
    return "text";
  }

  function renderRow(key, val) {
    const sVal = String(val);
    const type = determineType(key, val);
    const row = document.createElement("div");
    row.className = "elch-entry";

    let html = `<div>${escapeHtml(key)}</div><div>`;
    if (type === "fetchText") {
      const urlEsc = escapeAttr(sVal);
      html += `<span class="copy fetch-txt material-icons" data-url="${urlEsc}">content_copy</span>`;
    } else if (type === "copyText" || type === "text") {
      const fs = sVal.length > 40 ? "10px" : sVal.length > 20 ? "11px" : "12px";
      html += `<span class="elch-value" style="font-size:${fs}">${escapeHtml(sVal)}</span> <span class="copy material-icons" aria-hidden="true">content_copy</span>`;
    } else if (type === "markdown") {
      const md = extractMarkdownLink(sVal);
      if (md) {
        row.innerHTML = `<div>${escapeHtml(md.label)}</div><div><a href="${escapeAttr(
          md.url
        )}" target="_blank" rel="noopener"><button class="elch-download" type="button">Open</button></a></div>`;
        return row;
      }
      {
        const fs = sVal.length > 40 ? "10px" : sVal.length > 20 ? "11px" : "12px";
        html += `<span class="elch-value" style="font-size:${fs}">${escapeHtml(sVal)}</span> <span class="copy material-icons" aria-hidden="true">content_copy</span>`;
      }
    } else if (type === "externalOpen" || type === "downloadLink") {
      const urlEsc = escapeAttr(sVal);
      html = `<div>${escapeHtml(key)}</div><div><a href="${urlEsc}" target="_blank" rel="noopener"><button class="elch-download" type="button">Open</button></a>`;
    } else if (type === "boolean") {
      html += `<span>${escapeHtml(sVal)}</span>`;
    }
    html += "</div>";
    row.innerHTML = html;
    mountRowHandlers(row, sVal, type);
    return row;
  }

  function mountRowHandlers(row, val, type) {
    const copyBtn = row.querySelector(".copy:not(.fetch-txt)");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        copyToClipboard(val).then(
          () => {
            showIconFeedback(copyBtn);
            showCopyToast(copyBtn, "Copied!", 1500);
          },
          () => showCopyToast(copyBtn, "Copy failed", 2000)
        );
      });
    }
    const fetchBtn = row.querySelector(".fetch-txt");
    if (fetchBtn) {
      const url = fetchBtn.getAttribute("data-url");
      fetchBtn.addEventListener("click", () => {
        (async () => {
          let t;
          if (url) {
            try {
              const r = await fetch(url);
              if (r.ok) t = await r.text();
            } catch {
              /* CORS or network — try extension background (has host access) */
            }
            if (t == null && typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
              try {
                const res = await chrome.runtime.sendMessage({ type: "nexpilot:fetchUrlText", url });
                if (res && res.ok && res.text != null) t = res.text;
              } catch {
                // ignore
              }
            }
          }
          if (t == null) {
            // eslint-disable-next-line no-alert
            alert("Failed to fetch or copy text from URL.");
            return;
          }
          try {
            await copyToClipboard(t);
            showIconFeedback(fetchBtn);
            showCopyToast(fetchBtn, "Copied!", 1500);
          } catch {
            showCopyToast(fetchBtn, "Copy failed", 2000);
          }
        })();
      });
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function parseAddress(address) {
    if (!address) return null;
    const re = /^(\d+[A-Za-z]*)\s+(.+?)\s+(L-\d{4})\s+(.+)$/;
    const m = String(address).match(re);
    if (m) {
      return { propertyNumber: m[1], streetName: m[2], postCode: m[3], city: m[4] };
    }
    return null;
  }

  function fillAngularField(field, value, fieldName) {
    if (filledFields.has(fieldName)) {
      if (field.value === value || field.value === value.toString()) {
        return false;
      }
      filledFields.delete(fieldName);
    }
    field.value = value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    if (field._ngModel) {
      try {
        field._ngModel.setValue(value);
      } catch {
        // ignore
      }
    }
    const angularElement = field.closest("[ng-version]") || field.closest("[ng-model]") || field;
    if (angularElement && angularElement.ngModel) {
      try {
        angularElement.ngModel.$setViewValue(value);
      } catch {
        // ignore
      }
    }
    field.focus();
    field.blur();
    setTimeout(() => {
      if (field.value === value || field.value === value.toString()) {
        filledFields.add(fieldName);
      }
    }, 100);
    return true;
  }

  async function processDropdownsSequentially() {
    if (isProcessingDropdowns) return;
    isProcessingDropdowns = true;
    try {
      const overlays = document.querySelectorAll(".cdk-overlay-pane");
      overlays.forEach((overlay) => {
        const tptId = overlay.querySelector("mat-select[formcontrolname=\"tpt_id\"]");
        const roles = overlay.querySelector("mat-select[formcontrolname=\"roles_id_commercial\"]");
        if (tptId && jsonData["2. Informations Générales"] && jsonData["2. Informations Générales"].Etat === "En vente") {
          selectDropdownOptionSequentially(tptId, "En vente", "tpt_id");
        }
        if (roles && jsonData["2. Informations Générales"] && jsonData["2. Informations Générales"].Commercial) {
          const name = jsonData["2. Informations Générales"].Commercial;
          setTimeout(() => {
            selectDropdownOptionSequentially(roles, name, "roles_id_commercial");
          }, 1000);
        }
      });
    } finally {
      setTimeout(() => {
        isProcessingDropdowns = false;
      }, 3000);
    }
  }

  function selectDropdownOptionSequentially(dropdownField, targetText, dropdownName) {
    if (!dropdownField) return false;
    const normalizedTargetText = String(targetText).toLowerCase().trim();
    try {
      const angularComponent = dropdownField.closest("[ng-version]") || dropdownField;
      if (angularComponent._ngModel) {
        angularComponent._ngModel.setValue(targetText);
        filledDropdowns.add(dropdownName);
        return true;
      }
      if (angularComponent.ngModel) {
        angularComponent.ngModel.$setViewValue(targetText);
        filledDropdowns.add(dropdownName);
        return true;
      }
    } catch {
      // continue
    }
    try {
      dropdownField.click();
      setTimeout(() => {
        document.querySelectorAll(".cdk-overlay-pane").forEach((overlay) => {
          const options = overlay.querySelectorAll("mat-option");
          if (options.length === 0) return;
          let found = false;
          options.forEach((opt) => {
            const t = opt.querySelector(".mat-option-text")?.textContent?.trim();
            if (t && t.toLowerCase() === normalizedTargetText) {
              opt.click();
              opt.dispatchEvent(new Event("click", { bubbles: true }));
              found = true;
              filledDropdowns.add(dropdownName);
            }
          });
          if (!found && normalizedTargetText !== "- sélectionnez -") {
            options.forEach((opt) => {
              const t = opt.querySelector(".mat-option-text")?.textContent?.trim()?.toLowerCase();
              if (t === "- sélectionnez -") {
                opt.click();
                filledDropdowns.add(dropdownName);
              }
            });
          }
        });
      }, 300);
    } catch {
      // ignore
    }
    return true;
  }

  function fillAllFormFields() {
    if (!jsonData) return;
    const overlays = document.querySelectorAll(".cdk-overlay-pane");
    overlays.forEach((overlay) => {
      const street = overlay.querySelector("input[formcontrolname=\"street_number\"]");
      const route = overlay.querySelector("input[formcontrolname=\"route\"]");
      const post = overlay.querySelector("input[formcontrolname=\"postal_code\"]");
      const locality = overlay.querySelector("input[formcontrolname=\"locality\"]");
      const surface = overlay.querySelector("input[formcontrolname=\"surface\"]");
      const etage = overlay.querySelector("input[formcontrolname=\"etage\"]");
      const budget = overlay.querySelector("input[formcontrolname=\"budget\"]");
      const nbC = overlay.querySelector("input[formcontrolname=\"nb_chambres\"]");
      const nbS = overlay.querySelector("input[formcontrolname=\"nb_sdb\"]");
      const nbE = overlay.querySelector("input[formcontrolname=\"nb_etages\"]");

      if (jsonData["3. Coordonnées"] && jsonData["3. Coordonnées"].Adresse) {
        const parts = parseAddress(jsonData["3. Coordonnées"].Adresse);
        if (parts) {
          if (street) fillAngularField(street, parts.propertyNumber, "street_number");
          if (route) fillAngularField(route, parts.streetName, "route");
          if (post) fillAngularField(post, parts.postCode, "postal_code");
          if (locality) fillAngularField(locality, parts.city, "locality");
        }
      }
      const g = jsonData["2. Informations Générales"];
      if (g) {
        if (surface && g["Surface au sol"])
          fillAngularField(surface, String(g["Surface au sol"]).replace(" sqm", ""), "surface");
        if (etage && g.Etage) fillAngularField(etage, g.Etage, "etage");
        if (budget && g["Prix de Vente"]) fillAngularField(budget, g["Prix de Vente"], "budget");
        if (nbC && g.Chambres) fillAngularField(nbC, g.Chambres, "nb_chambres");
        if (nbS && g["Salles de bain"]) fillAngularField(nbS, g["Salles de bain"], "nb_sdb");
        if (nbE && g["Nb étages"]) fillAngularField(nbE, g["Nb étages"], "nb_etages");
      }
    });
    setTimeout(() => {
      processDropdownsSequentially();
    }, 500);
  }

  function fillFormFields() {
    if (fillFormFieldsTimeout) clearTimeout(fillFormFieldsTimeout);
    const now = Date.now();
    if (now - lastFillAttempt < 1500) return;
    fillFormFieldsTimeout = setTimeout(() => {
      fillAllFormFields();
      lastFillAttempt = Date.now();
    }, 300);
  }

  new MutationObserver(() => {
    if (!document.querySelector(".cdk-overlay-pane")) return;
    setTimeout(() => {
      fillFormFields();
      if (window.updateListingReference) window.updateListingReference();
    }, 200);
  }).observe(document.body, { childList: true, subtree: true });

  setInterval(() => {
    if (document.querySelector(".cdk-overlay-pane")) fillFormFields();
    if (window.updateListingReference) window.updateListingReference();
  }, 3000);

  function startListingRefPolling(fn) {
    if (isPollingForListingRef) return;
    isPollingForListingRef = true;
    listingRefPollingInterval = setInterval(() => {
      if (!listingCard || listingCard.classList.contains("nn-hidden")) {
        stopListingRefPolling();
        return;
      }
      fn();
    }, 3000);
  }
  function stopListingRefPolling() {
    if (listingRefPollingInterval) {
      clearInterval(listingRefPollingInterval);
      listingRefPollingInterval = null;
    }
    isPollingForListingRef = false;
  }

  function getPipedriveUrlFromData() {
    for (const section of Object.keys(jsonData)) {
      if (jsonData[section] && typeof jsonData[section] === "object") {
        const u = jsonData[section]["URL du deal Pipedrive"];
        if (u) {
          const m = extractMarkdownLink(String(u));
          return m ? m.url : String(u);
        }
      }
    }
    return null;
  }

  // --- render ---
  function showSections() {
    if (!sectionBox) return;
    sectionBox.innerHTML = "";

    const titleDiv = document.createElement("div");
    titleDiv.className = "elch-title";

    const titleLine = document.createElement("div");
    titleLine.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%";

    const leftBox = document.createElement("div");
    leftBox.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0;flex:1";
    const titleText = document.createElement("span");
    titleText.textContent = jsonData.title || "Easy creator";
    const pipeUrl = getPipedriveUrlFromData();
    if (pipeUrl) {
      const a = document.createElement("a");
      a.href = pipeUrl;
      a.target = "_blank";
      a.rel = "noopener";
      a.innerHTML =
        '<img src="https://nexvia-connect.github.io/easy-scripts/media/pipedrive-favicon.png" class="elch-pipedrive-icon" alt="" width="20" height="20"/>';
      leftBox.appendChild(a);
    }
    leftBox.appendChild(titleText);

    titleLine.appendChild(leftBox);
    titleDiv.appendChild(titleLine);
    sectionBox.appendChild(titleDiv);

    if (jsonData && Object.keys(jsonData).length > 0) {
      for (const section of Object.keys(jsonData)) {
        if (section === "title") continue;
        if (typeof jsonData[section] !== "object" || jsonData[section] === null) continue;
        const det = document.createElement("details");
        det.className = "elch-section";
        const sm = document.createElement("summary");
        sm.textContent = section;
        det.appendChild(sm);
        const sectionPanel = document.createElement("div");
        sectionPanel.className = "elch-section-panel";
        const sectionPanelInner = document.createElement("div");
        sectionPanelInner.className = "elch-section-panel-inner";
        for (const k of Object.keys(jsonData[section])) {
          const row = renderRow(k, jsonData[section][k]);
          sectionPanelInner.appendChild(row);
        }
        sectionPanel.appendChild(sectionPanelInner);
        det.appendChild(sectionPanel);
        sm.addEventListener("click", () => {
          setTimeout(() => {
            sectionBox?.querySelectorAll(".elch-section").forEach((o) => {
              if (o !== det) o.removeAttribute("open");
            });
          }, 0);
          if (window.updateListingReference) window.updateListingReference();
          recalculateHeight();
        });
        sectionBox.appendChild(det);
      }
    }

    const viewListing = document.createElement("details");
    viewListing.className = "elch-section";
    const vsum = document.createElement("summary");
    vsum.textContent = "View listing";
    viewListing.appendChild(vsum);
    const viewListingPanel = document.createElement("div");
    viewListingPanel.className = "elch-section-panel";
    const viewListingPanelInner = document.createElement("div");
    viewListingPanelInner.className = "elch-section-panel-inner";
    viewListingPanel.appendChild(viewListingPanelInner);
    viewListing.appendChild(viewListingPanel);

    function updateListingReference() {
      let listingRef = "";
      for (const div of document.querySelectorAll("div")) {
        if (!div.textContent || !div.textContent.includes("Réf.")) continue;
        const strong = div.querySelector("strong");
        if (strong) {
          const refText = strong.textContent.trim();
          if (/^\d+$/.test(refText)) {
            listingRef = refText;
            break;
          }
        }
      }
      viewListingPanelInner.querySelectorAll(".elch-entry").forEach((e) => e.remove());
      if (listingRef) {
        stopListingRefPolling();
        const row = document.createElement("div");
        row.className = "elch-entry";
        const url = `https://www.nexvia.lu/listing/reload/${listingRef}`;
        row.innerHTML = `<div>Nexvia listing</div><div><a href="${url}" target="_blank" rel="noopener"><button type="button" class="elch-download">Open</button></a></div>`;
        viewListingPanelInner.appendChild(row);
      } else {
        if (!isPollingForListingRef) startListingRefPolling(updateListingReference);
        const row = document.createElement("div");
        row.className = "elch-entry";
        row.innerHTML = `<div>Nexvia listing</div><div><span style="color:#999">Reference not found</span> <span class="material-icons" style="color:#2196F3;animation:elch-spin 2s linear infinite">refresh</span></div>`;
        viewListingPanelInner.appendChild(row);
      }
      recalculateHeight();
    }
    updateListingReference();
    window.updateListingReference = updateListingReference;
    sectionBox.appendChild(viewListing);
    recalculateHeight();
  }

  window.__elchRerender = showSections;

  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type !== "nexpilot:easyListing") return;
      if (msg.action === "getData") {
        let raw = "";
        try {
          raw = localStorage.getItem(STORAGE_KEY) || "";
          if (raw) {
            try {
              raw = JSON.stringify(JSON.parse(raw), null, 2);
            } catch {
              // keep as stored
            }
          }
        } catch {
          raw = "";
        }
        sendResponse({ ok: true, text: raw });
        return;
      }
      if (msg.action === "apply") {
        try {
          const t = String(msg.text ?? "").trim();
          if (!t) {
            jsonData = {};
            localStorage.setItem(STORAGE_KEY, JSON.stringify({}));
            localStorage.setItem(LAST_USED_KEY, String(Date.now()));
            filledFields.clear();
            filledDropdowns.clear();
            showSections();
            sendResponse({ ok: true });
            return;
          }
          const parsed = JSON.parse(t);
          if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
            sendResponse({ ok: false, error: "JSON must be a single object." });
            return;
          }
          jsonData = /** @type {Object<string, unknown>} */ (parsed);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(jsonData));
          localStorage.setItem(LAST_USED_KEY, String(Date.now()));
          filledFields.clear();
          filledDropdowns.clear();
          showSections();
          sendResponse({ ok: true });
        } catch {
          sendResponse({ ok: false, error: "Invalid JSON." });
        }
        return;
      }
      if (msg.action === "reset") {
        try {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.removeItem(LAST_USED_KEY);
          jsonData = {};
          filledFields.clear();
          filledDropdowns.clear();
          showSections();
          sendResponse({ ok: true });
        } catch (e) {
          sendResponse({ ok: false, error: (e && e.message) || "Reset failed." });
        }
        return;
      }
      sendResponse({ ok: false, error: "Unknown action." });
    });
  }
})();
