(async function () {
  "use strict";

  if (window.nnAddAgentLoaded) return;
  window.nnAddAgentLoaded = true;

  const TOOL_KEY = "tool.addAgentToNexviaSite";
  const PILL_SIZE_KEY = "option.agentChipPillSizePx";

  try {
    const enabled = self.__npToolEnabled
      ? await self.__npToolEnabled(TOOL_KEY, true)
      : (await chrome.storage.sync.get({ [TOOL_KEY]: true }))[TOOL_KEY];
    if (!enabled) return;
  } catch {
    // default enabled
  }

  function clampPill(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return 48;
    return Math.min(96, Math.max(32, Math.round(x)));
  }

  let pillSizePx = 48;
  async function refreshPillSize() {
    const v = (await chrome.storage.sync.get({ [PILL_SIZE_KEY]: 48 }))[PILL_SIZE_KEY];
    pillSizePx = clampPill(v);
  }
  await refreshPillSize();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync" || !changes[PILL_SIZE_KEY]) return;
    const raw = changes[PILL_SIZE_KEY].newValue;
    pillSizePx = clampPill(raw);
    applyPillSizeToPage();
  });

  function pillBorderPx() {
    return Math.max(1, Math.round(pillSizePx * (2 / 48)));
  }

  /** White ring: subtle zoom. Photo: stronger zoom _inside_ the ring (clipped by overflow). */
  const PILL_HOVER_EASE = "0.5s cubic-bezier(0.22, 0.9, 0.24, 1)";
  const PILL_HOVER_SCALE_RING = 1.045;
  const PILL_HOVER_SCALE_IMG = 1.13;

  function pillInsetPx() {
    return Math.max(6, Math.round(12 * (pillSizePx / 48)));
  }

  let resizeRelayoutWired = false;
  function ensureGlobalPillRelayoutOnResize() {
    if (resizeRelayoutWired) return;
    resizeRelayoutWired = true;
    window.addEventListener("resize", () => {
      requestAnimationFrame(() => {
        document.querySelectorAll(".nn-agent-contact-circle").forEach((el) => {
          const wrap = el.closest(".listings-item-wrapper");
          if (wrap) layoutPillInWrapper(wrap, el);
        });
      });
    });
  }

  /**
   * Top/left of el’s border box relative to ancestor’s padding edge, using the offsetParent
   * chain (layout box only — excludes CSS transform on el). Needed because modern cards
   * scale `.listings-item-header` on hover; getBoundingClientRect + ResizeObserver on the
   * header would fight the transition and jitter the pill.
   */
  function layoutOffsetFromAncestor(el, ancestor) {
    if (!el || !ancestor) {
      return null;
    }
    let top = 0;
    let left = 0;
    let n = el;
    while (n && n !== ancestor) {
      top += n.offsetTop;
      left += n.offsetLeft;
      n = n.offsetParent;
    }
    return n === ancestor ? { top, left } : null;
  }

  function layoutPillInWrapper(wrapper, container) {
    const header = wrapper.querySelector(".listings-item-header");
    if (!header || !container) return;
    const wr = wrapper.getBoundingClientRect();
    if (wr.width < 1 || header.offsetHeight < 1) return;
    const inset = pillInsetPx();
    const size = pillSizePx;

    const hOff = layoutOffsetFromAncestor(header, wrapper);
    let top;
    let right;
    if (hOff) {
      top = hOff.top + header.offsetHeight - size - inset;
      right = wrapper.clientWidth - (hOff.left + header.offsetWidth) + inset;
    } else {
      const hr = header.getBoundingClientRect();
      top = hr.bottom - wr.top - size - inset;
      right = wr.right - hr.right + inset;
    }
    container.style.top = `${Math.max(0, top)}px`;
    container.style.right = `${Math.max(0, right)}px`;
    container.style.bottom = "auto";
    container.style.left = "auto";
  }

  function applyPillSizeToPage() {
    const w = pillSizePx;
    const b = pillBorderPx();
    document.querySelectorAll(".nn-agent-contact-circle").forEach((el) => {
      el.style.width = `${w}px`;
      el.style.height = `${w}px`;
      const wrap = el.closest(".listings-item-wrapper");
      if (wrap) {
        layoutPillInWrapper(wrap, el);
      } else {
        const inset = pillInsetPx();
        el.style.bottom = `${inset}px`;
        el.style.right = `${inset}px`;
      }
      const ring = el.querySelector(".nn-agent-pill-ring");
      if (ring) {
        ring.style.border = `${b}px solid #fff`;
      } else {
        el.style.border = `${b}px solid #fff`;
      }
    });
  }

  let agentCache = JSON.parse(sessionStorage.getItem("nexvia_agent_cache") || "{}");
  const saveCache = () => sessionStorage.setItem("nexvia_agent_cache", JSON.stringify(agentCache));

  const NORMALIZER = (str) =>
    (str || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "");

  const showToast = (message) => {
    const id = "nn-nexvia-toast";
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = id;
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 22px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(16, 16, 16, 0.92);
      color: #fff;
      padding: 10px 16px;
      border-radius: 999px;
      z-index: 2147483000;
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      font-size: 13px;
      border: 1px solid rgba(255,255,255,0.12);
      box-shadow: 0 10px 30px rgba(0,0,0,0.65);
      transition: opacity 0.25s ease, transform 0.25s ease;
      pointer-events: none;
      opacity: 0;
    `;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = "1";
      toast.style.transform = "translateX(-50%) translateY(-2px)";
    });
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(-50%) translateY(2px)";
      setTimeout(() => toast.remove(), 300);
    }, 1800);
  };

  async function processListing(wrapper) {
    if (!wrapper || wrapper.dataset.nnAgentProcessed) return;
    wrapper.dataset.nnAgentProcessed = "true";

    const detailUrl = wrapper.href;
    if (!detailUrl) return;

    try {
      const cached = agentCache[detailUrl];
      if (cached?.email) {
        injectPortrait(wrapper, cached.imgSrc, cached.email);
        return;
      }

      const response = await fetch(detailUrl, { credentials: "include" });
      if (!response.ok) return;

      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");

      const firstName = doc.querySelector(".team-first-name")?.textContent?.trim() || "";
      const lastName = doc.querySelector(".team-last-name")?.textContent?.trim() || "";
      const imgSrc = doc.querySelector(".team-picture")?.src;

      if (!firstName || !lastName) return;

      const email = `${NORMALIZER(firstName)}.${NORMALIZER(lastName)}@nexvia.lu`;

      agentCache[detailUrl] = { email, imgSrc };
      saveCache();

      injectPortrait(wrapper, imgSrc, email);
    } catch {
      // silent tool: ignore
    }
  }

  function injectPortrait(wrapper, imgSrc, email) {
    if (wrapper.querySelector(".nn-agent-contact-circle")) return;
    const header = wrapper.querySelector(".listings-item-header");
    if (!header) return;

    const w = pillSizePx;
    const b = pillBorderPx();

    const cs = getComputedStyle(wrapper);
    if (cs.position === "static") {
      wrapper.style.position = "relative";
    }

    const container = document.createElement("div");
    container.className = "nn-agent-contact-circle";
    container.style.cssText = `
      position: absolute;
      width: ${w}px;
      height: ${w}px;
      z-index: 30;
      cursor: pointer;
    `;

    const ring = document.createElement("div");
    ring.className = "nn-agent-pill-ring";
    ring.style.cssText = `
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      border-radius: 999px;
      border: ${b}px solid #fff;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.2);
      background: #fff;
      transform-origin: center;
      will-change: transform;
      transition: transform ${PILL_HOVER_EASE};
    `;

    const imgEl = document.createElement("img");
    imgEl.src = imgSrc || "https://www.nexvia.lu/build/images/logo-nexvia-v3.png";
    imgEl.style.cssText = `
      width: 100%;
      height: 100%;
      object-fit: cover;
      pointer-events: none;
      display: block;
      transform-origin: center;
      will-change: transform;
      transition: transform ${PILL_HOVER_EASE};
    `;
    ring.appendChild(imgEl);
    container.appendChild(ring);

    const setHover = (on) => {
      if (on) {
        ring.style.transform = `scale(${PILL_HOVER_SCALE_RING})`;
        imgEl.style.transform = `scale(${PILL_HOVER_SCALE_IMG})`;
      } else {
        ring.style.transform = "scale(1)";
        imgEl.style.transform = "scale(1)";
      }
    };

    wrapper.appendChild(container);

    let relayoutRaf = 0;
    const scheduleRelayout = () => {
      if (relayoutRaf) {
        cancelAnimationFrame(relayoutRaf);
      }
      relayoutRaf = requestAnimationFrame(() => {
        relayoutRaf = 0;
        layoutPillInWrapper(wrapper, container);
      });
    };
    scheduleRelayout();
    requestAnimationFrame(scheduleRelayout);

    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => scheduleRelayout());
      ro.observe(wrapper);
    }
    ensureGlobalPillRelayoutOnResize();

    container.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(email).then(() => showToast(`Copied: ${email}`));
      ring.style.transform = "scale(0.9)";
      imgEl.style.transform = "scale(1.02)";
      setTimeout(() => {
        if (container.matches(":hover")) {
          setHover(true);
        } else {
          ring.style.transform = "scale(1)";
          imgEl.style.transform = "scale(1)";
        }
      }, 160);
    });

    container.addEventListener("mouseenter", () => setHover(true));
    container.addEventListener("mouseleave", () => setHover(false));
  }

  function runMain() {
    const separator = document.querySelector(".unavailablePropertiesSeparatorWrapper");
    const allWrappers = Array.from(document.querySelectorAll("a.listings-item-wrapper"));

    const activeWrappers = allWrappers.filter((wrapper) => {
      if (!separator) return true;
      return wrapper.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING;
    });

    activeWrappers.forEach(processListing);
  }

  runMain();

  const observer = new MutationObserver(() => runMain());
  const waitForBody = setInterval(() => {
    if (!document.body) return;
    clearInterval(waitForBody);
    observer.observe(document.body, { childList: true, subtree: true });
  }, 50);
})();
