/* Easy Photo Upgrader (port of Tampermonkey “Easy photo resizer with ratio warning badge”)
   Runs on Easy (easy-serveur53) when the tool is enabled. */
(async function () {
  "use strict";

  if (window.nnEasyPhotoUpgrader) return;

  const TOOL_KEY = "tool.easyPhotoUpgrader";
  const PERCENT_KEY = "option.easyPhotoUpgraderPercent";
  const TOLERANCE = 0.03;
  const MATERIAL_ICONS = "https://fonts.googleapis.com/icon?family=Material+Icons";

  try {
    const enabled = self.__npToolEnabled
      ? await self.__npToolEnabled(TOOL_KEY, true)
      : (await chrome.storage.sync.get({ [TOOL_KEY]: true }))[TOOL_KEY];
    if (!enabled) return;
  } catch {
    // default on
  }

  window.nnEasyPhotoUpgrader = true;

  let currentPercent = 10;
  try {
    const { [PERCENT_KEY]: pct } = await chrome.storage.sync.get({ [PERCENT_KEY]: 10 });
    if (typeof pct === "number" && !Number.isNaN(pct)) {
      currentPercent = Math.min(25, Math.max(6, pct));
    } else if (typeof pct === "string") {
      const p = parseFloat(pct);
      if (!Number.isNaN(p)) currentPercent = Math.min(25, Math.max(6, p));
    }
  } catch {
    // default 10
  }

  function loadMaterialIcons() {
    if (document.getElementById("nn-easy-photo-material")) return;
    const link = document.createElement("link");
    link.id = "nn-easy-photo-material";
    link.rel = "stylesheet";
    link.href = MATERIAL_ICONS;
    document.head.appendChild(link);
  }

  function applyStyles() {
    const container = document.getElementById("photo-list");
    if (!container) return false;

    container.style.display = "flex";
    container.style.flexWrap = "wrap";
    container.style.gap = "6px";

    const photoCards = container.querySelectorAll(".col-12, .col-2, .col");
    const newWidth = `${currentPercent}%`;
    const newFlex = `0 0 ${newWidth}`;

    photoCards.forEach((card) => {
      card.classList.remove("col-12", "col-2", "col");
      card.classList.add("col");
      card.style.padding = "4px";

      card.style.maxWidth = newWidth;
      card.style.flex = newFlex;
      card.style.transition = "";

      const ellipsis = card.querySelector(".fa-ellipsis-h");
      if (ellipsis) ellipsis.style.fontSize = "10px";

      const menuIcon = card.querySelector(".header-photo-icon");
      if (menuIcon) menuIcon.style.display = "none";

      const cardBody = card.querySelector(".card-body");
      if (cardBody) {
        cardBody.style.padding = "0";
        cardBody.style.height = "unset";
        cardBody.style.minHeight = "unset";
        cardBody.style.maxHeight = "unset";
      }

      const cardDiv = card.querySelector(".card");
      if (cardDiv) {
        cardDiv.style.height = "auto";
        cardDiv.style.minHeight = "unset";
        cardDiv.style.maxHeight = "unset";
        cardDiv.style.overflow = "visible";
        cardDiv.style.display = "flex";
        cardDiv.style.flexDirection = "column";
        cardDiv.style.marginBottom = "0px";
        cardDiv.style.transition = "";
        cardDiv.style.position = "relative";
      }

      const header = card.querySelector(".card-header");
      if (header) {
        header.style.height = "unset";
        header.style.minHeight = "unset";
        header.style.maxHeight = "unset";
        header.style.overflow = "hidden";
        header.style.fontSize = "10px";
        header.style.padding = "4px";
      }

      const title = card.querySelector(".title-photo");
      if (title) title.style.fontSize = "10px";

      const img = card.querySelector(".card-img-top");
      if (img) {
        img.style.aspectRatio = "3 / 2";
        img.style.height = "auto";
        img.style.width = "100%";
        img.style.objectFit = "cover";
        img.style.transition = "";
      }

      if (img && cardDiv) {
        const runRatioCheck = () => {
          const titleText = (card.querySelector(".title-photo")?.textContent || "").toLowerCase();
          if (titleText.includes("plan")) return;

          const w = img.naturalWidth;
          const h = img.naturalHeight;
          if (!w || !h) return;

          const ratio = w / h;
          const isClose = Math.abs(ratio - 1.5) <= TOLERANCE;

          const existingBadge = cardDiv.querySelector(".ratio-badge");
          if (existingBadge) existingBadge.remove();

          const existingTooltip = cardDiv.querySelector(".ratio-tooltip");
          if (existingTooltip) existingTooltip.remove();

          if (!isClose) {
            const roundedRatio = ratio.toFixed(2);

            const badge = document.createElement("div");
            badge.className = "ratio-badge";
            badge.setAttribute("aria-label", "Non-3:2 image");
            badge.textContent = "priority_high";

            Object.assign(badge.style, {
              position: "absolute",
              top: "6px",
              left: "6px",
              width: "20px",
              height: "20px",
              borderRadius: "50%",
              background: "#FC3366",
              color: "white",
              fontSize: "14px",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
              zIndex: "9999",
              fontFamily: '"Material Icons", sans-serif'
            });

            const tooltip = document.createElement("div");
            tooltip.className = "ratio-tooltip";
            tooltip.textContent = `Image is ${roundedRatio}:1 ratio instead of 3:2`;

            Object.assign(tooltip.style, {
              position: "absolute",
              top: "32px",
              left: "6px",
              background: "#FC3366",
              color: "white",
              padding: "4px 8px",
              fontSize: "12px",
              whiteSpace: "nowrap",
              borderRadius: "4px",
              zIndex: "9999",
              display: "none",
              pointerEvents: "none"
            });

            badge.addEventListener("mouseenter", () => {
              tooltip.style.display = "block";
            });
            badge.addEventListener("mouseleave", () => {
              tooltip.style.display = "none";
            });

            cardDiv.appendChild(badge);
            cardDiv.appendChild(tooltip);
          }
        };

        if (img.complete) {
          runRatioCheck();
        } else {
          img.onload = runRatioCheck;
        }
      }
    });

    const folderAction = document.querySelector(".folder-action");
    if (folderAction) {
      folderAction.style.display = "flex";
      folderAction.style.flexWrap = "wrap";
      folderAction.style.alignItems = "center";
      folderAction.style.gap = "8px";

      const secondWrapper = folderAction.querySelector(".mt-3");
      if (secondWrapper) {
        secondWrapper.classList.remove("mt-3");
        secondWrapper.style.marginTop = "0";
      }

      if (!document.getElementById("nn-easy-photo-card-resizer")) {
        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = "6";
        slider.max = "25";
        slider.step = "0.1";
        slider.value = String(currentPercent);
        slider.id = "nn-easy-photo-card-resizer";
        slider.style.marginTop = "0px";
        slider.style.width = "200px";

        slider.addEventListener("input", () => {
          const v = parseFloat(slider.value);
          if (!Number.isNaN(v)) {
            currentPercent = v;
            void chrome.storage.sync.set({ [PERCENT_KEY]: v });
            applyStyles();
          }
        });

        const label = document.createElement("label");
        label.textContent = "Photo size: ";
        label.style.fontSize = "12px";
        label.style.marginLeft = "16px";
        label.style.marginRight = "4px";
        label.htmlFor = "nn-easy-photo-card-resizer";

        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.alignItems = "center";
        wrap.style.marginTop = "8px";
        wrap.appendChild(label);
        wrap.appendChild(slider);

        folderAction.style.marginBottom = "0";
        if (folderAction.nextSibling) {
          folderAction.parentNode.insertBefore(wrap, folderAction.nextSibling);
        } else {
          folderAction.parentNode.appendChild(wrap);
        }
      } else {
        const slider = document.getElementById("nn-easy-photo-card-resizer");
        if (slider && String(parseFloat(slider.value)) !== String(currentPercent)) {
          slider.value = String(currentPercent);
        }
      }
    }

    return true;
  }

  let raf = 0;
  function scheduleApply() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      applyStyles();
    });
  }

  loadMaterialIcons();
  applyStyles();

  new MutationObserver(() => {
    scheduleApply();
  }).observe(document.body, { childList: true, subtree: true });

  setInterval(applyStyles, 2000);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes[PERCENT_KEY]) {
      const p = changes[PERCENT_KEY].newValue;
      const v = parseFloat(p);
      if (!Number.isNaN(v)) {
        currentPercent = Math.min(25, Math.max(6, v));
        scheduleApply();
      }
    }
  });
})();
