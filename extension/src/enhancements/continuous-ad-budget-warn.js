/**
 * Warns when “Run this ad continuously” is selected in Meta ad UI (port of a Tampermonkey script).
 */
(function () {
  "use strict";

  if (window.__nnContinuousAdBudgetWarning) return;

  const TOOL_KEY = "tool.continuousAdBudgetWarning";
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

  function run() {
    const STYLE = `
      .nncabw-warning-text {
        color: #b00020 !important;
        font-weight: 700 !important;
      }
      .nncabw-box {
        border: 2px solid #d32f2f !important;
        border-radius: 6px !important;
        box-shadow: 0 0 6px rgba(211, 47, 47, 0.45) !important;
      }
      .nncabw-popup {
        position: absolute;
        top: -50px;
        left: 0;
        background: #ffebee;
        border: 1px solid #d32f2f;
        padding: 6px 10px 8px;
        border-radius: 6px;
        font: 13px/1.3 Arial, sans-serif;
        font-weight: 700;
        color: #b00020;
        z-index: 2147483001;
        cursor: pointer;
        max-width: min(320px, 80vw);
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 4px;
        animation: nncabw-pulse-border 1.5s infinite;
      }
      @keyframes nncabw-pulse-border {
        0% { border-color: #d32f2f; }
        50% { border-color: #ff6b6b; }
        100% { border-color: #d32f2f; }
      }
      .nncabw-popup-main {
        font-size: 13px;
        font-weight: 700;
      }
      .nncabw-popup-hint a {
        font-size: 11px;
        font-weight: 400;
        color: #1565c0;
        text-decoration: underline;
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

    const CONTINUOUS_TEXT = "Run this ad continuously";
    const POPUP_ID = "nncabw-continuous-budget-popup";

    function findAndWarn() {
      const radioButtons = document.querySelectorAll('[role="radio"]');
      let continuousRadioContainer = null;
      let continuousElement = null;

      for (const container of radioButtons) {
        if (container.textContent.includes(CONTINUOUS_TEXT)) {
          continuousRadioContainer = container;
          continuousElement = Array.from(container.querySelectorAll("span")).find(
            (span) => span.textContent.trim() === CONTINUOUS_TEXT
          );
          break;
        }
      }

      const existingPopup = document.getElementById(POPUP_ID);

      if (continuousRadioContainer && continuousElement) {
        const isSelected = continuousRadioContainer.getAttribute("aria-checked") === "true";

        if (isSelected) {
          continuousRadioContainer.classList.add("nncabw-box");
          continuousElement.classList.add("nncabw-warning-text");
          if (!continuousRadioContainer.style.position) {
            continuousRadioContainer.style.position = "relative";
          }

          if (!existingPopup) {
            const popup = document.createElement("div");
            popup.id = POPUP_ID;
            popup.className = "nncabw-popup";
            popup.setAttribute("role", "status");
            popup.setAttribute("aria-live", "polite");
            popup.title = "Click the message to hide this note";

            const mainText = document.createElement("div");
            mainText.className = "nncabw-popup-main";
            mainText.textContent =
              "Continuous spend runs until you stop it. Consider a daily or lifetime cap if you need tighter control.";

            const hint = document.createElement("div");
            hint.className = "nncabw-popup-hint";
            const help = document.createElement("a");
            help.href = "https://www.facebook.com/business/help";
            help.target = "_blank";
            help.rel = "noopener noreferrer";
            help.textContent = "Meta: about budgets & spend";
            hint.appendChild(help);

            const dismiss = (e) => {
              e.preventDefault();
              e.stopPropagation();
              const p = document.getElementById(POPUP_ID);
              if (p) p.remove();
            };
            mainText.addEventListener("click", dismiss);
            popup.addEventListener("click", (e) => {
              if (e.target === popup) dismiss(e);
            });

            popup.appendChild(mainText);
            popup.appendChild(hint);
            continuousRadioContainer.appendChild(popup);
          }
        } else {
          continuousRadioContainer.classList.remove("nncabw-box");
          continuousElement.classList.remove("nncabw-warning-text");
          if (existingPopup) existingPopup.remove();
        }
      } else {
        if (existingPopup) existingPopup.remove();
      }
    }

    addStyles();
    const observer = new MutationObserver(() => {
      findAndWarn();
    });
    const root = document.body || document.documentElement;
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-checked"]
    });
    findAndWarn();
  }
})();
