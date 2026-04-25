// Shared UI overlay for all helpers.
// Uses Shadow DOM to prevent CSS collisions with host pages.
//
// Content scripts are not ES modules, so we expose a single global:
//   window.NexPilotUI.{ createCard, getBody, icons }

const OVERLAY_ID = "nn-overlay-host";

/** Flat-top regular hexagon in 24×24 (same shape as the toolbar icon). */
const NN_HEX_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.79 16.5L12 21l-7.79-4.5V7.5L12 3l7.79 4.5v9z"/></svg>`;
const NN_HEX_SVG_HEADER = `<svg class="nn-hex-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.79 16.5L12 21l-7.79-4.5V7.5L12 3l7.79 4.5v9z"/></svg>`;
/** Slightly smaller — stacked in the minimize chip, hex above the label. */
const NN_MINIPILL_HEX = `<svg class="nn-minipill-hex-svgr" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.79 16.5L12 21l-7.79-4.5V7.5L12 3l7.79 4.5v9z"/></svg>`;

// Inline theme CSS to avoid any resource fetching issues
// (some sites + MV3 setups can block loading extension CSS via <link>).
const NN_THEME_CSS = `
:host, :root {
  --nn-font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
  --nn-z: 2147483000;
  /* Elevation *inside* #nn-overlay: card, then minipill; helpers’ fixed toasts use a higher value */
  --nn-elev: 0;
  --nn-elev-top: 2;
  --nn-bg: #0f0f10;
  --nn-panel: #1e1e1e;
  --nn-panel-2: #252525;
  --nn-border: #333;
  --nn-border-2: #404040;
  --nn-text: #eaeaea;
  --nn-text-dim: #a3a3a3;
  --nn-green: #2e7d32;
  --nn-green-2: #10a37f;
  --nn-red: #d9534f;
  --nn-radius: 12px;
  --nn-radius-sm: 10px;
  --nn-shadow: 0 10px 40px rgba(0, 0, 0, 0.40);
  --nn-shadow-2: 0 10px 30px rgba(0, 0, 0, 0.80);
}
.nn-overlay { position: fixed; inset: 0; pointer-events: none; z-index: var(--nn-z); font-family: var(--nn-font); }
.nn-card { z-index: var(--nn-elev); pointer-events: auto; background: var(--nn-panel); color: var(--nn-text); border: 1px solid var(--nn-border); border-radius: var(--nn-radius); box-shadow: var(--nn-shadow); overflow: hidden; }
.nn-header { background: var(--nn-panel-2); border-bottom: 1px solid var(--nn-border); padding: 0; display: flex; align-items: stretch; justify-content: flex-start; cursor: grab; user-select: none; min-height: 48px; }
/* Left column: stack hex above label; same bg as header; narrow strip; top-left matches card radius. */
.nn-brand { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px 6px; flex: 0 0 auto; background: var(--nn-panel-2); border-right: 1px solid var(--nn-border); color: var(--nn-text); font-weight: 800; letter-spacing: 0.3px; font-size: 10px; text-align: center; border-radius: var(--nn-radius) 0 0 0; }
.nn-hex-icon { display: block; width: 15px; height: 15px; flex-shrink: 0; }
.nn-brand-text { line-height: 1.05; white-space: nowrap; }
.nn-header-main { flex: 1; min-width: 0; display: flex; align-items: center; padding: 10px 8px 10px 14px; }
.nn-title { font-size: 14px; font-weight: 650; letter-spacing: 0.5px; }
.nn-close { flex: 0 0 auto; align-self: center; margin: 0 14px 0 4px; cursor:pointer; color: var(--nn-text-dim); font-size: 16px; line-height:1; padding: 4px 6px; border-radius: 8px; }
.nn-close:hover { color: var(--nn-text); background: rgba(255,255,255,0.06); }
.nn-body { padding: 20px; }
/* Listing creator & dense tools: use body.classList.add("nn-body--tight") */
.nn-body.nn-body--tight { padding: 5px; }
.nn-img { width:100%; height: 220px; object-fit: cover; display:block; border-radius: var(--nn-radius-sm); border: 1px solid var(--nn-border); margin-bottom: 12px; box-sizing: border-box; }
.nn-row { display:flex; gap: 12px; align-items: stretch; }
.nn-input { flex:1; height: 38px; padding: 0 12px; border: 1px solid var(--nn-border); background: #000; color: var(--nn-text); border-radius: var(--nn-radius-sm); font-size: 13px; outline:none; box-shadow:none; }
.nn-input:focus { border-color: rgba(16, 163, 127, 0.55); box-shadow: 0 0 0 3px rgba(16, 163, 127, 0.12); }
.nn-btn { height: 38px; min-width: 38px; padding: 0 12px; border-radius: var(--nn-radius-sm); cursor:pointer; border: 1px solid #555; background: #333; color: var(--nn-text); display:inline-flex; align-items:center; justify-content:center; gap: 8px; font-weight: 700; font-size: 12px; letter-spacing: 0.3px; transition: background 0.18s ease, border-color 0.18s ease, transform 0.06s ease, box-shadow 0.18s ease, color 0.18s ease; }
.nn-btn:hover { border-color: #666; background: #3b3b3b; }
.nn-btn:active { transform: translateY(1px); }
.nn-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.nn-btn-primary { background: var(--nn-green-2); border-color: rgba(16, 163, 127, 0.65); box-shadow: 0 2px 5px rgba(0,0,0,0.2); }
.nn-btn-primary:hover { background: #0e906f; }
.nn-btn-ghost { background: transparent; border-color: var(--nn-border-2); color: var(--nn-text-dim); }
.nn-btn-ghost:hover { color: var(--nn-text); background: rgba(255,255,255,0.06); border-color: #555; }
.nn-tooltip { position:absolute; bottom: 120%; left: 50%; transform: translateX(-50%); background: var(--nn-green); color:#fff; padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 800; opacity: 0; transition: opacity 0.2s; pointer-events:none; white-space:nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.35); }
.nn-badges { display:flex; flex-wrap: wrap; gap: 8px; }
.nn-badge { background: #2c2c2c; color: var(--nn-text-dim); padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 650; border: 1px solid var(--nn-border-2); }
.nn-badge.nn-active { background: rgba(16, 163, 127, 0.15); color: var(--nn-green-2); border-color: rgba(16, 163, 127, 0.4); }

/* Minimized chip — hex above “NexPilot”, left/top from JS; stacks above the card in the overlay */
.nn-minipill {
  position: fixed;
  z-index: var(--nn-elev-top);
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 10px 10px;
  min-width: 0;
  border-radius: 12px;
  border: 1px solid var(--nn-border);
  background: rgba(16, 16, 16, 0.92);
  color: #fff;
  box-shadow: var(--nn-shadow-2);
  cursor: pointer;
  user-select: none;
  transform-origin: 50% 100%;
  will-change: transform, opacity;
  transition:
    box-shadow 0.25s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}
.nn-minipill:hover {
  background: rgba(22, 22, 22, 0.96);
  border-color: #444;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
}
.nn-minipill:active { transform: scale(0.97); }
.nn-minipill-hex {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  filter: drop-shadow(0 0 1px rgba(0,0,0,0.35));
}
.nn-minipill-hex-svgr { display: block; }
.nn-minipill-label {
  font-weight: 800;
  letter-spacing: 0.45px;
  font-size: 9px;
  line-height: 1.05;
  text-align: center;
  white-space: nowrap;
}

/* Minimize: card recedes; then chip pops in */
.nn-minipill-anim--in {
  animation: nn-mx-pill-in 0.4s cubic-bezier(0.34, 1.2, 0.64, 1) both;
}
.nn-minipill-anim--out {
  animation: nn-mx-pill-out 0.22s cubic-bezier(0.4, 0, 0.6, 1) both;
  pointer-events: none !important;
}
.nn-card.nn-card-anim--in {
  animation: nn-mx-card-in 0.38s cubic-bezier(0.34, 1.15, 0.64, 1) both;
  transition: none !important;
}

@keyframes nn-mx-pill-in {
  0%   { opacity: 0; transform: scale(0.78) translateY(10px); }
  55%  { opacity: 1; transform: scale(1.05) translateY(0); }
  100% { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes nn-mx-pill-out {
  0%   { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.88) translateY(6px); }
}
@keyframes nn-mx-card-in {
  0%   { opacity: 0; transform: scale(0.9); }
  60%  { opacity: 1; transform: scale(1.02); }
  100% { opacity: 1; transform: scale(1); }
}

/* Morph-ish transitions (panel hide / show) */
.nn-hidden {
  opacity: 0;
  transform: scale(0.9);
  pointer-events: none !important;
}
.nn-card {
  transform-origin: 50% 50%;
  will-change: transform, opacity;
  transition:
    opacity 0.28s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.nn-minipill:not(.nn-minipill-anim--in) {
  transition: opacity 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}
@media (prefers-reduced-motion: reduce) {
  .nn-minipill-anim--in,
  .nn-minipill-anim--out,
  .nn-card-anim--in {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
  .nn-card,
  .nn-hidden,
  .nn-minipill:not(.nn-minipill-anim--in) {
    transition-duration: 0.01ms !important;
  }
}
`;

