/**
 * Meta Adcheck: under “Payment summary”, warn if the watch phrase appears (e.g. “Your ad will run continuously.”).
 * Optionally hide Publish. A separate phrase (e.g. “Run ad continuously”) is highlighted in red when found in the
 * page text. Options sync from the NexPilot popup. Uses <dialog>.showModal() where supported.
 */
(function () {
  "use strict";

  if (window.__nnContinuousAdBudgetWarning) return;

  const TOOL_KEY = "tool.continuousAdBudgetWarning";
  const CABW_SUPPRESS_KEY = "option.continuousAdBudget.suppressIfPageContains";
  const CABW_HIDE_PUBLISH_KEY = "option.continuousAdBudget.hidePublishButton";
  const CABW_HIGHLIGHT_KEY = "option.continuousAdBudget.highlightRedIfPageContains";
  const RED_HIGHLIGHT_ATTR = "data-nncabw-red-highlight";
  const MODAL_ROOT_ID = "nncabw-modal-root";
  const MODAL_OFFENDED_ID = "nncabw-offended-dialog";
  const PUBLISH_HIDDEN_ATTR = "data-nncabw-publish-hidden";
  const PUBLISH_PREV_STYLE_ATTR = "data-nncabw-prev-style";

  const DEFAULTS = {
    [CABW_SUPPRESS_KEY]: "Your ad will run continuously.",
    [CABW_HIGHLIGHT_KEY]: "Run ad continuously",
    [CABW_HIDE_PUBLISH_KEY]: true
  };

  const NN_HEX_SVG =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.79 16.5L12 21l-7.79-4.5V7.5L12 3l7.79 4.5v9z"/></svg>';

  (async function main() {
    let enabled = true;
    try {
      enabled = self.__npToolEnabled
        ? await self.__npToolEnabled(TOOL_KEY, true)
        : (await chrome.storage.sync.get({ [TOOL_KEY]: true }))[TOOL_KEY];
    } catch {
      // default on
    }
    if (!enabled) return;
    window.__nnContinuousAdBudgetWarning = true;

    void run();
  })();

  /** Empty string = Meta Adcheck does nothing (no warn, no Publish strip). */
  function normalizeSuppress(raw) {
    return String(raw ?? "").trim().slice(0, 280);
  }

  function run() {
    const STYLE = `
      .nncabw-warning-text {
        color: #b00020 !important;
        font-weight: 700 !important;
      }
      .nncabw-box {
        outline: 2px solid rgba(211, 47, 47, 0.85) !important;
        outline-offset: 2px !important;
        border-radius: 6px !important;
      }
      span.nncabw-red-highlight,
      [${RED_HIGHLIGHT_ATTR}="1"] {
        color: #b00020 !important;
        font-weight: 700 !important;
        background: rgba(255, 200, 200, 0.38) !important;
        border-radius: 2px !important;
      }
      dialog#${MODAL_ROOT_ID}.nncabw-modal-dialog {
        border: none;
        padding: 0;
        margin: auto;
        max-width: calc(100vw - 24px);
        background: transparent;
        color: inherit;
      }
      dialog#${MODAL_ROOT_ID}.nncabw-modal-dialog::backdrop {
        background: rgba(0, 0, 0, 0.6);
      }
      dialog#${MODAL_ROOT_ID}.nncabw-modal-dialog.nncabw-modal--polyfill {
        position: fixed !important;
        inset: 0 !important;
        width: 100% !important;
        height: 100% !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        z-index: 2147483647 !important;
        isolation: isolate !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 16px !important;
        box-sizing: border-box !important;
        background: rgba(0, 0, 0, 0.6) !important;
      }
      .nncabw-modal__sheet {
        width: min(440px, 100%);
        max-height: min(88vh, 520px);
        overflow: auto;
        background: #1e1e1e;
        color: #eaeaea;
        border: 1px solid #333;
        border-radius: 12px;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        pointer-events: auto;
        display: flex;
        flex-direction: column;
      }
      .nncabw-modal__header {
        display: flex;
        align-items: stretch;
        border-bottom: 1px solid #333;
        background: #252525;
        min-height: 48px;
        cursor: grab;
        user-select: none;
      }
      .nncabw-modal__header:active {
        cursor: grabbing;
      }
      .nncabw-modal__header .nncabw-modal__close {
        cursor: pointer;
      }
      .nncabw-modal__brand {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        padding: 6px 8px;
        border-right: 1px solid #333;
        flex: 0 0 auto;
        color: #eaeaea;
      }
      .nncabw-modal__brand-text {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.35px;
        line-height: 1.05;
      }
      .nncabw-modal__title-wrap {
        flex: 1;
        display: flex;
        align-items: center;
        padding: 10px 12px;
        min-width: 0;
      }
      .nncabw-modal__title {
        font-size: 14px;
        font-weight: 650;
        letter-spacing: 0.35px;
      }
      .nncabw-modal__close {
        flex: 0 0 auto;
        align-self: center;
        margin: 0 10px 0 4px;
        border: none;
        background: transparent;
        color: #a3a3a3;
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        padding: 6px 8px;
        border-radius: 8px;
      }
      .nncabw-modal__close:hover {
        color: #eaeaea;
        background: rgba(255,255,255,0.06);
      }
      .nncabw-modal__body {
        padding: 18px 20px 8px;
        font-size: 14px;
        line-height: 1.45;
        color: #eaeaea;
      }
      .nncabw-modal__body p {
        margin: 0 0 12px;
      }
      .nncabw-modal__body p:last-child {
        margin-bottom: 0;
      }
      .nncabw-modal__body strong {
        color: #fff;
        font-weight: 700;
      }
      .nncabw-modal__footer {
        padding: 12px 20px 18px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .nncabw-modal__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
      }
      .nncabw-modal__btn-primary {
        min-height: 38px;
        height: auto;
        padding: 8px 16px;
        border-radius: 10px;
        border: 1px solid rgba(16, 163, 127, 0.65);
        background: #10a37f;
        color: #fff;
        font-weight: 700;
        font-size: 12px;
        letter-spacing: 0.3px;
        cursor: pointer;
        white-space: normal;
        text-align: center;
        line-height: 1.3;
        max-width: 100%;
      }
      .nncabw-modal__btn-primary:hover {
        background: #0e906f;
      }
      .nncabw-modal__link {
        font-size: 12px;
        color: #10a37f;
        text-decoration: underline;
        cursor: pointer;
        font-weight: 600;
      }
      .nncabw-modal__link:hover {
        color: #12b88e;
      }
      button.nncabw-modal__link-as-btn {
        background: transparent;
        border: none;
        padding: 0;
        font: inherit;
        text-align: left;
      }
      dialog#${MODAL_OFFENDED_ID} {
        border: 1px solid #333;
        border-radius: 12px;
        padding: 20px 24px;
        background: #1e1e1e;
        color: #eaeaea;
        max-width: min(320px, calc(100vw - 32px));
      }
      dialog#${MODAL_OFFENDED_ID}::backdrop {
        background: rgba(0, 0, 0, 0.45);
      }
      .nncabw-offended__text {
        margin: 0 0 16px;
        font-size: 15px;
        line-height: 1.45;
      }
      .nncabw-offended__ok {
        height: 36px;
        padding: 0 16px;
        border-radius: 10px;
        border: 1px solid rgba(16, 163, 127, 0.65);
        background: #10a37f;
        color: #fff;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
      }
    `;

    function addStyles() {
      if (document.getElementById("nncabw-style")) return;
      const s = document.createElement("style");
      s.id = "nncabw-style";
      s.textContent = STYLE;
      document.documentElement.appendChild(s);
    }

    let opts = { ...DEFAULTS };
    let hideModalTimer = null;
    let modalShowRetryIntervalId = null;
    let runChecksTimer = null;
    let runChecksMaxTimer = null;
    /** After Dismiss / X / Escape, do not reopen the dialog until shouldWarn goes false (e.g. trigger phrase leaves Payment summary). */
    let metaAdModalSnoozedUntilWarnClears = false;

    async function readOptsFromStorage() {
      try {
        const r = await chrome.storage.sync.get(DEFAULTS);
        opts = {
          [CABW_SUPPRESS_KEY]: normalizeSuppress(r[CABW_SUPPRESS_KEY]),
          [CABW_HIGHLIGHT_KEY]: normalizeSuppress(r[CABW_HIGHLIGHT_KEY]),
          [CABW_HIDE_PUBLISH_KEY]: r[CABW_HIDE_PUBLISH_KEY] !== false
        };
      } catch {
        opts = { ...DEFAULTS };
      }
    }

    function textIsPaymentSummaryTitle(text) {
      const t = String(text || "")
        .replace(/\s+/g, " ")
        .trim();
      return /^payment summary$/i.test(t);
    }

    function unwrapRedHighlights() {
      try {
        document.querySelectorAll(`[${RED_HIGHLIGHT_ATTR}="1"]`).forEach((span) => {
          const parent = span.parentNode;
          if (!parent) return;
          while (span.firstChild) parent.insertBefore(span.firstChild, span);
          parent.removeChild(span);
          try {
            parent.normalize();
          } catch {
            /* ignore */
          }
        });
      } catch {
        /* ignore */
      }
    }

    function shouldSkipRedHighlightParent(el) {
      if (!el || el.nodeType !== 1) return true;
      if (el.closest(`[${RED_HIGHLIGHT_ATTR}]`)) return true;
      if (el.closest("script,style,noscript,svg")) return true;
      if (el.closest("textarea,input,select,button")) return true;
      if (el.closest("[data-nnpilot]")) return true;
      if (el.closest(`#${MODAL_ROOT_ID}, #${MODAL_OFFENDED_ID}`)) return true;
      if (el.closest("code,pre")) return true;
      let n = el;
      while (n) {
        if (n.isContentEditable) return true;
        n = n.parentElement;
      }
      return false;
    }

    function wrapAllOccurrencesInTextNode(textNode, needle) {
      const full = textNode.nodeValue;
      const parent = textNode.parentNode;
      if (full == null || !parent) return;
      if (!full.includes(needle)) return;
      const frag = document.createDocumentFragment();
      let i = 0;
      while (i < full.length) {
        const j = full.indexOf(needle, i);
        if (j === -1) {
          frag.appendChild(document.createTextNode(full.slice(i)));
          break;
        }
        if (j > i) frag.appendChild(document.createTextNode(full.slice(i, j)));
        const span = document.createElement("span");
        span.setAttribute(RED_HIGHLIGHT_ATTR, "1");
        span.className = "nncabw-red-highlight";
        span.appendChild(document.createTextNode(needle));
        frag.appendChild(span);
        i = j + needle.length;
      }
      parent.replaceChild(frag, textNode);
    }

    function findFirstRedHighlightTextNode(needle) {
      if (!needle || !document.body) return null;
      try {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
        let n;
        while ((n = walker.nextNode())) {
          const v = n.nodeValue;
          if (!v || !v.includes(needle)) continue;
          const p = n.parentElement;
          if (!p || shouldSkipRedHighlightParent(p)) continue;
          return n;
        }
      } catch {
        /* ignore */
      }
      return null;
    }

    function applyAllRedHighlights(needle) {
      if (!needle || !document.body) return;
      let guard = 0;
      while (guard++ < 5000) {
        const node = findFirstRedHighlightTextNode(needle);
        if (!node) break;
        wrapAllOccurrencesInTextNode(node, needle);
      }
    }

    let redHighlightTimer = null;
    function syncPageRedHighlights() {
      unwrapRedHighlights();
      const needle = normalizeSuppress(opts[CABW_HIGHLIGHT_KEY]);
      if (!needle) return;
      try {
        applyAllRedHighlights(needle);
      } catch {
        /* ignore */
      }
    }

    function scheduleRedHighlightSync() {
      if (redHighlightTimer) clearTimeout(redHighlightTimer);
      redHighlightTimer = setTimeout(() => {
        redHighlightTimer = null;
        syncPageRedHighlights();
      }, 280);
    }

    /**
     * Meta Adcheck only runs inside the budget block headed “Payment summary” (case-insensitive).
     */
    function findPaymentSummaryScopeElement() {
      try {
        const body = document.body;
        if (!body) return null;

        const pickRoot = (titleEl) => {
          const section =
            titleEl.closest("section") ||
            titleEl.closest("[role='region']") ||
            titleEl.closest("[data-pagelet]");
          if (section && section.contains(titleEl)) return section;
          let node = titleEl;
          for (let d = 0; d < 12 && node.parentElement; d++) {
            node = node.parentElement;
            const r = node.getBoundingClientRect?.();
            if (!r) continue;
            if (r.height >= 56 && r.height < window.innerHeight * 0.92 && r.width >= 160) return node;
          }
          return titleEl.parentElement || titleEl;
        };

        for (const h of body.querySelectorAll("h2, h3, h4, h5, h6, [role='heading']")) {
          if (textIsPaymentSummaryTitle(h.textContent)) return pickRoot(h);
        }
        for (const el of body.querySelectorAll("span, div")) {
          const t = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (t.length > 120) continue;
          if (!textIsPaymentSummaryTitle(t)) continue;
          return pickRoot(el);
        }
      } catch {
        /* ignore */
      }
      return null;
    }

    function queryPublishLikeButtons() {
      const out = [];
      try {
        document.querySelectorAll('[role="button"]').forEach((el) => {
          const lab = (el.getAttribute("aria-label") || "").trim();
          if (!lab) return;
          if (/^publish/i.test(lab)) out.push(el);
        });
      } catch {
        /* ignore */
      }
      return out;
    }

    function restoreHiddenPublishButtons() {
      try {
        document.querySelectorAll(`[${PUBLISH_HIDDEN_ATTR}="1"]`).forEach((node) => {
          if (!node || !node.isConnected) return;
          const prev = node.getAttribute(PUBLISH_PREV_STYLE_ATTR);
          node.removeAttribute(PUBLISH_HIDDEN_ATTR);
          node.removeAttribute(PUBLISH_PREV_STYLE_ATTR);
          node.style.removeProperty("display");
          node.style.removeProperty("visibility");
          if (prev === null || prev === "") {
            const s = (node.getAttribute("style") || "").trim();
            if (!s) node.removeAttribute("style");
          } else {
            node.setAttribute("style", prev);
          }
        });
      } catch {
        /* ignore */
      }
    }

    function hidePublishButtonsDom() {
      try {
        queryPublishLikeButtons().forEach((node) => {
          if (!node || !node.isConnected) return;
          if (node.getAttribute(PUBLISH_HIDDEN_ATTR) === "1") return;
          const prevRaw = node.getAttribute("style");
          node.setAttribute(PUBLISH_PREV_STYLE_ATTR, prevRaw == null ? "" : prevRaw);
          node.setAttribute(PUBLISH_HIDDEN_ATTR, "1");
          node.style.setProperty("display", "none", "important");
          node.style.setProperty("visibility", "hidden", "important");
        });
      } catch {
        /* ignore */
      }
    }

    /** Hide Publish when Meta Adcheck warns; restore when safe — reversible so Payment summary edits can bring it back. */
    function syncPublishForAdcheckState(st) {
      try {
        if (!opts[CABW_HIDE_PUBLISH_KEY]) {
          restoreHiddenPublishButtons();
          return;
        }
        if (st.shouldWarn) {
          hidePublishButtonsDom();
        } else {
          restoreHiddenPublishButtons();
        }
      } catch {
        /* ignore */
      }
    }

    let paymentSummaryObserver = null;
    let paymentSummaryObservedEl = null;
    let paymentSummarySyncTimer = null;

    function disconnectPaymentSummaryObserver() {
      if (paymentSummaryObserver) {
        paymentSummaryObserver.disconnect();
        paymentSummaryObserver = null;
      }
      paymentSummaryObservedEl = null;
    }

    function schedulePaymentSummaryPublishSync() {
      if (paymentSummarySyncTimer) clearTimeout(paymentSummarySyncTimer);
      paymentSummarySyncTimer = setTimeout(() => {
        paymentSummarySyncTimer = null;
        if (paymentSummaryObservedEl && !paymentSummaryObservedEl.isConnected) {
          disconnectPaymentSummaryObserver();
        }
        ensurePaymentSummaryObserver();
        syncPublishForAdcheckState(getContinuousWarnState());
      }, 100);
    }

    function ensurePaymentSummaryObserver() {
      if (!opts[CABW_HIDE_PUBLISH_KEY]) {
        disconnectPaymentSummaryObserver();
        restoreHiddenPublishButtons();
        return;
      }
      const scope = findPaymentSummaryScopeElement();
      if (!scope) {
        disconnectPaymentSummaryObserver();
        syncPublishForAdcheckState(getContinuousWarnState());
        return;
      }
      if (paymentSummaryObservedEl === scope && paymentSummaryObserver) return;
      disconnectPaymentSummaryObserver();
      paymentSummaryObservedEl = scope;
      paymentSummaryObserver = new MutationObserver(() => schedulePaymentSummaryPublishSync());
      paymentSummaryObserver.observe(scope, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true
      });
    }

    function stopModalShowRetry() {
      if (modalShowRetryIntervalId != null) {
        clearInterval(modalShowRetryIntervalId);
        modalShowRetryIntervalId = null;
      }
    }

    function removeOffendedModal() {
      const el = document.getElementById(MODAL_OFFENDED_ID);
      if (!el) return;
      if (typeof HTMLDialogElement !== "undefined" && el instanceof HTMLDialogElement) {
        try {
          if (el.open) el.close();
        } catch (_) {
          /* ignore */
        }
      }
      el.remove();
    }

    function removeMetaModal(userDismissed) {
      if (hideModalTimer) {
        clearTimeout(hideModalTimer);
        hideModalTimer = null;
      }
      if (userDismissed === true) {
        metaAdModalSnoozedUntilWarnClears = true;
      }
      stopModalShowRetry();
      removeOffendedModal();
      const el = document.getElementById(MODAL_ROOT_ID);
      document.removeEventListener("keydown", onEscapePolyfill, true);
      if (!el) return;
      if (typeof HTMLDialogElement !== "undefined" && el instanceof HTMLDialogElement) {
        try {
          if (el.open) {
            el.close();
          }
        } catch (_) {
          /* ignore */
        }
      }
      el.remove();
    }

    function onEscapePolyfill(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        removeMetaModal(true);
      }
    }

    /** Debounce before clearing highlight / tearing down a non-open shell (Meta DOM flickers). */
    const MODAL_HIDE_DEBOUNCE_MS = 600;
    /** While warn is active, re-try opening the dialog this often until it stays open (Meta sometimes blocks first paint). */
    const MODAL_SHOW_RETRY_MS = 1000;
    const RUN_CHECKS_DEBOUNCE_MS = 90;
    const RUN_CHECKS_MAX_WAIT_MS = 380;

    function clearContinuousHighlight(container, el) {
      if (container) {
        container.classList.remove("nncabw-box");
      }
      if (el) {
        el.classList.remove("nncabw-warning-text");
      }
    }

    /**
     * Only under a “Payment summary” section: if that subtree contains the watch phrase (e.g. Daily total budget),
     * warn; if the phrase is absent there, stay quiet.
     */
    function getContinuousWarnState() {
      const scope = findPaymentSummaryScopeElement();
      if (!scope) {
        return {
          shouldWarn: false,
          container: null,
          element: null,
          blockReason: "no_payment_summary"
        };
      }

      const needle = normalizeSuppress(opts[CABW_SUPPRESS_KEY]);
      if (!needle) {
        return {
          shouldWarn: false,
          container: null,
          element: null,
          blockReason: "suppress_needle_empty"
        };
      }

      let hay = "";
      try {
        hay = scope.innerText || "";
      } catch {
        hay = "";
      }
      if (hay.includes(needle)) {
        return {
          shouldWarn: true,
          container: null,
          element: null,
          blockReason: null
        };
      }
      return {
        shouldWarn: false,
        container: null,
        element: null,
        blockReason: "trigger_phrase_absent"
      };
    }

    function cancelHideModalTimer() {
      if (hideModalTimer) {
        clearTimeout(hideModalTimer);
        hideModalTimer = null;
      }
    }

    function scheduleHideModalAndClearHighlight() {
      cancelHideModalTimer();
      hideModalTimer = setTimeout(() => {
        hideModalTimer = null;
        const st = getContinuousWarnState();
        if (st.shouldWarn) return;
        clearContinuousHighlight(st.container, st.element);
        const d = document.getElementById(MODAL_ROOT_ID);
        if (d && d.open) {
          return;
        }
        removeMetaModal();
      }, MODAL_HIDE_DEBOUNCE_MS);
    }

    function modalShowRetryTick() {
      const st = getContinuousWarnState();
      if (!st.shouldWarn) {
        stopModalShowRetry();
        return;
      }
      if (metaAdModalSnoozedUntilWarnClears) {
        stopModalShowRetry();
        return;
      }
      if (st.container && st.element) {
        st.container.classList.add("nncabw-box");
        st.element.classList.add("nncabw-warning-text");
      }
      showMetaModal();
      const el = document.getElementById(MODAL_ROOT_ID);
      if (el && el.open) {
        stopModalShowRetry();
      }
    }

    function startModalShowRetryIfNeeded() {
      if (modalShowRetryIntervalId != null) return;
      modalShowRetryIntervalId = setInterval(modalShowRetryTick, MODAL_SHOW_RETRY_MS);
    }

    function showOffendedModal() {
      removeOffendedModal();
      const d = document.createElement("dialog");
      d.id = MODAL_OFFENDED_ID;
      d.setAttribute("data-nnpilot", "meta-adcheck-offended");

      const p = document.createElement("p");
      p.className = "nncabw-offended__text";
      p.textContent = "Offended? Deal with it :)";

      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "nncabw-offended__ok";
      ok.textContent = "OK";
      ok.addEventListener("click", (e) => {
        e.preventDefault();
        removeOffendedModal();
      });

      d.appendChild(p);
      d.appendChild(ok);
      d.addEventListener("cancel", (e) => {
        e.preventDefault();
        removeOffendedModal();
      });

      (document.body || document.documentElement).appendChild(d);
      let poly = false;
      if (typeof d.showModal !== "function") {
        poly = true;
      } else {
        try {
          d.showModal();
        } catch {
          poly = true;
        }
      }
      if (poly) {
        d.style.cssText =
          "position:fixed;z-index:2147483647;left:50%;top:50%;transform:translate(-50%,-50%);margin:0;";
        d.setAttribute("open", "");
      }
    }

    /** Same idea as `ui/overlay.js` makeDraggable — drag the sheet by the header (skip buttons/links). */
    function wireMetaAdSheetDrag(dialog) {
      const sheet = dialog.querySelector(".nncabw-modal__sheet");
      const header = dialog.querySelector(".nncabw-modal__header");
      if (!sheet || !header || sheet.dataset.nncabwDragWired === "1") return;
      sheet.dataset.nncabwDragWired = "1";

      const clampSheetToViewport = () => {
        const rect = sheet.getBoundingClientRect();
        const margin = 8;
        const maxX = Math.max(margin, window.innerWidth - rect.width - margin);
        const maxY = Math.max(margin, window.innerHeight - rect.height - margin);
        const left = Math.min(Math.max(margin, rect.left), maxX);
        const top = Math.min(Math.max(margin, rect.top), maxY);
        sheet.style.left = `${Math.round(left)}px`;
        sheet.style.top = `${Math.round(top)}px`;
      };

      const pinSheetFromRect = () => {
        const r = sheet.getBoundingClientRect();
        sheet.style.position = "fixed";
        sheet.style.margin = "0";
        sheet.style.left = `${Math.round(r.left)}px`;
        sheet.style.top = `${Math.round(r.top)}px`;
        sheet.style.right = "auto";
        sheet.style.transform = "none";
      };

      let isDragging = false;
      let startX = 0;
      let startY = 0;

      const onMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        startX = e.clientX;
        startY = e.clientY;
        const left = parseInt(String(sheet.style.left || "0"), 10) + dx;
        const top = parseInt(String(sheet.style.top || "0"), 10) + dy;
        sheet.style.left = `${left}px`;
        sheet.style.top = `${top}px`;
      };

      const onUp = () => {
        if (!isDragging) return;
        isDragging = false;
        header.style.cursor = "grab";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        clampSheetToViewport();
      };

      header.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        if (e.target.closest("button, a")) return;
        e.preventDefault();
        pinSheetFromRect();
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        header.style.cursor = "grabbing";
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });
    }

    function showMetaModal() {
      if (metaAdModalSnoozedUntilWarnClears) return;
      const existing = document.getElementById(MODAL_ROOT_ID);
      if (existing) {
        if (existing.open) return;
        try {
          if (typeof existing.showModal === "function") {
            existing.showModal();
            existing.classList.remove("nncabw-modal--polyfill");
            existing.removeAttribute("open");
            document.removeEventListener("keydown", onEscapePolyfill, true);
            wireMetaAdSheetDrag(existing);
            return;
          }
        } catch {
          /* Prefer polyfill on the same node — avoid remove() which reads as “popup vanished”. */
        }
        if (existing.isConnected) {
          document.removeEventListener("keydown", onEscapePolyfill, true);
          existing.classList.add("nncabw-modal--polyfill");
          existing.setAttribute("open", "");
          document.addEventListener("keydown", onEscapePolyfill, true);
          wireMetaAdSheetDrag(existing);
        } else {
          removeMetaModal();
        }
        return;
      }

      const dialog = document.createElement("dialog");
      dialog.id = MODAL_ROOT_ID;
      dialog.className = "nncabw-modal-dialog";
      dialog.setAttribute("data-nnpilot", "meta-adcheck-modal");

      const dismiss = () => {
        removeMetaModal(true);
      };

      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) {
          e.preventDefault();
          dismiss();
        }
      });

      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        dismiss();
      });

      const sheet = document.createElement("div");
      sheet.className = "nncabw-modal__sheet";
      sheet.setAttribute("role", "document");
      sheet.addEventListener("click", (e) => e.stopPropagation());

      const header = document.createElement("div");
      header.className = "nncabw-modal__header";

      const brand = document.createElement("div");
      brand.className = "nncabw-modal__brand";
      brand.innerHTML = NN_HEX_SVG;
      const brandText = document.createElement("span");
      brandText.className = "nncabw-modal__brand-text";
      brandText.textContent = "NexPilot";
      brand.appendChild(brandText);

      const titleWrap = document.createElement("div");
      titleWrap.className = "nncabw-modal__title-wrap";
      const title = document.createElement("div");
      title.id = "nncabw-modal-title";
      title.className = "nncabw-modal__title";
      title.textContent = "Meta Adcheck";
      titleWrap.appendChild(title);

      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "nncabw-modal__close";
      closeBtn.setAttribute("aria-label", "Close");
      closeBtn.textContent = "×";
      closeBtn.addEventListener("click", (e) => {
        e.preventDefault();
        dismiss();
      });

      header.appendChild(brand);
      header.appendChild(titleWrap);
      header.appendChild(closeBtn);

      const body = document.createElement("div");
      body.className = "nncabw-modal__body";
      const bodyP = document.createElement("p");
      bodyP.textContent =
        "Facebook and Zuckerberg are a bunch of greedy, scamming f*ckers. Change to non-continuous budget.";
      body.appendChild(bodyP);

      const footer = document.createElement("div");
      footer.className = "nncabw-modal__footer";
      const actions = document.createElement("div");
      actions.className = "nncabw-modal__actions";

      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = "nncabw-modal__btn-primary";
      ok.textContent = "I agree to the above statement";
      ok.addEventListener("click", (e) => {
        e.preventDefault();
        dismiss();
      });

      const offendedBtn = document.createElement("button");
      offendedBtn.type = "button";
      offendedBtn.className = "nncabw-modal__link nncabw-modal__link-as-btn";
      offendedBtn.textContent = "I am offended by this";
      offendedBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showOffendedModal();
      });

      actions.appendChild(ok);
      actions.appendChild(offendedBtn);
      footer.appendChild(actions);

      sheet.appendChild(header);
      sheet.appendChild(body);
      sheet.appendChild(footer);
      dialog.appendChild(sheet);

      (document.body || document.documentElement).appendChild(dialog);

      let usePolyfill = false;
      if (typeof dialog.showModal !== "function") {
        usePolyfill = true;
      } else {
        try {
          dialog.showModal();
        } catch {
          usePolyfill = true;
        }
      }
      if (usePolyfill) {
        dialog.classList.add("nncabw-modal--polyfill");
        dialog.setAttribute("open", "");
        document.addEventListener("keydown", onEscapePolyfill, true);
      }
      wireMetaAdSheetDrag(dialog);
    }

    function findAndWarn() {
      const st = getContinuousWarnState();
      ensurePaymentSummaryObserver();
      syncPublishForAdcheckState(st);
      if (!st.shouldWarn) {
        metaAdModalSnoozedUntilWarnClears = false;
        stopModalShowRetry();
        scheduleHideModalAndClearHighlight();
        return;
      }

      cancelHideModalTimer();
      if (st.container && st.element) {
        st.container.classList.add("nncabw-box");
        st.element.classList.add("nncabw-warning-text");
      }

      if (metaAdModalSnoozedUntilWarnClears) {
        stopModalShowRetry();
        return;
      }

      showMetaModal();
      const el = document.getElementById(MODAL_ROOT_ID);
      if (el && el.open) {
        stopModalShowRetry();
        return;
      }
      startModalShowRetryIfNeeded();
    }

    function runChecks() {
      findAndWarn();
      scheduleRedHighlightSync();
    }

    function runChecksDebouncedFromObserver() {
      clearTimeout(runChecksTimer);
      runChecksTimer = setTimeout(() => {
        runChecksTimer = null;
        if (runChecksMaxTimer) {
          clearTimeout(runChecksMaxTimer);
          runChecksMaxTimer = null;
        }
        runChecks();
      }, RUN_CHECKS_DEBOUNCE_MS);

      if (!runChecksMaxTimer) {
        runChecksMaxTimer = setTimeout(() => {
          runChecksMaxTimer = null;
          clearTimeout(runChecksTimer);
          runChecksTimer = null;
          runChecks();
        }, RUN_CHECKS_MAX_WAIT_MS);
      }
    }

    addStyles();

    void (async () => {
      await readOptsFromStorage();

      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync") return;
        if (
          !changes[CABW_SUPPRESS_KEY] &&
          !changes[CABW_HIDE_PUBLISH_KEY] &&
          !changes[CABW_HIGHLIGHT_KEY]
        ) {
          return;
        }
        void readOptsFromStorage().then(runChecks);
      });

      const observer = new MutationObserver(() => {
        runChecksDebouncedFromObserver();
      });
      const root = document.body || document.documentElement;
      observer.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-checked", "aria-label"]
      });
      runChecks();
    })();
  }
})();
