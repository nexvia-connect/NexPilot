// Shared UI overlay for all helpers.
// Uses Shadow DOM to prevent CSS collisions with host pages.
//
// Content scripts are not ES modules, so we expose a single global:
//   window.NexviaNoviaUI.{ createCard, getBody, icons }

const OVERLAY_ID = "nn-overlay-host";

function ensureOverlayHost() {
  let host = document.getElementById(OVERLAY_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = OVERLAY_ID;
  host.style.cssText = "position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;";
  document.documentElement.appendChild(host);
  return host;
}

async function loadCssText(url) {
  const res = await fetch(url);
  return await res.text();
}

function makeDraggable({ dragHandleEl, targetEl }) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  const onMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    startX = e.clientX;
    startY = e.clientY;

    const left = parseInt(targetEl.style.left || "0", 10) + dx;
    const top = parseInt(targetEl.style.top || "0", 10) + dy;
    targetEl.style.left = `${left}px`;
    targetEl.style.top = `${top}px`;
  };

  const onUp = () => {
    isDragging = false;
    dragHandleEl.style.cursor = "grab";
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  dragHandleEl.addEventListener("mousedown", (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;

    const rect = targetEl.getBoundingClientRect();
    targetEl.style.transform = "none";
    targetEl.style.left = `${rect.left}px`;
    targetEl.style.top = `${rect.top}px`;

    dragHandleEl.style.cursor = "grabbing";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  });
}

async function ensureOverlay() {
  const host = ensureOverlayHost();
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });

  // Create overlay container once
  let overlay = shadow.getElementById("nn-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "nn-overlay";
    overlay.className = "nn-overlay";
    shadow.appendChild(overlay);
  }

  // Ensure theme CSS is loaded once
  if (!shadow.getElementById("nn-theme-style")) {
    const styleEl = document.createElement("style");
    styleEl.id = "nn-theme-style";
    const cssUrl = chrome.runtime.getURL("src/ui/theme.css");
    styleEl.textContent = await loadCssText(cssUrl);
    shadow.prepend(styleEl);
  }

  return { host, shadow, overlay };
}

async function nnCreateCard({ id, title, width = 420, anchor = "center" }) {
  const { overlay } = await ensureOverlay();

  // If already exists, return it
  const existing = overlay.querySelector(`[data-nn-id="${CSS.escape(id)}"]`);
  if (existing) return existing;

  const card = document.createElement("div");
  card.dataset.nnId = id;
  card.className = "nn-card";
  card.style.width = `${width}px`;
  card.style.position = "fixed";
  card.style.pointerEvents = "auto";

  if (anchor === "top-right") {
    card.style.top = "100px";
    card.style.right = "20px";
  } else {
    card.style.top = "50%";
    card.style.left = "50%";
    card.style.transform = "translate(-50%, -50%)";
  }

  card.innerHTML = `
    <div class="nn-header" data-nn-drag>
      <div class="nn-title"></div>
      <div class="nn-close" data-nn-close aria-label="Close">✕</div>
    </div>
    <div class="nn-body" data-nn-body></div>
  `;

  card.querySelector(".nn-title").textContent = title || "Nexvia Novia";

  overlay.appendChild(card);

  // Wire close button (removes just this card)
  card.querySelector("[data-nn-close]").addEventListener("click", () => card.remove());

  // Enable dragging by header
  makeDraggable({
    dragHandleEl: card.querySelector("[data-nn-drag]"),
    targetEl: card
  });

  return card;
}

function nnGetBody(cardEl) {
  return cardEl.querySelector("[data-nn-body]");
}

function nnIcons() {
  return {
    copy: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
    check: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
  };
}

(function expose() {
  if (window.NexviaNoviaUI) return;
  window.NexviaNoviaUI = {
    createCard: nnCreateCard,
    getBody: nnGetBody,
    icons: nnIcons
  };
})();