function ensureOverlayHost() {
  let host = document.getElementById(OVERLAY_ID);
  if (host) return host;

  host = document.createElement("div");
  host.id = OVERLAY_ID;
  host.style.cssText = "position: fixed; inset: 0; z-index: 2147483000; pointer-events: none;";
  document.documentElement.appendChild(host);
  return host;
}

function ensureThemeCss(shadow) {
  if (shadow.getElementById("nn-theme-style")) return;
  const styleEl = document.createElement("style");
  styleEl.id = "nn-theme-style";
  styleEl.textContent = NN_THEME_CSS;
  shadow.prepend(styleEl);
}

function makeDraggable({ dragHandleEl, targetEl }) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let moved = false;

  const onMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && (Math.abs(dx) + Math.abs(dy) >= 4)) moved = true;
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

    // If the user dragged, suppress the immediate click that can fire on mouseup.
    if (moved) {
      targetEl.dataset.nnJustDragged = "1";
      window.setTimeout(() => {
        delete targetEl.dataset.nnJustDragged;
      }, 0);
    }
  };

  dragHandleEl.addEventListener("mousedown", (e) => {
    isDragging = true;
    moved = false;
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

function clampToViewport(el) {
  const rect = el.getBoundingClientRect();
  const maxX = Math.max(0, window.innerWidth - rect.width);
  const maxY = Math.max(0, window.innerHeight - rect.height);
  const x = Math.min(Math.max(0, rect.left), maxX);
  const y = Math.min(Math.max(0, rect.top), maxY);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.right = "auto";
  el.style.bottom = "auto";
}

/** Pin the minipill to the card’s bottom-right (same “layer” as the card; `z-index` in CSS) */
function positionMinipillByCardRect(pill, cardRect) {
  const w = pill.offsetWidth > 2 ? pill.offsetWidth : 52;
  const h = pill.offsetHeight > 2 ? pill.offsetHeight : 52;
  const inset = 2;
  let left = Math.round(cardRect.right - w - inset);
  let top = Math.round(cardRect.bottom - h - inset);
  const margin = 4;
  const maxL = Math.max(margin, window.innerWidth - w - margin);
  const maxT = Math.max(margin, window.innerHeight - h - margin);
  left = Math.min(maxL, Math.max(margin, left));
  top = Math.min(maxT, Math.max(margin, top));
  pill.style.left = `${left}px`;
  pill.style.top = `${top}px`;
  pill.style.right = "auto";
  pill.style.bottom = "auto";
}

/** Place the card so its bottom-right matches the pill (mirror of positionMinipillByCardRect). */
function positionCardFromPillAnchor(card, pillRect) {
  const w = card.offsetWidth;
  const h = card.offsetHeight;
  if (w < 2 || h < 2) return;
  const left = Math.round(pillRect.right - w);
  const top = Math.round(pillRect.bottom - h);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  card.style.right = "auto";
  card.style.transform = "none";
}

function ensureMinipill(overlay, id) {
  const pillId = `nn-minipill-${id}`;
  let pill = overlay.querySelector(`#${CSS.escape(pillId)}`);
  if (pill) return pill;

  pill = document.createElement("div");
  pill.id = pillId;
  pill.className = "nn-minipill nn-hidden";
  pill.innerHTML = `<span class="nn-minipill-hex">${NN_MINIPILL_HEX}</span><span class="nn-minipill-label">NexPilot</span>`;
  overlay.appendChild(pill);

  // make pill draggable by itself
  makeDraggable({ dragHandleEl: pill, targetEl: pill });

  // First mousedown: pin to fixed left/top in px so makeDraggable deltas stay valid
  pill.addEventListener("mousedown", () => {
    const r = pill.getBoundingClientRect();
    pill.style.left = `${r.left}px`;
    pill.style.top = `${r.top}px`;
    pill.style.right = "auto";
    pill.style.bottom = "auto";
  }, { once: true });

  return pill;
}

function nnRevealCard(overlay, id) {
  if (!id) return;
  const card = overlay.querySelector(`[data-nn-id="${CSS.escape(id)}"]`);
  if (!card) return;
  const pill = overlay.querySelector(`#${CSS.escape(`nn-minipill-${id}`)}`);
  let pillRect = null;
  if (pill && !pill.classList.contains("nn-hidden")) {
    pillRect = pill.getBoundingClientRect();
  }
  if (pill) {
    pill.classList.add("nn-hidden");
    pill.classList.remove("nn-minipill-anim--in", "nn-minipill-anim--out");
  }
  if (pillRect && pillRect.width > 0) {
    positionCardFromPillAnchor(card, pillRect);
  }
  card.classList.remove("nn-hidden");
  // eslint-disable-next-line no-unused-expressions
  card.offsetWidth;
  card.classList.add("nn-card-anim--in");
  const onCardInReveal = (e) => {
    if (e.target !== card) return;
    if (e.animationName && !/nn-mx-card-in/.test(String(e.animationName))) return;
    card.classList.remove("nn-card-anim--in");
    card.removeEventListener("animationend", onCardInReveal);
    clampToViewport(card);
  };
  card.addEventListener("animationend", onCardInReveal, { once: true });
  clampToViewport(card);
}

async function nnMinimizeFromCardEl(card) {
  if (!card || !card.dataset || !card.dataset.nnId) return;
  const { overlay } = await ensureOverlay();
  nnMinimizeCard({ overlay, card });
}

function nnMinimizeCard({ overlay, card }) {
  const id = card.dataset.nnId || "card";
  const pill = ensureMinipill(overlay, id);

  // ensure card has absolute position (so restore is "where you left it")
  if (card.style.transform && card.style.transform.includes("translate")) {
    const rect = card.getBoundingClientRect();
    card.style.transform = "none";
    card.style.left = `${rect.left}px`;
    card.style.top = `${rect.top}px`;
    card.style.right = "auto";
  }

  clampToViewport(card);

  const cardRect = card.getBoundingClientRect();
  positionMinipillByCardRect(pill, cardRect);
  pill.classList.remove("nn-minipill-anim--in", "nn-minipill-anim--out");

  let cardHideDone = false;
  const afterCardFinishesHiding = () => {
    if (cardHideDone) return;
    cardHideDone = true;
    positionMinipillByCardRect(pill, cardRect);
    pill.classList.remove("nn-hidden");
    // eslint-disable-next-line no-unused-expressions
    pill.offsetWidth;
    pill.classList.add("nn-minipill-anim--in");
    const onPillIn = (e) => {
      if (e.target !== pill) return;
      if (e.animationName && !/nn-mx-pill-in/.test(String(e.animationName))) return;
      pill.classList.remove("nn-minipill-anim--in");
      pill.removeEventListener("animationend", onPillIn);
    };
    pill.addEventListener("animationend", onPillIn);
  };

  const onTransEnd = (e) => {
    if (e.target !== card || e.propertyName !== "opacity") return;
    clearTimeout(fallbackH);
    card.removeEventListener("transitionend", onTransEnd);
    if (card.classList.contains("nn-hidden")) afterCardFinishesHiding();
  };
  const fallbackH = setTimeout(() => {
    card.removeEventListener("transitionend", onTransEnd);
    if (card.classList.contains("nn-hidden")) afterCardFinishesHiding();
  }, 400);
  card.addEventListener("transitionend", onTransEnd);
  requestAnimationFrame(() => {
    card.classList.add("nn-hidden");
  });

  let restoreBusy = false;
  pill.onclick = (ev) => {
    if (ev) ev.stopPropagation();
    if (pill.dataset.nnJustDragged === "1" || restoreBusy) return;
    if (!card.classList.contains("nn-hidden") || pill.classList.contains("nn-minipill-anim--out")) {
      return;
    }
    const pillAnchor = pill.getBoundingClientRect();
    restoreBusy = true;
    let rDone = false;
    let restoreTimer = 0;
    const finishRestore = () => {
      if (rDone) return;
      rDone = true;
      if (restoreTimer) clearTimeout(restoreTimer);
      pill.classList.remove("nn-minipill-anim--out");
      pill.classList.add("nn-hidden");
      positionCardFromPillAnchor(card, pillAnchor);
      // eslint-disable-next-line no-unused-expressions
      card.offsetWidth;
      card.classList.remove("nn-hidden");
      card.classList.add("nn-card-anim--in");
      const onCardIn2 = (e) => {
        if (e.target !== card) return;
        if (e.animationName && !/nn-mx-card-in/.test(String(e.animationName))) return;
        card.classList.remove("nn-card-anim--in");
        clampToViewport(card);
        restoreBusy = false;
      };
      card.addEventListener("animationend", onCardIn2, { once: true });
    };
    // eslint-disable-next-line no-unused-expressions
    pill.offsetWidth;
    pill.classList.add("nn-minipill-anim--out");
    const onPillOut = (e) => {
      if (e.animationName && /nn-mx-pill-out/.test(String(e.animationName)) === false) return;
      finishRestore();
    };
    pill.addEventListener("animationend", onPillOut, { once: true });
    restoreTimer = setTimeout(finishRestore, 450);
  };
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
  ensureThemeCss(shadow);

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
  } else if (anchor === "top-left") {
    card.style.top = "12px";
    card.style.left = "12px";
    card.style.right = "auto";
    card.style.transform = "none";
  } else {
    card.style.top = "50%";
    card.style.left = "50%";
    card.style.transform = "translate(-50%, -50%)";
  }

  card.innerHTML = `
    <div class="nn-header" data-nn-drag>
      <div class="nn-brand" aria-label="NexPilot">${NN_HEX_SVG_HEADER}<span class="nn-brand-text">NexPilot</span></div>
      <div class="nn-header-main">
        <div class="nn-title"></div>
      </div>
      <div class="nn-close" data-nn-close aria-label="Close">✕</div>
    </div>
    <div class="nn-body" data-nn-body></div>
  `;

  card.querySelector(".nn-title").textContent = title || "NexPilot";

  overlay.appendChild(card);

  // Wire close button (minimize to NexPilot pill)
  card.querySelector("[data-nn-close]").addEventListener("click", () => nnMinimizeCard({ overlay, card }));

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
  if (window.NexPilotUI) return;
  window.NexPilotUI = {
    createCard: nnCreateCard,
    getBody: nnGetBody,
    icons: nnIcons,
    /** Un-hide a card and hide its NexPilot pill (same as clicking the pill to restore, but callable after new content). */
    async revealCard(id) {
      const { overlay } = await ensureOverlay();
      nnRevealCard(overlay, id);
    },
    /** Minimize the card to the corner NexPilot pill (same as header ✕ in Listing Finder). */
    minimizeFromCard: nnMinimizeFromCardEl
  };
})();

