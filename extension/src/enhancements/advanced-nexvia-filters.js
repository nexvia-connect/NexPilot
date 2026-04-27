/**
 * Advanced Nexvia filters — chip bar, Luxembourg-City neighbourhood picker, sort (date/price), bedroom/surface/price filters for Nexvia buy listings.
 */
(function () {
  "use strict";

  if (window.nnAdvancedNexviaFiltersLoaded) return;
  window.nnAdvancedNexviaFiltersLoaded = true;

  const TOOL_KEY = "tool.advancedNexviaFilters";
  const ENABLE_SORTING_KEY = "option.advancedNexviaFilters.enableSorting";

  (async function boot() {
    try {
      const ok = self.__npToolEnabled
        ? await self.__npToolEnabled(TOOL_KEY, true)
        : (await chrome.storage.sync.get({ [TOOL_KEY]: true }))[TOOL_KEY];
      if (ok === false) return;
    } catch {
      // default on
    }

    let sortingEnabled = true;
    try {
      const sr = await chrome.storage.sync.get({ [ENABLE_SORTING_KEY]: true });
      sortingEnabled = sr[ENABLE_SORTING_KEY] !== false;
    } catch {
      sortingEnabled = true;
    }

    let toolModernPropertyCards = true;
    try {
      toolModernPropertyCards = self.__npToolEnabled
        ? await self.__npToolEnabled("tool.modernPropertyCards", true)
        : (await chrome.storage.sync.get({ "tool.modernPropertyCards": true }))["tool.modernPropertyCards"] !==
          false;
    } catch {
      toolModernPropertyCards = true;
    }

    /** From `luxembourg-city-neighbourhood-groups.bundle.js` (manifest order). Not fetch — page CSP often blocks extension-origin fetch. */
    const g = typeof globalThis !== "undefined" ? globalThis : window;
    const luxCityHoodSpec =
      g.nnLuxCityNeighbourhoodGroupSpec &&
      Array.isArray(g.nnLuxCityNeighbourhoodGroupSpec.groups) &&
      g.nnLuxCityNeighbourhoodGroupSpec.groups.length
        ? g.nnLuxCityNeighbourhoodGroupSpec
        : null;

    run(luxCityHoodSpec, sortingEnabled, toolModernPropertyCards);
  })();

  /** Normalizes text for alias lookup (Luxembourg-City hood grouping DB). */
  function normalizeLuxHoodAliasToken(s) {
    if (s == null || s === "") {
      return "";
    }
    return String(s).trim().replace(/\s+/g, " ").toLowerCase();
  }

  /**
   * Builds lookup maps from the bundle global (`nnLuxCityNeighbourhoodGroupSpec`).
   * @param { { groups?: Array<{ label?: string, aliases?: string[] }> } | null } spec
   */
  function buildLuxCityHoodMaps(spec) {
    const aliasToLabel = new Map();
    const groupOrder = [];
    const groups = spec && Array.isArray(spec.groups) ? spec.groups : [];
    for (const g of groups) {
      const label = g && g.label != null ? String(g.label).trim() : "";
      if (!label) {
        continue;
      }
      groupOrder.push(label);
      const rowTokens = new Set();
      const parts = [label];
      if (Array.isArray(g.aliases)) {
        for (const a of g.aliases) {
          if (a != null && String(a).trim() !== "") {
            parts.push(String(a).trim());
          }
        }
      }
      for (const a of parts) {
        const k = normalizeLuxHoodAliasToken(a);
        if (!k || rowTokens.has(k)) {
          continue;
        }
        rowTokens.add(k);
        aliasToLabel.set(k, label);
      }
    }
    return { aliasToLabel, groupOrder };
  }

  /** Accent-fold + lowercase for matching listing locality strings to the outside-municipality DB. */
  function foldOutsideMuniToken(s) {
    const raw = String(s)
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    return normalizeLuxHoodAliasToken(raw);
  }

  /**
   * @param { { regionOrder?: string[], regionLabels?: Record<string, string>, rows?: [string, string][] } | null | undefined } spec
   */
  function buildOutsideMuniRegionMaps(spec) {
    const normToRegion = new Map();
    const regionOrder =
      spec && Array.isArray(spec.regionOrder) && spec.regionOrder.length
        ? spec.regionOrder.slice()
        : ["C", "S", "E", "W", "N"];
    const defaults = { C: "Centre", S: "South", E: "East", W: "West", N: "North" };
    const regionLabels = Object.assign(
      {},
      defaults,
      spec && spec.regionLabels && typeof spec.regionLabels === "object" ? spec.regionLabels : {}
    );
    const rows = spec && Array.isArray(spec.rows) ? spec.rows : [];
    for (const row of rows) {
      if (!row || row.length < 2) {
        continue;
      }
      const name = String(row[0]).trim();
      const reg = String(row[1]).trim();
      if (!name || !reg) {
        continue;
      }
      const k = foldOutsideMuniToken(name);
      if (!normToRegion.has(k)) {
        normToRegion.set(k, reg);
      }
    }
    return { normToRegion, regionOrder, regionLabels };
  }

  /**
   * Resolves listing locality to region id: full string first, then first `(...)` parenthetical
   * (e.g. `Elvange (Schengen)` → try `schengen` if full string misses).
   */
  function getOutsideKeyRegionId(rawKey, normToRegion) {
    if (rawKey == null || rawKey === "") {
      return null;
    }
    const full = foldOutsideMuniToken(rawKey);
    const direct = normToRegion.get(full);
    if (direct) {
      return direct;
    }
    const m = String(rawKey).match(/\(([^)]+)\)/);
    if (m) {
      const inner = m[1].trim();
      if (inner) {
        const innerHit = normToRegion.get(foldOutsideMuniToken(inner));
        if (innerHit) {
          return innerHit;
        }
      }
    }
    return null;
  }

  function addStyles(css) {
    const s = document.createElement("style");
    s.setAttribute("data-nnpilot", "advanced-nexvia-filters");
    s.textContent = css;
    document.head.appendChild(s);
  }

  /**
   * @param { { groups?: Array<{ label?: string, aliases?: string[] }> } | null } luxCityHoodSpec
   *        From `luxembourg-city-neighbourhood-groups.bundle.js`; null only if that script failed to run.
   */
  function run(luxCityHoodSpec, sortingEnabled, toolModernPropertyCards = true) {
    const fontLink = document.createElement("link");
    fontLink.rel = "stylesheet";
    fontLink.href =
      "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20,300,1,0";
    document.head.appendChild(fontLink);

    addStyles(`
        .modern-filters-container { padding: 5px 0 20px 0; font-family: inherit; }
        .modern-filters-title {
            display: block; font-size: 12px; font-weight: 600; color: #a1a1aa; text-transform: uppercase;
            letter-spacing: 0.05em; margin-bottom: 6px;
        }
        .modern-filters-counters-row {
            display: flex; flex-direction: row; align-items: flex-start; justify-content: flex-start;
            gap: 10px; margin: 0; padding: 0; flex-wrap: wrap;
        }
        .modern-filters-counters-row .modern-vertical-divider--counters {
            margin: 0 4px; margin-top: 3rem; flex-shrink: 0; align-self: flex-start;
        }
        .counter-section {
            display: flex; flex-direction: column; flex: 0 0 auto; min-width: 0;
        }
        .counter-section .modern-filters-title { margin-bottom: 6px; }
        .nnpilot-advanced-filters__details { margin-top: 8px; border: 0; }
        .nnpilot-advanced-filters__summary {
            list-style: none; display: flex; flex-direction: row; align-items: center; justify-content: flex-start; gap: 8px;
            padding: 8px 2px; cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
            color: #a1a1aa; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
            border-radius: 8px; transition: color 0.3s, background 0.35s cubic-bezier(0.25,1,0.5,1);
        }
        .nnpilot-advanced-filters__summary::-webkit-details-marker { display: none; }
        .nnpilot-advanced-filters__summary::marker { content: none; }
        .nnpilot-advanced-filters__summary:hover { color: #71717a; background: rgba(0,0,0,0.03); }
        .nnpilot-advanced-filters__chev {
            font-size: 20px; line-height: 1; color: #a1a1aa; flex-shrink: 0;
            transition: transform 0.45s cubic-bezier(0.4,0,0.2,1), color 0.3s;
        }
        .nnpilot-advanced-filters__details[open] .nnpilot-advanced-filters__chev { transform: rotate(180deg); }
        .nnpilot-advanced-filters__body { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.45s cubic-bezier(0.4,0,0.2,1); }
        .nnpilot-advanced-filters__details[open] .nnpilot-advanced-filters__body { grid-template-rows: 1fr; }
        .nnpilot-advanced-filters__sizer { min-height: 0; }
        .nnpilot-advanced-filters__inner { min-height: 0; overflow: hidden; padding: 0; }
        .nnpilot-advanced-filters__details[open] .nnpilot-advanced-filters__inner { padding-top: 4px; }
        .modern-filters-counters-row.is-filter-muted { pointer-events: auto; transition: opacity 0.3s, filter 0.3s; }
        .modern-chip-label.is-filter-muted {
            pointer-events: auto; cursor: pointer; transition: opacity 0.3s, filter 0.3s;
        }
        .modern-chip-label.is-filter-muted { opacity: 0.5; filter: grayscale(0.2); }
        .modern-chip-label.is-filter-muted:hover { color: #71717a; border-color: #e4e4e7; background: #fff; box-shadow: none; }
        .modern-chip-label.is-filter-muted.is-checked:hover { background: #333; border-color: #333; color: #fff; }
        .modern-chip-label.is-filter-muted:active { transform: none; }
        .modern-filters-counters-row.is-filter-muted { opacity: 0.5; }
        .modern-filters-counters-row.is-filter-muted .counter-val { cursor: pointer; }
        .modern-filters-counters-row.is-filter-muted .counter-btn:not(.is-disabled) { cursor: pointer; }
        .modern-filters-chips { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .nnpilot-type-pair-wrap {
            display: inline-flex; flex-direction: row; align-items: center; flex-wrap: wrap; gap: 10px;
        }
        /* Match Luxembourg-City / Outside: dim the composite wrapper, not only each chip (same stacking as lux-hood-wrap). */
        .nnpilot-type-pair-wrap:has(.modern-chip-label.is-filter-muted) {
            opacity: 0.5;
            filter: grayscale(0.2);
            pointer-events: auto;
            cursor: pointer;
            transition: opacity 0.3s, filter 0.3s;
        }
        /* One dimming layer: wrapper opacity + per-label is-filter-muted would stack (~0.25) and part-chevron UIs would look wrong. */
        .nnpilot-type-pair-wrap:has(.modern-chip-label.is-filter-muted) .modern-chip-label.is-filter-muted,
        .nnpilot-lux-hood-wrap:has(.modern-chip-label.is-filter-muted) .modern-chip-label.is-filter-muted,
        .nnpilot-out-hood-wrap:has(.modern-chip-label.is-filter-muted) .modern-chip-label.is-filter-muted {
            opacity: 1;
            filter: none;
        }
        .nnpilot-listings-sort-bar {
            display: flex; flex-direction: row; align-items: center; justify-content: space-between; gap: 12px;
            width: 100%; box-sizing: border-box; margin: 0; padding: 0 0 6px; position: relative; z-index: 2;
        }
        .nnpilot-listings-sort-bar[hidden] { display: none !important; }
        .nnpilot-listings-toolbar-left { display: flex; align-items: center; flex: 0 1 auto; min-width: 0; }
        .nnpilot-listings-sort-wrap { flex: 0 0 auto; }
        .nnpilot-listings-sort-wrap { position: relative; display: inline-block; }
        /* display:inline-block above overrides the hidden attribute; keep sort UI hideable from settings. */
        .nnpilot-listings-sort-wrap[hidden] { display: none !important; }
        .nnpilot-listings-sort__btn {
            display: inline-flex; flex-direction: row; align-items: center; justify-content: flex-end; gap: 4px;
            margin: 0; padding: 5px 8px 5px 6px; min-height: 32px; border: none; background: transparent; color: #3f3f46;
            border-radius: 10px; font: inherit; font-size: 12px; font-weight: 500; letter-spacing: 0.01em; white-space: nowrap; cursor: pointer;
            -webkit-tap-highlight-color: transparent; transition: background 0.2s, color 0.2s;
        }
        .nnpilot-listings-sort__btn:hover, .nnpilot-listings-sort__btn[aria-expanded="true"] { background: rgba(0,0,0,0.06); color: #18181b; }
        .nnpilot-listings-sort__icon--sort { font-size: 18px !important; line-height: 1; color: #52525b; width: 1.25em; }
        .nnpilot-listings-sort__icon--arr { font-size: 20px !important; color: #a1a1aa; line-height: 1; margin-left: -1px; transition: transform 0.2s; }
        .nnpilot-listings-sort__btn[aria-expanded="true"] .nnpilot-listings-sort__icon--arr { transform: rotate(180deg); color: #71717a; }
        .nnpilot-listings-sort__line {
            display: inline-flex; flex-direction: row; align-items: baseline; gap: 6px; flex-wrap: wrap;
            text-align: right;
        }
        .nnpilot-listings-sort__label {
            font-weight: 300; color: #71717a; font-size: 12px; letter-spacing: 0.01em;
        }
        .nnpilot-listings-sort__value {
            font-weight: 700; color: #333; font-size: 12px; letter-spacing: -0.02em;
        }
        .nnpilot-listings-sort__menu {
            position: absolute; right: 0; top: 100%; margin-top: 6px; min-width: min(100vw - 1.5rem, 20rem);
            list-style: none; margin: 0; padding: 6px; background: #fff; border: 1px solid #e4e4e7; border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.04); z-index: 30;
        }
        .nnpilot-listings-sort__menu[hidden] { display: none !important; }
        .nnpilot-listings-sort__opt {
            display: block; width: 100%; text-align: left; margin: 0; padding: 10px 12px; border: none; border-radius: 8px;
            background: none; color: #3f3f46; font: inherit; font-size: 13px; font-weight: 500; cursor: pointer; line-height: 1.35;
            -webkit-tap-highlight-color: transparent; transition: background 0.15s, color 0.15s;
        }
        .nnpilot-listings-sort__opt:hover { background: #f4f4f5; }
        .nnpilot-listings-sort__opt.is-active { background: #f4f4f5; color: #18181b; font-weight: 600; }
        .nnpilot-lux-hood-wrap, .nnpilot-out-hood-wrap {
            position: relative; display: inline-flex; flex-direction: row; align-items: stretch;
            flex: 0 0 auto; vertical-align: middle; height: 36px; box-sizing: border-box;
            border-radius: 9999px; border: 1px solid #e4e4e7; background: #fff; color: #71717a;
            transition: background 0.3s cubic-bezier(0.25, 1, 0.5, 1), border-color 0.3s cubic-bezier(0.25, 1, 0.5, 1),
                color 0.3s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.3s cubic-bezier(0.25, 1, 0.5, 1);
        }
        .nnpilot-lux-hood-wrap:has(.modern-chip-label.is-checked), .nnpilot-out-hood-wrap:has(.modern-chip-label.is-checked) {
            background: #333; border-color: #333; color: #fff;
            box-shadow: 0 4px 14px rgba(51, 51, 51, 0.2);
        }
        .nnpilot-lux-hood-wrap:has(.modern-chip-label.is-checked:not(.is-locked):hover),
        .nnpilot-out-hood-wrap:has(.modern-chip-label.is-checked:not(.is-locked):hover) {
            background: #4a4a4a; border-color: #4a4a4a;
        }
        .nnpilot-lux-hood-wrap:has(.modern-chip-label:not(.is-checked):not(.is-checked-exc):not(.is-locked):hover),
        .nnpilot-out-hood-wrap:has(.modern-chip-label:not(.is-checked):not(.is-checked-exc):not(.is-locked):hover) {
            background: #fafafa; border-color: #d4d4d8; color: #333;
        }
        .nnpilot-lux-hood-wrap:has(.modern-chip-label.is-filter-muted), .nnpilot-out-hood-wrap:has(.modern-chip-label.is-filter-muted) {
            opacity: 0.5; filter: grayscale(0.2);
        }
        .nnpilot-lux-hood-wrap .modern-chip-label, .nnpilot-out-hood-wrap .modern-chip-label {
            position: relative; display: inline-flex; align-items: center; height: 100%; box-sizing: border-box;
            gap: 8px; cursor: pointer; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
            font-size: 14px; font-weight: 500; color: inherit; background: transparent !important; padding: 0 2px 0 18px;
            border: none !important; border-radius: 9999px 0 0 9999px; box-shadow: none !important; margin: 0;
            transition: color 0.3s cubic-bezier(0.25, 1, 0.5, 1); user-select: none; letter-spacing: -0.01em;
        }
        .nnpilot-lux-hood__toggle {
            display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
            align-self: stretch; min-width: 36px; margin-left: 10px; padding-right: 10px; padding-left: 8px;
            padding-top: 0; padding-bottom: 0; box-sizing: border-box;
            border: none; border-radius: 0 9999px 9999px 0; border-left: 1px solid rgba(0, 0, 0, 0.1);
            background: rgba(0, 0, 0, 0.04); color: inherit; cursor: pointer;
            -webkit-tap-highlight-color: transparent;
            transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
        }
        .nnpilot-lux-hood-wrap:has(.modern-chip-label.is-checked) .nnpilot-lux-hood__toggle,
        .nnpilot-out-hood-wrap:has(.modern-chip-label.is-checked) .nnpilot-lux-hood__toggle {
            border-left-color: rgba(255, 255, 255, 0.22);
            background: rgba(255, 255, 255, 0.08);
        }
        .nnpilot-lux-hood__toggle:hover:not(:disabled) {
            background: rgba(0, 0, 0, 0.07);
        }
        .nnpilot-lux-hood-wrap:has(.modern-chip-label.is-checked) .nnpilot-lux-hood__toggle:hover:not(:disabled),
        .nnpilot-out-hood-wrap:has(.modern-chip-label.is-checked) .nnpilot-lux-hood__toggle:hover:not(:disabled) {
            background: rgba(255, 255, 255, 0.14);
        }
        .nnpilot-lux-hood__toggle .material-symbols-outlined {
            font-size: 18px !important; line-height: 1; font-weight: 400;
            color: currentColor; opacity: 0.9; transition: transform 0.2s ease, opacity 0.2s ease;
        }
        .nnpilot-lux-hood__toggle:hover:not(:disabled) .material-symbols-outlined { opacity: 1; }
        .nnpilot-lux-hood__toggle[aria-expanded="true"] .material-symbols-outlined { transform: rotate(180deg); }
        .nnpilot-lux-hood__toggle:disabled {
            opacity: 0.4; cursor: not-allowed;
            background: rgba(0, 0, 0, 0.02); border-left-color: rgba(0, 0, 0, 0.06);
        }
        .nnpilot-lux-hood-wrap:has(.modern-chip-label.is-checked) .nnpilot-lux-hood__toggle:disabled,
        .nnpilot-out-hood-wrap:has(.modern-chip-label.is-checked) .nnpilot-lux-hood__toggle:disabled {
            background: rgba(255, 255, 255, 0.04); border-left-color: rgba(255, 255, 255, 0.12);
        }
        .nnpilot-lux-hood__menu {
            position: absolute; left: 50%; top: calc(100% + 6px); transform: translateX(-50%);
            width: min(100vw - 1rem, 88rem); min-width: min(100vw - 1rem, 38rem); max-width: calc(100vw - 1rem);
            max-height: min(78vh, 30rem); overflow: hidden; display: flex; flex-direction: column;
            list-style: none; margin: 0; padding: 0; background: #fff; border: 1px solid #e4e4e7; border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.04); z-index: 30;
            box-sizing: border-box;
        }
        .nnpilot-lux-hood__menu[hidden] { display: none !important; }
        .nnpilot-lux-hood__menu .nnpilot-lux-hood__row {
            display: flex; flex-direction: row; align-items: flex-start; gap: 10px; margin: 0; padding: 10px 12px;
            border-radius: 8px; cursor: pointer; font: inherit; font-size: 13px; font-weight: 400; color: #3f3f46;
            line-height: 1.35; user-select: none; -webkit-tap-highlight-color: transparent; transition: background 0.12s;
        }
        .nnpilot-lux-hood__header {
            flex-shrink: 0; padding: 6px 0; background: #fafafa;
        }
        .nnpilot-lux-hood__header .nnpilot-lux-hood__row {
            margin: 0; padding: 5px 10px; border-radius: 8px; font-weight: 700; font-size: 13px; color: #18181b;
            align-items: center;
        }
        .nnpilot-lux-hood__list {
            list-style: none; margin: 0; padding: 0; flex: 1; min-height: 0; overflow-x: hidden; overflow-y: auto;
            display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
            align-content: start; gap: 0;
        }
        .nnpilot-lux-hood__item {
            margin: 0; padding: 0; border-bottom: 1px solid #ececf0; border-right: 1px solid #ececf0;
            box-sizing: border-box; min-width: 0;
        }
        .nnpilot-lux-hood__item .nnpilot-lux-hood__row {
            margin: 0; min-height: 36px; padding: 5px 10px; border-radius: 0; align-items: center;
            font-weight: 300; color: #52525b;
        }
        .nnpilot-lux-hood__item .nnpilot-lux-hood__row:hover { background: #f4f4f5; }
        .nnpilot-lux-hood__menu .nnpilot-lux-hood__item .nnpilot-lux-hood__row > span {
            font-weight: 300 !important;
            color: #52525b !important;
        }
        .nnpilot-lux-hood__header .nnpilot-lux-hood__row > span {
            font-weight: 700 !important;
            color: #18181b !important;
        }
        .nnpilot-out-hood__region-head .nnpilot-lux-hood__row > span {
            font-weight: 700 !important;
            color: #18181b !important;
        }
        .nnpilot-lux-hood__menu .nnpilot-out-hood__list--grouped {
            display: flex; flex-direction: column; grid-template-columns: unset; gap: 0;
        }
        .nnpilot-out-hood__region-shell {
            list-style: none; margin: 0; padding: 0;
        }
        .nnpilot-out-hood__region-head {
            display: flex; flex-direction: row; align-items: stretch; flex-shrink: 0; padding: 0;
            background: #fff; border-bottom: 1px solid #ececf0;
        }
        .nnpilot-out-hood__region-head .nnpilot-lux-hood__row {
            flex: 1; min-width: 0; margin: 0; padding: 5px 10px; border-radius: 0; font-weight: 700; font-size: 13px;
            color: #18181b; letter-spacing: 0.02em; background: #fff;
            display: flex; flex-direction: row; align-items: center; align-self: stretch; min-height: 36px;
        }
        .nnpilot-out-hood__region-head .nnpilot-lux-hood__row input[type="checkbox"] { margin-top: 0; flex-shrink: 0; }
        .nnpilot-out-hood__region-toggle {
            flex-shrink: 0; width: 40px; min-height: 36px; box-sizing: border-box;
            margin: 0; padding: 0; border: none; border-left: 1px solid #ececf0; background: #fff;
            cursor: pointer; color: #71717a; display: inline-flex; align-items: center; justify-content: center;
            -webkit-tap-highlight-color: transparent; transition: background 0.12s, color 0.12s;
        }
        .nnpilot-out-hood__region-toggle:hover { background: #fafafa; color: #18181b; }
        .nnpilot-out-hood__region-toggle .material-symbols-outlined {
            font-size: 22px !important; line-height: 1; font-weight: 400;
            display: inline-block; transform-origin: center;
            transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .nnpilot-out-hood__region-toggle[aria-expanded="true"] .material-symbols-outlined {
            transform: rotate(180deg);
        }
        .nnpilot-out-hood__region-grid {
            flex: 0 1 auto; min-height: 0; overflow: visible;
        }
        .nnpilot-out-hood__region-grid.is-collapsed { display: none !important; }
        .nnpilot-lux-hood__header .nnpilot-lux-hood__row:hover { background: #f4f4f5; }
        .nnpilot-lux-hood__header .nnpilot-lux-hood__row input[type="checkbox"] { margin-top: 0; }
        .nnpilot-out-hood__search {
            flex-shrink: 0; padding: 0; border-bottom: none; background: #fafafa;
            box-sizing: border-box;
        }
        .nnpilot-out-hood__search-input {
            display: block; width: 100%; box-sizing: border-box; margin: 0; padding: 9px 12px 9px 14px;
            border-left: none; border-right: none; border-top: 1px solid #ececf0; border-bottom: 1px solid #ececf0;
            border-radius: 0; background: #fff; color: #18181b;
            font: inherit; font-size: 13px; font-weight: 400; letter-spacing: 0.01em;
            box-shadow: 0 1px 2px rgba(0,0,0,0.04); transition: border-color 0.2s, box-shadow 0.2s;
            -webkit-tap-highlight-color: transparent;
        }
        .nnpilot-out-hood__search-input::placeholder {
            color: #a1a1aa; font-weight: 400; font-size: 13px;
        }
        .nnpilot-out-hood__search-input:hover {
            border-top-color: #e4e4e7; border-bottom-color: #e4e4e7;
        }
        .nnpilot-out-hood__search-input:focus {
            outline: none; border-top-color: #d4d4d8; border-bottom-color: #d4d4d8;
            box-shadow: 0 0 0 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.05);
        }
        .nnpilot-lux-hood__menu .nnpilot-lux-hood__row input[type="checkbox"] {
            margin: 2px 0 0 0; flex-shrink: 0; width: 15px; height: 15px; cursor: pointer; accent-color: #333;
        }
        .nnpilot-lux-hood__item .nnpilot-lux-hood__row input[type="checkbox"] { margin-top: 0; }
        .nnpilot-lux-hood__menu .nnpilot-lux-hood__row span { flex: 1; min-width: 0; }
        .modern-vertical-divider {
            width: 1px; height: 24px; background: #d4d4d8; margin: 0 4px; flex-shrink: 0;
        }
        .modern-chip-label {
            position: relative; display: inline-flex; align-items: center; height: 36px; box-sizing: border-box;
            gap: 8px; cursor: pointer; font-family: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', sans-serif;
            font-size: 14px; font-weight: 500; color: #71717a; background: #fff; padding: 0 18px; border-radius: 9999px;
            border: 1px solid #e4e4e7; transition: all 0.3s cubic-bezier(0.25, 1, 0.5, 1); user-select: none; letter-spacing: -0.01em;
        }
        .modern-chip-label:not(.is-locked):active { transform: scale(0.97); box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: all 0.1s ease; }
        .modern-chip-label:not(.is-checked):not(.is-checked-exc):not(.is-locked):hover { color: #333; border-color: #d4d4d8; background: #fafafa; }
        .modern-chip-label.is-checked, .modern-chip-label.is-checked-exc {
            background: #333; color: #fff; border-color: #333; box-shadow: 0 4px 14px rgba(51, 51, 51, 0.2);
        }
        .modern-chip-label.is-checked:not(.is-locked):hover, .modern-chip-label.is-checked-exc:not(.is-locked):hover { background: #4a4a4a; border-color: #4a4a4a; }
        .modern-chip-label input[type="checkbox"] { display: none; }
        .modern-chip-label.is-locked { cursor: not-allowed; }
        .status-icon { width: 16px; height: 16px; stroke: currentColor; stroke-width: 1.5; fill: none; display: inline-block; flex-shrink: 0; transition: transform 0.3s cubic-bezier(0.25,1,0.5,1); }
        .modern-chip-label:not(.is-locked):hover .status-icon { transform: scale(1.05); }
        .status-icon .bg-circle { transition: all 0.3s cubic-bezier(0.25,1,0.5,1); }
        .status-icon .check-mark { stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 14; stroke-dashoffset: 14; transition: stroke-dashoffset 0.4s cubic-bezier(0.25,1,0.5,1); }
        .modern-chip-label.is-checked .status-icon .bg-circle { fill: #fff; stroke: #fff; }
        .modern-chip-label.is-checked .status-icon .check-mark { stroke-dashoffset: 0; stroke: #333; stroke-width: 2.5; }
        .modern-chip-label .material-symbols-outlined { font-size: 18px; display: inline-block; transform-origin: center; }
        .modern-chip-label:has(#nnpilot-chk-exc):not(.is-checked-exc) .material-symbols-outlined {
            color: currentColor;
            transition: color 0.6s cubic-bezier(0.22, 0.12, 0.14, 1), transform 0.5s cubic-bezier(0.25,1,0.5,1);
        }
        .modern-chip-label:has(#nnpilot-chk-exc):not(.is-checked-exc):hover .material-symbols-outlined { color: #d4af37; transform: rotate(33deg) scale(1.1); }
        @keyframes nnpilot-filter-spin { 0%{transform:rotate(0) scale(1);} 50%{transform:rotate(180deg) scale(1.2);} 100%{transform:rotate(360deg) scale(1);} }
        .modern-chip-label.is-checked-exc .material-symbols-outlined { color: #d4af37; transition: color 0.2s, transform 0.2s; animation: nnpilot-filter-spin 0.65s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .modern-counter-chip {
            display: inline-flex; align-items: stretch; height: 36px; box-sizing: border-box; background: #fff;
            border: 1px solid #e4e4e7; border-radius: 9999px; overflow: hidden; user-select: none; box-shadow: 0 1px 2px rgba(0,0,0,0.02); transition: border-color 0.2s;
        }
        .modern-counter-chip:hover { border-color: #d4d4d8; }
        .counter-btn { cursor: pointer; padding: 0 14px; font-weight: 600; font-size: 16px; line-height: 1; background: #444; color: #fff; transition: background 0.2s, color 0.2s; display: flex; align-items: center; justify-content: center; -webkit-tap-highlight-color: transparent; }
        .counter-btn:not(.is-disabled):hover { background: #555; }
        .counter-btn:not(.is-disabled):active { background: #2a2a2a; }
        .counter-btn.is-disabled { background: #333; color: #999; pointer-events: auto; cursor: not-allowed; }
        .counter-val {
            display: flex; align-items: center; justify-content: center; text-align: center; color: #333; background: #fff;
            box-sizing: border-box; border-left: 1px solid #e4e4e7; border-right: 1px solid #e4e4e7; font-weight: 600;
            width: 7.5rem; min-width: 7.5rem; max-width: 7.5rem; flex: 0 0 7.5rem;
            font-size: 14px; font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; cursor: default;
        }
        .counter-val--sqm {
            width: 9.25rem; min-width: 9.25rem; max-width: 9.25rem; flex: 0 0 9.25rem;
            padding: 0 8px; gap: 5px; box-sizing: border-box;
        }
        .counter-val--sqm .counter-val__num { color: #333; font-weight: 700; }
        .counter-val--sqm .counter-val__unit { color: #6b7280; font-weight: 500; }
        .nnpilot-advanced-filters__inner-foot { display: flex; justify-content: center; width: 100%; margin-top: 20px; }
        .nnpilot-advanced-filters__reset {
            display: inline-flex; align-items: center; justify-content: center; gap: 4px; margin: 0; padding: 4px 10px;
            font: inherit; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
            color: #a1a1aa; background: rgba(0,0,0,0.02); border: 1px solid #e4e4e7; border-radius: 6px; cursor: pointer;
            -webkit-tap-highlight-color: transparent; transition: color 0.2s, background 0.2s, border-color 0.2s, box-shadow 0.2s, opacity 0.2s;
        }
        .nnpilot-advanced-filters__reset:hover:not(:disabled) { color: #52525b; background: #fff; border-color: #d4d4d8; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
        .nnpilot-advanced-filters__reset:disabled {
            opacity: 0.45; cursor: not-allowed; color: #c4c4c8; background: rgba(0,0,0,0.02); box-shadow: none; border-color: #ececf0;
        }
        .nnpilot-advanced-filters__reset:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 2px; }
        .modern-filters-counters-row .nnpilot-price-block {
            margin: 0; padding: 0; border: 0; box-sizing: border-box; flex: 1 1 0%; min-width: 0;
        }
        .modern-filters-counters-row .nnpilot-price-block .modern-filters-title { margin-bottom: 6px; }
        .nnpilot-price-rail { position: relative; width: 100%; margin-top: -5px; padding: 0 17px; box-sizing: border-box; user-select: none; -webkit-tap-highlight-color: transparent; }
        .nnpilot-price-rail__wrap { position: relative; width: 100%; min-height: 32px; display: block; }
        .nnpilot-price-rail__track {
            position: absolute; left: 0; right: 0; top: 50%; height: 5px; margin-top: -2.5px;
            background: #e4e4e7; border-radius: 99px; pointer-events: auto; cursor: pointer; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.04);
            overflow: hidden;
        }
        .nnpilot-price-rail__fill {
            position: absolute; top: 0; left: 0; height: 100%; width: 0%;
            background: #333; border-radius: 99px; pointer-events: none;
        }
        .nnpilot-price-rail__thumb {
            position: absolute; top: 50%; left: 0; width: 20px; height: 20px; margin: -10px 0 0; transform: translateX(-50%);
            padding: 0; border: 1px solid #d4d4d8; border-radius: 9999px; background: #fff;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
            cursor: grab; z-index: 2; -webkit-tap-highlight-color: transparent; transition: box-shadow 0.2s, border-color 0.2s, transform 0.15s;
        }
        .nnpilot-price-rail__thumb--max { z-index: 3; }
        .nnpilot-price-rail__thumb:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08); border-color: #a1a1aa; }
        .nnpilot-price-rail__thumb:active, .nnpilot-price-rail__thumb.nnpilot-price-rail__thumb--drag {
            cursor: grabbing; transform: translateX(-50%) scale(1.08);
        }
        .nnpilot-price-rail__thumb:focus { outline: none; }
        .nnpilot-price-rail__thumb:focus-visible { outline: 2px solid #71717a; outline-offset: 2px; }
        .nnpilot-price-rail__axis {
            position: relative; width: 100%; min-height: 2.25rem; margin-top: 0; font-feature-settings: "tnum" 1;
        }
        .nnpilot-price-rail__label {
            position: absolute; top: 0; left: 0; transform: translateX(-50%);
            display: flex; flex-direction: column; align-items: center; text-align: center; pointer-events: none;
        }
        .nnpilot-price-rail__value { font-size: 12px; font-weight: 600; color: #333; line-height: 1.2; }
        .nnpilot-price-rail__tag { font-size: 9px; font-weight: 500; color: #a1a1aa; line-height: 1.15; margin-top: 0; }
        .nnpilot-price-block.is-filter-muted { opacity: 0.5; pointer-events: auto; }
        .nnpilot-price-block.is-filter-muted .nnpilot-price-rail__track { cursor: pointer; }
    `);

    const oldNav = document.querySelector("nav.title-tabs");
    if (!oldNav) return;
    oldNav.style.display = "none";

    const { aliasToLabel: luxCityAliasToLabel, groupOrder: luxCityGroupOrder } =
      buildLuxCityHoodMaps(luxCityHoodSpec);

    const npGlobal = typeof globalThis !== "undefined" ? globalThis : window;
    const outsideMuniMaps = buildOutsideMuniRegionMaps(npGlobal.nnOutsideMunicipalityRegionSpec);
    const outsideMuniNormToRegion = outsideMuniMaps.normToRegion;
    const outsideMuniRegionOrder = outsideMuniMaps.regionOrder;
    const outsideMuniRegionLabels = outsideMuniMaps.regionLabels;

    function sortOutsideKeysByRegion(keys) {
      const order = outsideMuniRegionOrder;
      const rank = (k) => {
        const rid = getOutsideKeyRegionId(k, outsideMuniNormToRegion);
        if (rid == null) {
          return order.length + 1;
        }
        const i = order.indexOf(rid);
        return i === -1 ? order.length : i;
      };
      return keys.slice().sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) {
          return ra - rb;
        }
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      });
    }

    /** In-memory only. Full reload re-inits from URL. Back/forward cache restore runs resetAllFiltersToInitial (pageshow persisted). */
    let bedCount = 0;
    let sqmCount = 10;
    let listingSortMode = "date";
    let listingOrderSeq = 0;

    /** Luxembourg-City only: when true, every city neighbourhood passes; when false, only keys in the set. */
    let luxNeighbourhoodAll = true;
    const luxNeighbourhoodSelected = new Set();
    /** Outside-city listings: same pattern as Luxembourg-City hoods. */
    let outsideNeighbourhoodAll = true;
    const outsideNeighbourhoodSelected = new Set();
    /** Popups to close when opening the sort menu (registered after neighbourhood UI exists). */
    const closePopupsBeforeSortOpen = [];

    const STEP_50K = 50_000;
    const STEP_100K = 100_000;
    const STEP_500K = 500_000;
    const MIN_THUMB_GAP = STEP_50K;
    const DEFAULT_PRICE_MAX = 5_000_000;
    let priceRangeMin = 0;
    let priceRangeMax = DEFAULT_PRICE_MAX;
    let priceRosterRawMin = null;
    let priceRosterRawMax = null;
    let priceUserMin = null;
    let priceUserMax = null;
    let updatePriceUi = function () {};
    const priceBlockRef = { el: null };
    let updateResetFiltersButton = function () {};
    /** True while a price thumb is dragged — `applyClientFilters` skips expensive DOM passes. */
    let priceThumbDragging = false;
    let priceDragApplyRaf = 0;

    function isPriceFilterNarrowed() {
      const w0 = priceRangeMax - priceRangeMin;
      if (w0 <= 0 || priceUserMin == null || priceUserMax == null) {
        return false;
      }
      return priceUserMin > priceRangeMin || priceUserMax < priceRangeMax;
    }

    function roundStep(n, s) {
      return Math.round(n / s) * s;
    }
    function floorStep(n, s) {
      return Math.floor(n / s) * s;
    }
    function ceilStep(n, s) {
      return Math.ceil(n / s) * s;
    }
    function snapPriceEur(n) {
      const x = Math.round(n);
      if (x < 1_000_000) {
        return roundStep(x, STEP_50K);
      }
      if (x < 2_000_000) {
        return roundStep(x, STEP_100K);
      }
      return roundStep(x, STEP_500K);
    }
    function floorPriceBound(n) {
      const x = Math.max(0, Math.round(n));
      if (x < 1_000_000) {
        return floorStep(x, STEP_50K);
      }
      if (x < 2_000_000) {
        return floorStep(x, STEP_100K);
      }
      return floorStep(x, STEP_500K);
    }
    function ceilPriceBound(n) {
      const x = Math.max(0, Math.round(n));
      if (x < 1_000_000) {
        return ceilStep(x, STEP_50K);
      }
      if (x < 2_000_000) {
        return ceilStep(x, STEP_100K);
      }
      return ceilStep(x, STEP_500K);
    }
    function nextPriceStopEur(v, cap) {
      const c = Math.round(cap);
      const x = Math.round(v);
      if (x >= c) {
        return c;
      }
      if (x < 1_000_000) {
        const n = x + STEP_50K;
        if (n < 1_000_000) {
          return Math.min(n, c);
        }
        return Math.min(1_000_000, c);
      }
      if (x < 2_000_000) {
        const n = x + STEP_100K;
        if (n < 2_000_000) {
          return Math.min(n, c);
        }
        return Math.min(2_000_000, c);
      }
      return Math.min(x + STEP_500K, c);
    }
    function enumeratePriceSnapStops(lo, hi) {
      let a = snapPriceEur(Math.round(lo));
      let b = snapPriceEur(Math.round(hi));
      if (a > b) {
        const t = a;
        a = b;
        b = t;
      }
      if (a === b) {
        return [a];
      }
      const out = [a];
      let v = a;
      for (let i = 0; i < 10000; i++) {
        if (v >= b) {
          break;
        }
        const n = nextPriceStopEur(v, b);
        if (n <= v) {
          if (out[out.length - 1] !== b) {
            out.push(b);
          }
          break;
        }
        v = n;
        out.push(v);
        if (v >= b) {
          break;
        }
      }
      if (out[out.length - 1] !== b) {
        out.push(b);
      }
      return out;
    }
    function euroToUniformPositionPct(euro, stops) {
      if (stops == null || stops.length === 0) {
        return 0;
      }
      if (stops.length === 1) {
        return 50;
      }
      const e = snapPriceEur(euro);
      let idx = stops.indexOf(e);
      if (idx === -1) {
        let bestI = 0;
        let bestD = Infinity;
        for (let j = 0; j < stops.length; j++) {
          const d0 = Math.abs(stops[j] - e);
          if (d0 < bestD) {
            bestD = d0;
            bestI = j;
          }
        }
        idx = bestI;
      }
      return (idx / (stops.length - 1)) * 100;
    }
    function formatPriceK(n) {
      if (n == null) return "—";
      if (n <= 0) return "0k";
      if (n < 1_000_000) {
        return Math.round(n / 1000) + "k";
      }
      const m = n / 1_000_000;
      const str = m
        .toFixed(2)
        .replace(/0+$/, "")
        .replace(/\.$/, "");
      return str + "M";
    }
    function extractPriceEurFromListing(listing) {
      const fromClass = listing.querySelector("[class*=\"price\" i], [class*=\"Price\"]");
      if (fromClass) {
        const raw = (fromClass.textContent || "").replace(/\s/g, " ");
        const m1 = raw.match(/€\s*([\d\s.]+)/);
        if (m1) {
          const p = parseInt(m1[1].replace(/[\s.]/g, ""), 10);
          if (p > 0) return p;
        }
        const m2 = raw.match(/([\d\s.]+)\s*€/);
        if (m2) {
          const p = parseInt(m2[1].replace(/[\s.]/g, ""), 10);
          if (p > 0) return p;
        }
      }
      const t = (listing.getAttribute("title") || listing.textContent || "").replace(/\u00a0/g, " ");
      const withEuroAfter = Array.from(t.matchAll(/€\s*([\d\s.]+)/gi));
      if (withEuroAfter.length) {
        const m = withEuroAfter[withEuroAfter.length - 1];
        const p = parseInt(m[1].replace(/[\s.]/g, ""), 10);
        if (p > 0) return p;
      }
      const mBefore = t.match(/([\d\s.]+)\s*€/i);
      if (mBefore) {
        const p = parseInt(mBefore[1].replace(/[\s.]/g, ""), 10);
        if (p > 0) return p;
      }
      const allEuro = Array.from(t.matchAll(/€\s*([\d\s.]+)/g));
      if (allEuro.length) {
        const p = parseInt(
          allEuro[allEuro.length - 1][1].replace(/[\s.]/g, ""),
          10
        );
        if (p > 0) {
          return p;
        }
      }
      return null;
    }
    function extractPriceEurForColumn(col) {
      const w = col.querySelector(".listings-item-wrapper");
      if (w) {
        const p0 = extractPriceEurFromListing(w);
        if (p0 != null) {
          return p0;
        }
      }
      return extractPriceEurFromListing(col);
    }

    const path = window.location.pathname;
    /** Used by syncExcCheckboxFromUrl: only clear exceptional when URL *leaves* /buy/outstanding (not when turning it on from another tab). */
    let lastPathnameForExcSync = path;
    const isExceptional = path.includes("/buy/outstanding");
    const isDefaultBuy =
      !path.includes("/buy/house") && !path.includes("/buy/apartment") && !path.includes("/buy/outstanding");
    const isHouse = path.includes("/buy/house") || isDefaultBuy;
    const isApartment = path.includes("/buy/apartment") || isDefaultBuy;

    const container = document.createElement("div");
    container.className = "modern-filters-container";

    const typeTitleLabel = document.createElement("span");
    typeTitleLabel.className = "modern-filters-title";
    typeTitleLabel.textContent = "FILTERS";

    const topRowWrapper = document.createElement("div");
    topRowWrapper.className = "modern-filters-chips";

    const circleSvg = `
        <svg class="status-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle class="bg-circle" cx="12" cy="12" r="9"></circle>
            <polyline class="check-mark" points="8 12 11 15 16 9"></polyline>
        </svg>`;

    const createChip = (id, text, isChecked, isExc) => {
      const label = document.createElement("label");
      label.className = "modern-chip-label";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.id = id;
      input.checked = isChecked;
      const iconHtml = isExc
        ? '<span class="material-symbols-outlined" aria-hidden="true">stars</span>'
        : circleSvg;
      label.innerHTML = iconHtml + text;
      label.prepend(input);
      return { label, input };
    };

    /* Outstanding URL: both types apply in practice; start checked so exc mode matches other muted filters (ticked + inactive). */
    const houseNode = createChip("nnpilot-chk-house", "Houses", isExceptional || isHouse, false);
    const aptNode = createChip("nnpilot-chk-apt", "Apartments", isExceptional || isApartment, false);
    const typePairWrap = document.createElement("div");
    typePairWrap.className = "nnpilot-type-pair-wrap";
    typePairWrap.append(houseNode.label, aptNode.label);
    const divider1 = document.createElement("div");
    divider1.className = "modern-vertical-divider";
    const luxCityNode = createChip("nnpilot-chk-lux", "Luxembourg-City", true, false);
    const luxHoodWrap = document.createElement("div");
    luxHoodWrap.className = "nnpilot-lux-hood-wrap";
    const luxHoodToggle = document.createElement("button");
    luxHoodToggle.type = "button";
    luxHoodToggle.className = "nnpilot-lux-hood__toggle";
    luxHoodToggle.setAttribute("aria-label", "Luxembourg-City neighbourhoods");
    luxHoodToggle.setAttribute("aria-expanded", "false");
    luxHoodToggle.setAttribute("aria-haspopup", "true");
    const luxHoodChev = document.createElement("span");
    luxHoodChev.className = "material-symbols-outlined";
    luxHoodChev.setAttribute("aria-hidden", "true");
    luxHoodChev.textContent = "expand_more";
    luxHoodToggle.appendChild(luxHoodChev);
    const luxHoodMenu = document.createElement("div");
    luxHoodMenu.className = "nnpilot-lux-hood__menu";
    luxHoodMenu.hidden = true;
    const luxHoodAllLabel = document.createElement("label");
    luxHoodAllLabel.className = "nnpilot-lux-hood__row";
    luxHoodAllLabel.setAttribute("data-hood-all", "1");
    const luxHoodAllInput = document.createElement("input");
    luxHoodAllInput.type = "checkbox";
    const luxHoodAllSpan = document.createElement("span");
    luxHoodAllSpan.textContent = "All neighbourhoods";
    luxHoodAllLabel.append(luxHoodAllInput, luxHoodAllSpan);
    const luxHoodHeader = document.createElement("div");
    luxHoodHeader.className = "nnpilot-lux-hood__header";
    luxHoodHeader.appendChild(luxHoodAllLabel);
    const luxHoodList = document.createElement("ul");
    luxHoodList.className = "nnpilot-lux-hood__list";
    luxHoodMenu.append(luxHoodHeader, luxHoodList);
    luxHoodWrap.append(luxCityNode.label, luxHoodToggle, luxHoodMenu);

    let luxHoodMenuKeys = [];
    let luxHoodMenuLastSig = null;
    let luxHoodMenuApplying = false;

    function applyLuxHoodInputsFromState() {
      luxHoodMenuApplying = true;
      try {
        luxHoodAllInput.checked = luxNeighbourhoodAll;
        luxHoodList.querySelectorAll(".nnpilot-lux-hood__row").forEach((lab) => {
          const idx = parseInt(lab.getAttribute("data-hood-idx"), 10);
          const key = luxHoodMenuKeys[idx];
          const inp = lab.querySelector("input");
          if (!inp || key == null) {
            return;
          }
          inp.checked = luxNeighbourhoodAll || luxNeighbourhoodSelected.has(key);
        });
      } finally {
        luxHoodMenuApplying = false;
      }
    }

    function rebuildLuxHoodMenuFromDom() {
      const migrated = new Set();
      for (const k of luxNeighbourhoodSelected) {
        const c = canonicalLuxCityNeighbourhoodKey(k);
        if (c) {
          migrated.add(c);
        }
      }
      luxNeighbourhoodSelected.clear();
      for (const c of migrated) {
        luxNeighbourhoodSelected.add(c);
      }
      const keys = scanLuxNeighbourhoodKeysSorted();
      for (const k of [...luxNeighbourhoodSelected]) {
        if (!keys.includes(k)) {
          luxNeighbourhoodSelected.delete(k);
        }
      }
      const kSig = keys.join("\0");
      const skipLuxMenuDom = luxHoodMenuLastSig !== null && kSig === luxHoodMenuLastSig;
      luxHoodMenuLastSig = kSig;
      luxHoodMenuKeys = keys;
      if (!skipLuxMenuDom) {
        luxHoodList.replaceChildren();
        keys.forEach((key, idx) => {
          const li = document.createElement("li");
          li.className = "nnpilot-lux-hood__item";
          const lab = document.createElement("label");
          lab.className = "nnpilot-lux-hood__row";
          lab.setAttribute("data-hood-idx", String(idx));
          const inp = document.createElement("input");
          inp.type = "checkbox";
          const sp = document.createElement("span");
          sp.textContent = key;
          lab.append(inp, sp);
          li.appendChild(lab);
          luxHoodList.appendChild(li);
        });
      }
      applyLuxHoodInputsFromState();
    }

    function closeLuxHoodMenu() {
      luxHoodMenu.hidden = true;
      luxHoodToggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onDocumentClickLuxHood, true);
      document.removeEventListener("keydown", onEscapeCloseLuxHood, true);
    }
    function onDocumentClickLuxHood(e) {
      if (!luxHoodWrap.contains(e.target)) {
        closeLuxHoodMenu();
      }
    }
    function onEscapeCloseLuxHood(e) {
      if (e.key === "Escape" && !luxHoodMenu.hidden) {
        closeLuxHoodMenu();
      }
    }
    function openLuxHoodMenu() {
      if (luxHoodToggle.disabled) {
        return;
      }
      closeOutsideHoodMenu();
      closeSortListingsMenu();
      rebuildLuxHoodMenuFromDom();
      luxHoodMenu.hidden = false;
      luxHoodToggle.setAttribute("aria-expanded", "true");
      setTimeout(() => {
        document.addEventListener("click", onDocumentClickLuxHood, true);
        document.addEventListener("keydown", onEscapeCloseLuxHood, true);
      }, 0);
    }

    luxHoodToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (luxHoodMenu.hidden) {
        openLuxHoodMenu();
      } else {
        closeLuxHoodMenu();
      }
    });

    /** When no Luxembourg-City hood is selected, turn off the main chip (unless Outside is off too — then revert to “all”). */
    function syncLuxCityChipFromHoodSelection() {
      if (luxNeighbourhoodAll || luxNeighbourhoodSelected.size > 0) return;
      if (outsideNode.input.checked) {
        luxCityNode.input.checked = false;
      } else {
        luxNeighbourhoodAll = true;
        luxNeighbourhoodSelected.clear();
        luxCityNode.input.checked = true;
      }
    }

    /** When no Outside-City muni is selected, turn off the main chip (unless Luxembourg-City is off too — then revert to “all”). */
    function syncOutsideCityChipFromHoodSelection() {
      if (outsideNeighbourhoodAll || outsideNeighbourhoodSelected.size > 0) return;
      if (luxCityNode.input.checked) {
        outsideNode.input.checked = false;
      } else {
        outsideNeighbourhoodAll = true;
        outsideNeighbourhoodSelected.clear();
        outsideNode.input.checked = true;
      }
    }

    luxHoodMenu.addEventListener("change", (e) => {
      if (luxHoodMenuApplying) {
        return;
      }
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") {
        return;
      }
      const lab = t.closest(".nnpilot-lux-hood__row");
      if (!lab) {
        return;
      }
      if (lab.getAttribute("data-hood-all") === "1") {
        if (t.checked) {
          luxNeighbourhoodAll = true;
          luxNeighbourhoodSelected.clear();
          luxCityNode.input.checked = true;
        } else {
          luxNeighbourhoodAll = false;
          luxNeighbourhoodSelected.clear();
          luxCityNode.input.checked = false;
        }
        applyLuxHoodInputsFromState();
        syncUI();
        applyClientFilters();
        return;
      }
      const idx = parseInt(lab.getAttribute("data-hood-idx"), 10);
      const key = luxHoodMenuKeys[idx];
      if (key == null) {
        return;
      }
      if (!luxCityNode.input.checked) {
        luxCityNode.input.checked = true;
      }
      if (luxNeighbourhoodAll) {
        if (!t.checked) {
          luxNeighbourhoodAll = false;
          luxNeighbourhoodSelected.clear();
          for (const k of luxHoodMenuKeys) {
            if (k !== key) {
              luxNeighbourhoodSelected.add(k);
            }
          }
        }
      } else {
        if (t.checked) {
          luxNeighbourhoodSelected.add(key);
        } else {
          luxNeighbourhoodSelected.delete(key);
        }
      }
      syncLuxCityChipFromHoodSelection();
      luxHoodMenuApplying = true;
      luxHoodAllInput.checked = luxNeighbourhoodAll;
      luxHoodMenuApplying = false;
      applyLuxHoodInputsFromState();
      syncUI();
      applyClientFilters();
    });

    closePopupsBeforeSortOpen.push(closeLuxHoodMenu);

    const outsideNode = createChip("nnpilot-chk-out", "Outside city", true, false);
    const outHoodWrap = document.createElement("div");
    outHoodWrap.className = "nnpilot-out-hood-wrap";
    const outHoodToggle = document.createElement("button");
    outHoodToggle.type = "button";
    outHoodToggle.className = "nnpilot-lux-hood__toggle";
    outHoodToggle.setAttribute("aria-label", "Outside city municipalities");
    outHoodToggle.setAttribute("aria-expanded", "false");
    outHoodToggle.setAttribute("aria-haspopup", "true");
    const outHoodChev = document.createElement("span");
    outHoodChev.className = "material-symbols-outlined";
    outHoodChev.setAttribute("aria-hidden", "true");
    outHoodChev.textContent = "expand_more";
    outHoodToggle.appendChild(outHoodChev);
    const outHoodMenu = document.createElement("div");
    outHoodMenu.className = "nnpilot-lux-hood__menu";
    outHoodMenu.hidden = true;
    const outHoodAllLabel = document.createElement("label");
    outHoodAllLabel.className = "nnpilot-lux-hood__row";
    outHoodAllLabel.setAttribute("data-hood-all", "1");
    const outHoodAllInput = document.createElement("input");
    outHoodAllInput.type = "checkbox";
    const outHoodAllSpan = document.createElement("span");
    outHoodAllSpan.textContent = "All municipalities";
    outHoodAllLabel.append(outHoodAllInput, outHoodAllSpan);
    const outHoodHeader = document.createElement("div");
    outHoodHeader.className = "nnpilot-lux-hood__header";
    outHoodHeader.appendChild(outHoodAllLabel);
    const outHoodSearchWrap = document.createElement("div");
    outHoodSearchWrap.className = "nnpilot-out-hood__search";
    const outHoodSearchInput = document.createElement("input");
    outHoodSearchInput.type = "search";
    outHoodSearchInput.className = "nnpilot-out-hood__search-input";
    outHoodSearchInput.setAttribute("aria-label", "Filter municipalities");
    outHoodSearchInput.setAttribute("autocomplete", "off");
    outHoodSearchInput.setAttribute("spellcheck", "false");
    outHoodSearchInput.placeholder = "Search municipalities…";
    outHoodSearchWrap.appendChild(outHoodSearchInput);
    const outHoodList = document.createElement("ul");
    outHoodList.className = "nnpilot-lux-hood__list nnpilot-out-hood__list--grouped";
    outHoodMenu.append(outHoodHeader, outHoodSearchWrap, outHoodList);

    function setOutHoodRegionPanelCollapsed(shell, collapsed) {
      const subUl = shell.querySelector(".nnpilot-out-hood__region-grid");
      const btn = shell.querySelector(".nnpilot-out-hood__region-toggle");
      if (!subUl || !btn) {
        return;
      }
      if (collapsed) {
        subUl.classList.add("is-collapsed");
      } else {
        subUl.classList.remove("is-collapsed");
      }
      btn.setAttribute("aria-expanded", String(!collapsed));
    }

    function applyOutHoodSearchFilter() {
      const q = (outHoodSearchInput.value || "").trim().toLowerCase();
      for (const shell of outHoodList.querySelectorAll("li.nnpilot-out-hood__region-shell")) {
        const rid = shell.getAttribute("data-out-region-block") || "";
        const labelLc = (
          outsideMuniRegionLabels[rid] ||
          (rid === "_" ? "other" : rid) ||
          ""
        ).toLowerCase();
        let anyChild = false;
        for (const li of shell.querySelectorAll("li.nnpilot-lux-hood__item")) {
          const sp = li.querySelector(".nnpilot-lux-hood__row span");
          const t = sp && sp.textContent ? sp.textContent.trim().toLowerCase() : "";
          const show = !q || t.includes(q);
          li.style.display = show ? "" : "none";
          if (show) {
            anyChild = true;
          }
        }
        if (!q) {
          shell.style.display = "";
          /* Do not force-collapse panels here: this runs from applyClientFilters on every listings
             mutation while the menu is open; collapsing would undo expand toggles immediately. */
        } else {
          const showShell = anyChild || labelLc.includes(q);
          shell.style.display = showShell ? "" : "none";
          setOutHoodRegionPanelCollapsed(shell, !showShell);
        }
      }
    }
    outHoodSearchInput.addEventListener("input", applyOutHoodSearchFilter);
    outHoodWrap.append(outsideNode.label, outHoodToggle, outHoodMenu);

    let outHoodMenuKeys = [];
    let outHoodMenuLastSig = null;
    /** @type { Record<string, string[]> } */
    let outHoodRegionToKeys = {};
    let outHoodMenuApplying = false;

    function applyOutHoodInputsFromState() {
      outHoodMenuApplying = true;
      try {
        outHoodAllInput.checked = outsideNeighbourhoodAll;
        outHoodList.querySelectorAll(".nnpilot-lux-hood__row[data-hood-idx]").forEach((lab) => {
          const idx = parseInt(lab.getAttribute("data-hood-idx"), 10);
          const key = outHoodMenuKeys[idx];
          const inp = lab.querySelector("input");
          if (!inp || key == null) {
            return;
          }
          inp.checked = outsideNeighbourhoodAll || outsideNeighbourhoodSelected.has(key);
        });
        outHoodList.querySelectorAll(".nnpilot-out-hood__region-row").forEach((regLab) => {
          const rid = regLab.getAttribute("data-out-region");
          if (!rid) {
            return;
          }
          const keysInR = outHoodRegionToKeys[rid] || [];
          const inp = regLab.querySelector("input");
          if (!inp || keysInR.length === 0) {
            return;
          }
          if (outsideNeighbourhoodAll) {
            inp.checked = true;
            inp.indeterminate = false;
            return;
          }
          let onC = 0;
          for (const k of keysInR) {
            if (outsideNeighbourhoodSelected.has(k)) {
              onC++;
            }
          }
          inp.checked = onC === keysInR.length;
          inp.indeterminate = onC > 0 && onC < keysInR.length;
        });
      } finally {
        outHoodMenuApplying = false;
      }
    }

    function rebuildOutsideHoodMenuFromDom() {
      const migrated = new Set();
      for (const k of outsideNeighbourhoodSelected) {
        const c = canonicalOutsideNeighbourhoodKey(k);
        if (c) {
          migrated.add(c);
        }
      }
      outsideNeighbourhoodSelected.clear();
      for (const c of migrated) {
        outsideNeighbourhoodSelected.add(c);
      }
      let keys = scanOutsideNeighbourhoodKeysSorted();
      keys = sortOutsideKeysByRegion(keys);
      for (const k of [...outsideNeighbourhoodSelected]) {
        if (!keys.includes(k)) {
          outsideNeighbourhoodSelected.delete(k);
        }
      }
      const oSig = keys.join("\0");
      const skipOutMenuDom = outHoodMenuLastSig !== null && oSig === outHoodMenuLastSig;
      outHoodMenuLastSig = oSig;
      outHoodMenuKeys = keys;
      if (skipOutMenuDom) {
        applyOutHoodInputsFromState();
        outHoodSearchInput.value = "";
        applyOutHoodSearchFilter();
        return;
      }

      outHoodRegionToKeys = {};

      const byR = new Map();
      for (const k of keys) {
        const rid = getOutsideKeyRegionId(k, outsideMuniNormToRegion) || "_";
        if (!byR.has(rid)) {
          byR.set(rid, []);
        }
        byR.get(rid).push(k);
      }

      const keyToIdx = new Map();
      keys.forEach((k, i) => keyToIdx.set(k, i));

      outHoodList.replaceChildren();

      function appendRegionBlock(rid, headLabel) {
        const list = byR.get(rid);
        if (!list || !list.length) {
          return;
        }
        outHoodRegionToKeys[rid] = list.slice();
        const shell = document.createElement("li");
        shell.className = "nnpilot-out-hood__region-shell";
        shell.setAttribute("data-out-region-block", rid);
        const headWrap = document.createElement("div");
        headWrap.className = "nnpilot-out-hood__region-head";
        const regLab = document.createElement("label");
        regLab.className = "nnpilot-lux-hood__row nnpilot-out-hood__region-row";
        regLab.setAttribute("data-out-region", rid);
        const regInp = document.createElement("input");
        regInp.type = "checkbox";
        const regSp = document.createElement("span");
        regSp.textContent = headLabel;
        regLab.append(regInp, regSp);
        headWrap.appendChild(regLab);
        const toggleBtn = document.createElement("button");
        toggleBtn.type = "button";
        toggleBtn.className = "nnpilot-out-hood__region-toggle";
        toggleBtn.setAttribute("aria-expanded", "false");
        toggleBtn.setAttribute(
          "aria-label",
          `Show or hide municipalities in ${headLabel}`
        );
        const toggleChev = document.createElement("span");
        toggleChev.className = "material-symbols-outlined";
        toggleChev.setAttribute("aria-hidden", "true");
        toggleChev.textContent = "expand_more";
        toggleBtn.appendChild(toggleChev);
        headWrap.appendChild(toggleBtn);
        const subUl = document.createElement("ul");
        subUl.className = "nnpilot-lux-hood__list nnpilot-out-hood__region-grid is-collapsed";
        toggleBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const collapsed = subUl.classList.contains("is-collapsed");
          if (collapsed) {
            subUl.classList.remove("is-collapsed");
          } else {
            subUl.classList.add("is-collapsed");
          }
          const nowCollapsed = subUl.classList.contains("is-collapsed");
          toggleBtn.setAttribute("aria-expanded", String(!nowCollapsed));
        });
        for (const key of list) {
          const idx = keyToIdx.get(key);
          const li = document.createElement("li");
          li.className = "nnpilot-lux-hood__item";
          const lab = document.createElement("label");
          lab.className = "nnpilot-lux-hood__row";
          lab.setAttribute("data-hood-idx", String(idx));
          const inp = document.createElement("input");
          inp.type = "checkbox";
          const sp = document.createElement("span");
          sp.textContent = key;
          lab.append(inp, sp);
          li.appendChild(lab);
          subUl.appendChild(li);
        }
        shell.appendChild(headWrap);
        shell.appendChild(subUl);
        outHoodList.appendChild(shell);
      }

      for (const rid of outsideMuniRegionOrder) {
        appendRegionBlock(rid, outsideMuniRegionLabels[rid] || rid);
      }
      appendRegionBlock("_", "Other");

      applyOutHoodInputsFromState();
      outHoodSearchInput.value = "";
      applyOutHoodSearchFilter();
    }

    function closeOutsideHoodMenu() {
      outHoodMenu.hidden = true;
      outHoodToggle.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onDocumentClickOutHood, true);
      document.removeEventListener("keydown", onEscapeCloseOutHood, true);
    }
    function onDocumentClickOutHood(e) {
      if (!outHoodWrap.contains(e.target)) {
        closeOutsideHoodMenu();
      }
    }
    function onEscapeCloseOutHood(e) {
      if (e.key === "Escape" && !outHoodMenu.hidden) {
        closeOutsideHoodMenu();
      }
    }
    function openOutsideHoodMenu() {
      if (outHoodToggle.disabled) {
        return;
      }
      closeLuxHoodMenu();
      closeSortListingsMenu();
      rebuildOutsideHoodMenuFromDom();
      outHoodMenu.hidden = false;
      outHoodToggle.setAttribute("aria-expanded", "true");
      setTimeout(() => {
        document.addEventListener("click", onDocumentClickOutHood, true);
        document.addEventListener("keydown", onEscapeCloseOutHood, true);
      }, 0);
    }

    outHoodToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (outHoodMenu.hidden) {
        openOutsideHoodMenu();
      } else {
        closeOutsideHoodMenu();
      }
    });

    outHoodMenu.addEventListener("change", (e) => {
      if (outHoodMenuApplying) {
        return;
      }
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.type !== "checkbox") {
        return;
      }
      const lab = t.closest(".nnpilot-lux-hood__row");
      if (!lab) {
        return;
      }
      if (lab.getAttribute("data-hood-all") === "1") {
        if (t.checked) {
          outsideNeighbourhoodAll = true;
          outsideNeighbourhoodSelected.clear();
          outsideNode.input.checked = true;
        } else {
          outsideNeighbourhoodAll = false;
          outsideNeighbourhoodSelected.clear();
          outsideNode.input.checked = false;
        }
        applyOutHoodInputsFromState();
        syncUI();
        applyClientFilters();
        return;
      }
      if (lab.getAttribute("data-out-region")) {
        const rid = lab.getAttribute("data-out-region");
        const keysInR = outHoodRegionToKeys[rid] || [];
        if (!outsideNode.input.checked) {
          outsideNode.input.checked = true;
        }
        if (t.checked) {
          if (outsideNeighbourhoodAll) {
            /* already all on; nothing to add */
          } else {
            for (const kk of keysInR) {
              outsideNeighbourhoodSelected.add(kk);
            }
          }
        } else if (outsideNeighbourhoodAll) {
          outsideNeighbourhoodAll = false;
          outsideNeighbourhoodSelected.clear();
          for (const k of outHoodMenuKeys) {
            if (!keysInR.includes(k)) {
              outsideNeighbourhoodSelected.add(k);
            }
          }
        } else {
          for (const kk of keysInR) {
            outsideNeighbourhoodSelected.delete(kk);
          }
        }
        syncOutsideCityChipFromHoodSelection();
        outHoodMenuApplying = true;
        outHoodAllInput.checked = outsideNeighbourhoodAll;
        outHoodMenuApplying = false;
        applyOutHoodInputsFromState();
        syncUI();
        applyClientFilters();
        return;
      }
      const idx = parseInt(lab.getAttribute("data-hood-idx"), 10);
      const key = outHoodMenuKeys[idx];
      if (key == null) {
        return;
      }
      if (!outsideNode.input.checked) {
        outsideNode.input.checked = true;
      }
      if (outsideNeighbourhoodAll) {
        if (!t.checked) {
          outsideNeighbourhoodAll = false;
          outsideNeighbourhoodSelected.clear();
          for (const k of outHoodMenuKeys) {
            if (k !== key) {
              outsideNeighbourhoodSelected.add(k);
            }
          }
        }
      } else {
        if (t.checked) {
          outsideNeighbourhoodSelected.add(key);
        } else {
          outsideNeighbourhoodSelected.delete(key);
        }
      }
      syncOutsideCityChipFromHoodSelection();
      outHoodMenuApplying = true;
      outHoodAllInput.checked = outsideNeighbourhoodAll;
      outHoodMenuApplying = false;
      applyOutHoodInputsFromState();
      syncUI();
      applyClientFilters();
    });

    closePopupsBeforeSortOpen.push(closeOutsideHoodMenu);

    const divider2 = document.createElement("div");
    divider2.className = "modern-vertical-divider";
    const excNode = createChip("nnpilot-chk-exc", "Exceptional properties", isExceptional, true);

    topRowWrapper.append(
      typePairWrap,
      divider1,
      luxHoodWrap,
      outHoodWrap,
      divider2,
      excNode.label
    );

    /** Hero + related listing tweaks: only on buy/outstanding, with exceptional on and Modern Cards enabled. */
    function isExceptionalModernHeroMode() {
      const p = typeof window !== "undefined" ? window.location.pathname : "";
      return (
        toolModernPropertyCards !== false &&
        p.includes("/buy/outstanding") &&
        excNode &&
        excNode.input &&
        excNode.input.checked
      );
    }
    function refreshExcHeroListingsClass() {
      const lc = document.getElementById("listingsContainer");
      if (lc) {
        lc.classList.toggle("nnpilot-exc-hero--active", isExceptionalModernHeroMode());
      }
    }

    const sortOptionDefs = [
      { value: "date", text: "Date (most recent first)" },
      { value: "price-asc", text: "Price (lowest first)" },
      { value: "price-desc", text: "Price (highest first)" },
    ];
    const sortListingsBar = document.createElement("div");
    sortListingsBar.className = "nnpilot-listings-sort-bar";
    const sortListingsWrap = document.createElement("div");
    sortListingsWrap.className = "nnpilot-listings-sort-wrap";
    const sortBtn = document.createElement("button");
    sortBtn.type = "button";
    sortBtn.className = "nnpilot-listings-sort__btn";
    sortBtn.setAttribute("aria-label", "Sort listings");
    sortBtn.setAttribute("aria-expanded", "false");
    const sortIcon = document.createElement("span");
    sortIcon.className = "material-symbols-outlined nnpilot-listings-sort__icon--sort";
    sortIcon.setAttribute("aria-hidden", "true");
    sortIcon.textContent = "sort";
    const sortLine = document.createElement("span");
    sortLine.className = "nnpilot-listings-sort__line";
    const sortLineLabel = document.createElement("span");
    sortLineLabel.className = "nnpilot-listings-sort__label";
    sortLineLabel.textContent = "Sort by";
    const sortLineValue = document.createElement("span");
    sortLineValue.className = "nnpilot-listings-sort__value";
    sortLine.append(sortLineLabel, sortLineValue);
    const sortChev = document.createElement("span");
    sortChev.className = "material-symbols-outlined nnpilot-listings-sort__icon--arr";
    sortChev.setAttribute("aria-hidden", "true");
    sortChev.textContent = "expand_more";
    sortBtn.append(sortIcon, sortLine, sortChev);
    const sortMenu = document.createElement("div");
    sortMenu.className = "nnpilot-listings-sort__menu";
    sortMenu.setAttribute("role", "listbox");
    sortMenu.setAttribute("aria-label", "Sort by");
    sortMenu.hidden = true;
    const sortMenuOpts = [];
    for (const o of sortOptionDefs) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nnpilot-listings-sort__opt";
      b.setAttribute("role", "option");
      b.setAttribute("data-nnpilot-sort", o.value);
      b.textContent = o.text;
      b.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        applySortFromMenu(o.value);
      });
      sortMenu.appendChild(b);
      sortMenuOpts.push(b);
    }
    sortListingsWrap.append(sortBtn, sortMenu);
    sortListingsWrap.hidden = sortingEnabled === false;
    const toolbarLeft = document.createElement("div");
    toolbarLeft.id = "nnpilot-listings-toolbar-left";
    toolbarLeft.className = "nnpilot-listings-toolbar-left";
    sortListingsBar.append(toolbarLeft, sortListingsWrap);
    function updateSortMenuActive() {
      for (const b of sortMenuOpts) {
        b.classList.toggle("is-active", b.getAttribute("data-nnpilot-sort") === listingSortMode);
      }
    }
    function refreshSortButtonLabel() {
      const o = sortOptionDefs.find((x) => x.value === listingSortMode);
      const t = o ? o.text : sortOptionDefs[0].text;
      sortLineValue.textContent = t;
      sortBtn.setAttribute("aria-label", "Sort listings: " + t);
    }
    function closeSortListingsMenu() {
      sortMenu.hidden = true;
      sortBtn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", onDocumentClickSort, true);
      document.removeEventListener("keydown", onEscapeCloseSort, true);
    }
    function onDocumentClickSort(e) {
      if (!sortListingsWrap.contains(e.target)) {
        closeSortListingsMenu();
      }
    }
    function onEscapeCloseSort(e) {
      if (e.key === "Escape" && !sortMenu.hidden) {
        closeSortListingsMenu();
      }
    }
    function openSortListingsMenu() {
      for (const fn of closePopupsBeforeSortOpen) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
      sortMenu.hidden = false;
      sortBtn.setAttribute("aria-expanded", "true");
      setTimeout(() => {
        document.addEventListener("click", onDocumentClickSort, true);
        document.addEventListener("keydown", onEscapeCloseSort, true);
      }, 0);
    }
    function applySortFromMenu(mode) {
      if (mode === listingSortMode) {
        closeSortListingsMenu();
        return;
      }
      listingSortMode = mode;
      refreshSortButtonLabel();
      updateSortMenuActive();
      closeSortListingsMenu();
      applyClientFilters();
    }
    sortBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (sortMenu.hidden) {
        openSortListingsMenu();
      } else {
        closeSortListingsMenu();
      }
    });
    function syncSortUiToMode() {
      refreshSortButtonLabel();
      updateSortMenuActive();
    }
    refreshSortButtonLabel();
    updateSortMenuActive();
    function ensureListingsSortBarInContainer() {
      const c = document.getElementById("listingsContainer");
      if (c == null) {
        return;
      }
      if (!c.contains(sortListingsBar)) {
        c.insertBefore(sortListingsBar, c.firstChild);
      }
    }
    function tryInstallListingsSort() {
      const c = document.getElementById("listingsContainer");
      if (c == null) {
        return false;
      }
      ensureListingsSortBarInContainer();
      return true;
    }

    function getLuxNeighbourhoodKeyFromDiv(neighborhoodDiv) {
      if (!neighborhoodDiv) {
        return null;
      }
      const raw = neighborhoodDiv.textContent.replace(/\u00a0/g, " ").trim();
      const m = raw.match(/^Luxembourg\s*-\s*(.+)$/i);
      if (!m) {
        return null;
      }
      const rest = m[1].trim();
      return rest || null;
    }

    /** Maps raw Nexvia quarter text to grouped label; see `luxembourg-city-neighbourhood-groups.bundle.js`. */
    function canonicalLuxCityNeighbourhoodKey(rawStripped) {
      if (rawStripped == null || rawStripped === "") {
        return null;
      }
      const t = String(rawStripped).trim();
      const k = normalizeLuxHoodAliasToken(t);
      const mapped = luxCityAliasToLabel.get(k);
      if (mapped) {
        return mapped;
      }
      if (k === "kirchberg" || k === "weimershof") {
        return "Kirchberg/Weimershof";
      }
      return t;
    }

    /** Outside-city keys: no Luxembourg-City grouping aliases. */
    function canonicalOutsideNeighbourhoodKey(rawStripped) {
      if (rawStripped == null || rawStripped === "") {
        return null;
      }
      return String(rawStripped).trim();
    }

    function sortLuxCityGroupKeys(keys) {
      const order = luxCityGroupOrder;
      const rank = (label) => {
        const i = order.indexOf(label);
        return i === -1 ? order.length + 1 : i;
      };
      return keys.slice().sort((a, b) => {
        const ra = rank(a);
        const rb = rank(b);
        if (ra !== rb) {
          return ra - rb;
        }
        return a.localeCompare(b, undefined, { sensitivity: "base" });
      });
    }

    function scanLuxNeighbourhoodKeysSorted() {
      const counts = new Map();
      for (const listing of document.querySelectorAll(".listings-item-wrapper")) {
        const div = listing.querySelector(".listings-item-city-neighborhood");
        const key = getLuxNeighbourhoodKeyFromDiv(div);
        if (key) {
          const canon = canonicalLuxCityNeighbourhoodKey(key);
          counts.set(canon, (counts.get(canon) || 0) + 1);
        }
      }
      return sortLuxCityGroupKeys(Array.from(counts.keys()));
    }

    function getOutsideNeighbourhoodKeyFromDiv(neighborhoodDiv) {
      if (!neighborhoodDiv) {
        return null;
      }
      const raw = neighborhoodDiv.textContent.replace(/\u00a0/g, " ").trim();
      if (!raw || raw.startsWith("Luxembourg -")) {
        return null;
      }
      return raw || null;
    }

    function scanOutsideNeighbourhoodKeysSorted() {
      const counts = new Map();
      for (const listing of document.querySelectorAll(".listings-item-wrapper")) {
        const div = listing.querySelector(".listings-item-city-neighborhood");
        const key = getOutsideNeighbourhoodKeyFromDiv(div);
        if (key) {
          const canon = canonicalOutsideNeighbourhoodKey(key);
          counts.set(canon, (counts.get(canon) || 0) + 1);
        }
      }
      return Array.from(counts.keys()).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" })
      );
    }

    function listingMatchesClientBase(listing) {
      const l = luxCityNode.input.checked;
      const o = outsideNode.input.checked;
      const neighborhoodDiv = listing.querySelector(".listings-item-city-neighborhood");
      let matchesLocation = true;
      if (neighborhoodDiv) {
        const raw = neighborhoodDiv.textContent.replace(/\u00a0/g, " ").trim();
        const isCity = raw.startsWith("Luxembourg -");
        matchesLocation = (l && o) || (l && isCity) || (o && !isCity);
        if (matchesLocation && l && isCity && !luxNeighbourhoodAll) {
          const hoodKey = getLuxNeighbourhoodKeyFromDiv(neighborhoodDiv);
          const canon = hoodKey ? canonicalLuxCityNeighbourhoodKey(hoodKey) : null;
          if (canon == null || !luxNeighbourhoodSelected.has(canon)) {
            matchesLocation = false;
          }
        }
        if (matchesLocation && o && !isCity && !outsideNeighbourhoodAll) {
          const outKey = getOutsideNeighbourhoodKeyFromDiv(neighborhoodDiv);
          const outCanon = outKey ? canonicalOutsideNeighbourhoodKey(outKey) : null;
          if (outCanon == null || !outsideNeighbourhoodSelected.has(outCanon)) {
            matchesLocation = false;
          }
        }
      }
      const bedNode = listing.querySelector(".listing-icons-icon-bed");
      let beds = 0;
      if (bedNode) {
        const m = bedNode.textContent.match(/\d+/);
        if (m) beds = parseInt(m[0], 10);
      }
      const matchesBeds = beds >= bedCount;
      const sqmNode = listing.querySelector(".listing-icons-icon-area-surface");
      let sqm = 0;
      if (sqmNode) {
        const m = sqmNode.textContent.match(/\d+/);
        if (m) sqm = parseInt(m[0], 10);
      }
      const matchesSqm = sqm >= sqmCount;
      return matchesLocation && matchesBeds && matchesSqm;
    }
    /** Price rail: session min/max of raw prices ever seen; current DOM can’t narrow it (e.g. type tab). */
    function recomputePriceBoundsAndClamp() {
      const list = document.querySelectorAll(".listings-item-wrapper");
      const found = [];
      list.forEach((w) => {
        const p = extractPriceEurFromListing(w);
        if (p != null && p > 0) {
          found.push(p);
        }
      });
      if (found.length === 0) {
        if (priceRosterRawMin == null || priceRosterRawMax == null) {
          priceRangeMin = 0;
          priceRangeMax = DEFAULT_PRICE_MAX;
        } else {
          priceRangeMin = floorPriceBound(priceRosterRawMin);
          priceRangeMax = Math.max(
            priceRangeMin + MIN_THUMB_GAP * 2,
            ceilPriceBound(priceRosterRawMax)
          );
        }
      } else {
        const rawMin = Math.min(...found);
        const rawMax = Math.max(...found);
        if (priceRosterRawMin == null) {
          priceRosterRawMin = rawMin;
          priceRosterRawMax = rawMax;
        } else {
          priceRosterRawMin = Math.min(priceRosterRawMin, rawMin);
          priceRosterRawMax = Math.max(priceRosterRawMax, rawMax);
        }
        priceRangeMin = floorPriceBound(priceRosterRawMin);
        priceRangeMax = Math.max(
          priceRangeMin + MIN_THUMB_GAP * 2,
          ceilPriceBound(priceRosterRawMax)
        );
      }
      if (priceUserMin == null || priceUserMax == null) {
        priceUserMin = priceRangeMin;
        priceUserMax = priceRangeMax;
      } else {
        if (priceUserMax - priceUserMin < MIN_THUMB_GAP) {
          priceUserMin = priceRangeMin;
          priceUserMax = priceRangeMax;
        } else {
          if (priceUserMin < priceRangeMin) {
            priceUserMin = priceRangeMin;
          }
          if (priceUserMax > priceRangeMax) {
            priceUserMax = priceRangeMax;
          }
          if (priceUserMax - priceUserMin < MIN_THUMB_GAP) {
            priceUserMin = priceRangeMin;
            priceUserMax = priceRangeMax;
          }
        }
      }
    }

    function isAtDefaultFilterState() {
      const topDefault =
        houseNode.input.checked &&
        aptNode.input.checked &&
        luxCityNode.input.checked &&
        outsideNode.input.checked &&
        !excNode.input.checked;
      const countDefault = bedCount === 0 && sqmCount === 10;
      const w0 = priceRangeMax - priceRangeMin;
      const priceDefault =
        w0 <= 0
          ? true
          : priceUserMin != null &&
            priceUserMax != null &&
            priceUserMin === priceRangeMin &&
            priceUserMax === priceRangeMax;
      const sortDefault = listingSortMode === "date";
      const hoodDefault =
        luxNeighbourhoodAll &&
        luxNeighbourhoodSelected.size === 0 &&
        outsideNeighbourhoodAll &&
        outsideNeighbourhoodSelected.size === 0;
      return topDefault && countDefault && priceDefault && sortDefault && hoodDefault;
    }

    let countersRow;
    let nnpilotListingsActiveRow = null;

    function getListingColumnishEl(wrapper) {
      const m = wrapper.closest(
        ".col-md-6, .col-sm-6, .col-6, [class*=\"col-md-\" i], [class*=\"col-sm-\" i]"
      );
      if (m) {
        if (m.classList.contains("unavailablePropertiesSeparatorWrapper")) {
          return null;
        }
        return m;
      }
      const row = wrapper.closest(".row");
      if (row) {
        for (let n = wrapper; n && n !== row; n = n.parentElement) {
          if (n.parentElement === row) {
            if (n.classList && n.classList.contains("unavailablePropertiesSeparatorWrapper")) {
              return null;
            }
            return n;
          }
        }
      }
      if (wrapper.parentElement) {
        return wrapper.parentElement;
      }
      return null;
    }

    function getUnavailableSoldSeparatorEl() {
      if (isExceptionalModernHeroMode()) {
        return null;
      }
      const listingsContainer = document.getElementById("listingsContainer");
      if (!listingsContainer) {
        return null;
      }
      return listingsContainer.querySelector(".unavailablePropertiesSeparatorWrapper");
    }

    /**
     * Nexvia sometimes emits the “Sorry, already sold” block as a bare `col-md-12`
     * sibling of `.row` nodes (invalid Bootstrap grid). After consolidateRows that
     * reflows rows, that column can drop to the bottom; wrapping it in `.row` fixes
     * layout and gives `separator.closest(".row")` a stable anchor for sold-bucket logic.
     */
    function ensureSoldSeparatorWrappedInRow() {
      if (isExceptionalModernHeroMode()) {
        return;
      }
      const listingsContainer = document.getElementById("listingsContainer");
      if (!listingsContainer) {
        return;
      }
      const sep = listingsContainer.querySelector(".unavailablePropertiesSeparatorWrapper");
      if (!sep || !sep.isConnected) {
        return;
      }
      const hostRow = sep.closest(".row");
      if (hostRow) {
        if (hostRow.querySelector(".listings-item-wrapper")) {
          const row = document.createElement("div");
          row.className = "row";
          row.setAttribute("data-nnpilot-sold-separator-row", "");
          row.appendChild(sep);
          const par = hostRow.parentNode;
          const insertInsideListings =
            par &&
            (par === listingsContainer || listingsContainer.contains(par));
          if (insertInsideListings) {
            par.insertBefore(row, hostRow.nextSibling);
          } else {
            /* #listingsContainer.row (or host parent outside tree): par.insertBefore would park sep outside #listingsContainer — getUnavailableSoldSeparatorEl then returns null (see debug H1). */
            listingsContainer.appendChild(row);
          }
        }
        return;
      }
      const row = document.createElement("div");
      row.className = "row";
      row.setAttribute("data-nnpilot-sold-separator-row", "");
      const parent = sep.parentElement;
      if (!parent) {
        return;
      }
      parent.insertBefore(row, sep);
      row.appendChild(sep);
    }

    function isDomStrictlyAfterSeparator(node, separatorEl) {
      if (!separatorEl || !node || !separatorEl.isConnected || !node.isConnected) {
        return false;
      }
      return Boolean(
        separatorEl.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    }

    function foldListingStatusText(s) {
      return String(s || "")
        .replace(/\u00a0/g, " ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    }

    function listingWrapperLooksSoldSignedOrReserved(wrapper) {
      if (!wrapper) {
        return false;
      }
      const t = foldListingStatusText(wrapper.textContent);
      return (
        /\b(sold|signed|reserved|rented|loue|vendu|vendue|compromis|reserve|reservee)\b/i.test(t) ||
        /\bsous\s+compromis\b/i.test(t) ||
        /\bsous\s+reserv/i.test(t)
      );
    }

    /** For-sale card: not sold/signed by copy, and not strictly after the unavailable separator in DOM. */
    function isWrapperForSale(wrapper, sepEl) {
      if (!wrapper) {
        return true;
      }
      if (listingWrapperLooksSoldSignedOrReserved(wrapper)) {
        return false;
      }
      if (sepEl && sepEl.isConnected && isDomStrictlyAfterSeparator(wrapper, sepEl)) {
        return false;
      }
      return true;
    }

    /**
     * Walk `.listings-item-wrapper` in document order and insert the separator row before the first
     * “sold bucket” card (text or post-separator), or after the last for-sale card if every card is for sale.
     * Works even when Nexvia parks the separator at the end of the tree.
     */
    function placeSoldSeparatorRowBetweenForSaleAndSold(container, sep, sepRow) {
      if (isExceptionalModernHeroMode()) {
        return;
      }
      if (!container || !sep || !sepRow || !sep.isConnected || !sepRow.isConnected) {
        return;
      }
      const wrappers = Array.from(container.querySelectorAll(".listings-item-wrapper"));
      if (!wrappers.length) {
        return;
      }
      let firstSoldIdx = -1;
      for (let i = 0; i < wrappers.length; i++) {
        if (!isWrapperForSale(wrappers[i], sep)) {
          firstSoldIdx = i;
          break;
        }
      }
      if (firstSoldIdx === -1) {
        const lastW = wrappers[wrappers.length - 1];
        const anchorRow = lastW.closest(".row");
        if (!anchorRow || anchorRow === sepRow || !anchorRow.parentNode) {
          return;
        }
        anchorRow.parentNode.insertBefore(sepRow, anchorRow.nextSibling);
        return;
      }
      const soldAnchorRow = wrappers[firstSoldIdx].closest(".row");
      if (!soldAnchorRow || soldAnchorRow === sepRow || !soldAnchorRow.parentNode) {
        return;
      }
      soldAnchorRow.parentNode.insertBefore(sepRow, soldAnchorRow);
    }

    function listingIsSoldBucketForWrapper(wrapper, separatorEl) {
      const parentRow = wrapper.closest(".row");
      if (!parentRow) {
        return false;
      }
      if (parentRow.querySelector(".unavailablePropertiesSeparatorWrapper")) {
        return false;
      }
      return !isWrapperForSale(wrapper, separatorEl);
    }

    function listingMatchesSoldBucketForFilters(listing, soldSep) {
      if (!listing || !soldSep || !soldSep.isConnected) {
        return false;
      }
      return !isWrapperForSale(listing, soldSep);
    }

    function rescanListingsContainerActiveRow() {
      const listingsContainer = document.getElementById("listingsContainer");
      if (!listingsContainer) {
        return null;
      }
      const separator = getUnavailableSoldSeparatorEl();
      const separatorRow = separator ? separator.closest(".row") : null;
      for (const w of listingsContainer.querySelectorAll(".listings-item-wrapper")) {
        const row = w.closest(".row");
        if (!row) {
          continue;
        }
        if (separatorRow && row === separatorRow) {
          continue;
        }
        if (row.querySelector(".unavailablePropertiesSeparatorWrapper")) {
          continue;
        }
        const isSold = listingIsSoldBucketForWrapper(w, separator);
        if (!isSold) {
          return row;
        }
      }
      return null;
    }

    function ensureUnavailableSoldSeparatorVisible() {
      if (isExceptionalModernHeroMode()) {
        return;
      }
      const root = document.getElementById("listingsContainer");
      if (!root) {
        return;
      }
      const sep = root.querySelector(".unavailablePropertiesSeparatorWrapper");
      if (!sep || !sep.isConnected) {
        return;
      }
      let el = sep;
      while (el && el !== root) {
        el.style.removeProperty("display");
        el = el.parentElement;
      }
    }

    function consolidateRows() {
      const listingsContainer = document.getElementById("listingsContainer");
      if (!listingsContainer) {
        nnpilotListingsActiveRow = null;
        return;
      }
      ensureSoldSeparatorWrappedInRow();
      let separator = getUnavailableSoldSeparatorEl();
      let separatorRow = separator ? separator.closest(".row") : null;
      placeSoldSeparatorRowBetweenForSaleAndSold(listingsContainer, separator, separatorRow);
      separator = getUnavailableSoldSeparatorEl();
      separatorRow = separator ? separator.closest(".row") : null;
      const seen = new Set();
      let masterActiveRow = null;
      let masterSoldRow = null;
      for (const w of listingsContainer.querySelectorAll(".listings-item-wrapper")) {
        let col = getListingColumnishEl(w);
        if (col == null) {
          continue;
        }
        if (
          col.classList.contains("unavailablePropertiesSeparatorWrapper") ||
          col.querySelector(".unavailablePropertiesSeparatorWrapper")
        ) {
          continue;
        }
        if (seen.has(col)) {
          continue;
        }
        if (!col.querySelector(".listings-item-wrapper")) {
          continue;
        }
        const parentRow = w.closest(".row");
        if (!parentRow || parentRow === separatorRow) {
          continue;
        }
        if (parentRow.querySelector(".unavailablePropertiesSeparatorWrapper")) {
          continue;
        }
        if (
          separator &&
          (col === separator || col.contains(separator) || separator.contains(col))
        ) {
          continue;
        }
        seen.add(col);
        const isSold = listingIsSoldBucketForWrapper(w, separator);
        if (!isSold) {
          if (!masterActiveRow) {
            masterActiveRow = parentRow;
          } else if (parentRow !== masterActiveRow) {
            masterActiveRow.appendChild(col);
          }
        } else {
          if (!masterSoldRow) {
            masterSoldRow = parentRow;
          } else if (parentRow !== masterSoldRow) {
            masterSoldRow.appendChild(col);
          }
        }
      }
      nnpilotListingsActiveRow = masterActiveRow;
      if (nnpilotListingsActiveRow == null) {
        nnpilotListingsActiveRow = rescanListingsContainerActiveRow();
      }
      separator = getUnavailableSoldSeparatorEl();
      separatorRow = separator ? separator.closest(".row") : null;
      placeSoldSeparatorRowBetweenForSaleAndSold(listingsContainer, separator, separatorRow);
      listingsContainer.querySelectorAll(".row").forEach((row) => {
        if (row.querySelector(".unavailablePropertiesSeparatorWrapper")) {
          if (isExceptionalModernHeroMode()) {
            row.style.setProperty("display", "none", "important");
            return;
          }
          row.style.removeProperty("display");
          return;
        }
        if (row !== masterActiveRow && row !== masterSoldRow && row !== separatorRow && row.children.length === 0) {
          row.style.display = "none";
        }
      });
      ensureUnavailableSoldSeparatorVisible();
    }

    function getMasterActiveRow() {
      if (
        nnpilotListingsActiveRow != null &&
        nnpilotListingsActiveRow.isConnected &&
        nnpilotListingsActiveRow.querySelector(".listings-item-wrapper")
      ) {
        return nnpilotListingsActiveRow;
      }
      nnpilotListingsActiveRow = rescanListingsContainerActiveRow();
      return nnpilotListingsActiveRow;
    }
    function getActiveListingColumnElements(masterRow) {
      const byCol = new Set();
      for (const w of masterRow.querySelectorAll(".listings-item-wrapper")) {
        const col = getListingColumnishEl(w) || w;
        if (col) {
          byCol.add(col);
        }
      }
      if (byCol.size > 0) {
        return Array.from(byCol);
      }
      return Array.from(masterRow.querySelectorAll(".col-md-6")).filter(
        (c) => c.querySelector && c.querySelector(".listings-item-wrapper")
      );
    }
    function applyListingSort() {
      const masterRow = getMasterActiveRow();
      if (!masterRow) {
        return;
      }
      const cols = getActiveListingColumnElements(masterRow);
      for (const c of cols) {
        if (c.dataset.nnpilotServerOrder == null || c.dataset.nnpilotServerOrder === "") {
          c.dataset.nnpilotServerOrder = String(listingOrderSeq++);
        }
      }
      let ordered;
      if (listingSortMode === "date") {
        ordered = [...cols].sort(
          (a, b) =>
            parseInt(a.dataset.nnpilotServerOrder, 10) - parseInt(b.dataset.nnpilotServerOrder, 10)
        );
      } else {
        const withP = cols.map((col) => {
          return { col, p: extractPriceEurForColumn(col) };
        });
        withP.sort((a, b) => {
          const an = a.p;
          const bn = b.p;
          if (an == null && bn == null) {
            return 0;
          }
          if (an == null) {
            return 1;
          }
          if (bn == null) {
            return -1;
          }
          if (listingSortMode === "price-asc") {
            return an - bn;
          }
          return bn - an;
        });
        ordered = withP.map((x) => x.col);
      }
      if (ordered.length === 0) {
        return;
      }
      const host = ordered[0].parentNode;
      if (!host) {
        return;
      }
      const orderedSet = new Set(ordered);
      const listingChildrenInDomOrder = Array.from(host.children).filter((n) =>
        orderedSet.has(n)
      );
      if (
        listingChildrenInDomOrder.length === ordered.length &&
        listingChildrenInDomOrder.every((node, i) => node === ordered[i])
      ) {
        return;
      }
      for (const col of ordered) {
        host.appendChild(col);
      }
    }

    function applyClientFilters() {
      syncExcCheckboxFromUrl();
      const dragPrice = priceThumbDragging;
      const colNearSel =
        ".col-md-6, .col-md-12, .col-sm-6, .col-sm-12, .col-6, [class*=\"col-md-\" i], [class*=\"col-sm-\" i]";
      ensureListingsSortBarInContainer();
      if (!dragPrice) {
        consolidateRows();
        recomputePriceBoundsAndClamp();
        updatePriceUi();
      }
      const pMin = priceUserMin;
      const pMax = priceUserMax;
      const priceNarrowed = isPriceFilterNarrowed();
      const soldSep = getUnavailableSoldSeparatorEl();
      const listings = document.querySelectorAll(".listings-item-wrapper");
      listings.forEach((listing) => {
        if (soldSep && listingMatchesSoldBucketForFilters(listing, soldSep)) {
          const colShow = listing.closest(colNearSel);
          if (colShow) {
            colShow.style.removeProperty("display");
          }
          return;
        }
        if (!listingMatchesClientBase(listing)) {
          const colWrapper0 = listing.closest(colNearSel);
          if (
            colWrapper0 &&
            !colWrapper0.classList.contains("unavailablePropertiesSeparatorWrapper") &&
            !colWrapper0.closest(".unavailablePropertiesSeparatorWrapper")
          ) {
            colWrapper0.style.display = "none";
          }
          return;
        }
        const eur = extractPriceEurFromListing(listing);
        let matchesPrice;
        if (!priceNarrowed) {
          matchesPrice = eur == null || (eur >= pMin && eur <= pMax);
        } else if (eur == null) {
          matchesPrice = false;
        } else {
          matchesPrice = eur >= pMin && eur <= pMax;
        }
        const colWrapper = listing.closest(colNearSel);
        if (
          colWrapper &&
          !colWrapper.classList.contains("unavailablePropertiesSeparatorWrapper") &&
          !colWrapper.closest(".unavailablePropertiesSeparatorWrapper")
        ) {
          colWrapper.style.display = matchesPrice ? "" : "none";
        }
      });
      if (!dragPrice) {
        applyListingSort();
        /* Rebuilding hood menus nukes `ul`/`li` on every listings mutation (MutationObserver → applyClientFilters).
           While a menu is open, that destroys nodes under the cursor and causes visible flashing. */
        if (luxHoodMenu.hidden) {
          rebuildLuxHoodMenuFromDom();
        } else {
          applyLuxHoodInputsFromState();
        }
        if (outHoodMenu.hidden) {
          rebuildOutsideHoodMenuFromDom();
        } else {
          applyOutHoodInputsFromState();
          applyOutHoodSearchFilter();
        }
        ensureUnavailableSoldSeparatorVisible();
      }
      updateResetFiltersButton();
      refreshExcHeroListingsClass();
      try {
        window.dispatchEvent(new CustomEvent("nnpilot-listing-filters-applied", { bubbles: true }));
      } catch {
        // ignore
      }
    }

    function triggerNativeFilter() {
      const h = houseNode.input.checked;
      const a = aptNode.input.checked;
      const e = excNode.input.checked;
      const targetDataFilter = e ? "outstanding" : h && a ? "" : h ? "house" : "apartment";
      const targetLink = oldNav.querySelector(`a[data-titletabsfilter="${targetDataFilter}"]`);
      if (targetLink) targetLink.click();
    }

    /**
     * When the site navigates off /buy/outstanding, clear a stale exceptional checkbox.
     * Do not clear when still on another tab but the user just checked exceptional (URL not updated yet).
     */
    function syncExcCheckboxFromUrl() {
      if (!excNode || !excNode.input) {
        return;
      }
      const p = typeof window !== "undefined" ? window.location.pathname : "";
      const wasOnOutstanding = lastPathnameForExcSync.includes("/buy/outstanding");
      const onOutstanding = p.includes("/buy/outstanding");
      lastPathnameForExcSync = p;
      if (!onOutstanding && excNode.input.checked && wasOnOutstanding) {
        excNode.input.checked = false;
      }
    }

    function syncUI() {
      syncExcCheckboxFromUrl();
      const e = excNode.input.checked;
      if (e) {
        houseNode.input.checked = true;
        aptNode.input.checked = true;
      }
      const h = houseNode.input.checked;
      const a = aptNode.input.checked;
      const l = luxCityNode.input.checked;
      const o = outsideNode.input.checked;
      houseNode.label.classList.toggle("is-checked", h);
      aptNode.label.classList.toggle("is-checked", a);
      excNode.label.classList.toggle("is-checked-exc", e);
      luxCityNode.label.classList.toggle("is-checked", l);
      outsideNode.label.classList.toggle("is-checked", o);
      /* Same as lux/outside when both selected: not locked in exc mode so cursor stays pointer (snap out via chip click). */
      houseNode.label.classList.toggle("is-locked", h && !a && !e);
      aptNode.label.classList.toggle("is-locked", a && !h && !e);
      luxCityNode.label.classList.toggle("is-locked", l && !o);
      outsideNode.label.classList.toggle("is-locked", o && !l);
      luxHoodToggle.disabled = e;
      outHoodToggle.disabled = e;
      if (luxHoodToggle.disabled) {
        closeLuxHoodMenu();
      }
      if (outHoodToggle.disabled) {
        closeOutsideHoodMenu();
      }
      const excMode = e;
      houseNode.label.classList.toggle("is-filter-muted", excMode);
      aptNode.label.classList.toggle("is-filter-muted", excMode);
      luxCityNode.label.classList.toggle("is-filter-muted", excMode);
      outsideNode.label.classList.toggle("is-filter-muted", excMode);
      if (countersRow) countersRow.classList.toggle("is-filter-muted", excMode);
      if (priceBlockRef.el) priceBlockRef.el.classList.toggle("is-filter-muted", excMode);
      if (excMode) {
        closeSortListingsMenu();
      }
      sortListingsBar.hidden = excMode;
      updateResetFiltersButton();
      refreshExcHeroListingsClass();
    }

    function exitExceptionalIfOn() {
      if (!excNode.input.checked) return false;
      excNode.input.checked = false;
      syncUI();
      triggerNativeFilter();
      return true;
    }

    function buildPriceRangeUI() {
      const block = document.createElement("div");
      block.className = "nnpilot-price-block counter-section";
      priceBlockRef.el = block;

      const h = document.createElement("span");
      h.className = "modern-filters-title";
      h.textContent = "Price";

      const wrap = document.createElement("div");
      wrap.className = "nnpilot-price-rail__wrap";
      const track = document.createElement("div");
      track.className = "nnpilot-price-rail__track";
      const fill = document.createElement("div");
      fill.className = "nnpilot-price-rail__fill";
      track.appendChild(fill);

      const makeThumb = (isMax) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "nnpilot-price-rail__thumb" + (isMax ? " nnpilot-price-rail__thumb--max" : "");
        b.setAttribute("aria-label", isMax ? "Maximum price" : "Minimum price");
        b.setAttribute("role", "slider");
        b.setAttribute("data-thumb", isMax ? "max" : "min");
        return b;
      };
      const thumbMin = makeThumb(false);
      const thumbMax = makeThumb(true);

      const axis = document.createElement("div");
      axis.className = "nnpilot-price-rail__axis";
      const axisL = document.createElement("span");
      axisL.className = "nnpilot-price-rail__label";
      const axisR = document.createElement("span");
      axisR.className = "nnpilot-price-rail__label";
      axis.append(axisL, axisR);
      const setStackedLabel = (el, amount, role) => {
        el.replaceChildren();
        const val = document.createElement("span");
        val.className = "nnpilot-price-rail__value";
        val.textContent = amount;
        const tag = document.createElement("span");
        tag.className = "nnpilot-price-rail__tag";
        tag.textContent = role;
        el.append(val, tag);
      };
      const railRoot = document.createElement("div");
      railRoot.className = "nnpilot-price-rail";
      wrap.append(track, thumbMin, thumbMax);
      railRoot.append(wrap, axis);
      block.append(h, railRoot);

      let priceSnapStopsKey = "";
      /** @type { number[] | null } */
      let priceSnapStopsList = null;
      function getPriceSnapStops() {
        const key = `${priceRangeMin}\0${priceRangeMax}`;
        if (priceSnapStopsKey === key && priceSnapStopsList) {
          return priceSnapStopsList;
        }
        priceSnapStopsKey = key;
        priceSnapStopsList = enumeratePriceSnapStops(priceRangeMin, priceRangeMax);
        return priceSnapStopsList;
      }

      function clientXToVal(clientX) {
        const stops = getPriceSnapStops();
        if (stops.length === 0) {
          return priceUserMin;
        }
        if (stops.length === 1) {
          return stops[0];
        }
        const r = track.getBoundingClientRect();
        if (r.width <= 0) {
          return priceUserMin;
        }
        const t = (clientX - r.left) / r.width;
        const tCl = Math.max(0, Math.min(1, t));
        const idx = Math.round(tCl * (stops.length - 1));
        return stops[Math.max(0, Math.min(stops.length - 1, idx))];
      }
      const render = () => {
        const w0 = priceRangeMax - priceRangeMin;
        if (w0 <= 0) {
          setStackedLabel(
            axisL,
            priceUserMin != null ? formatPriceK(priceUserMin) : "—",
            "Min"
          );
          setStackedLabel(
            axisR,
            priceUserMax != null ? formatPriceK(priceUserMax) : "—",
            "Max"
          );
          axisL.style.left = "0%";
          axisR.style.left = "100%";
          fill.style.width = "0%";
          thumbMin.style.left = "0%";
          thumbMax.style.left = "100%";
          return;
        }
        const stops = getPriceSnapStops();
        const p0 = euroToUniformPositionPct(priceUserMin, stops);
        const p1 = euroToUniformPositionPct(priceUserMax, stops);
        setStackedLabel(axisL, formatPriceK(priceUserMin), "Min");
        setStackedLabel(axisR, formatPriceK(priceUserMax), "Max");
        axisL.style.left = p0 + "%";
        axisR.style.left = p1 + "%";
        fill.style.left = p0 + "%";
        fill.style.width = Math.max(0, p1 - p0) + "%";
        thumbMin.style.left = p0 + "%";
        thumbMax.style.left = p1 + "%";
        thumbMin.setAttribute("aria-valuemin", String(priceRangeMin));
        thumbMin.setAttribute("aria-valuemax", String(Math.min(priceUserMax - MIN_THUMB_GAP, priceRangeMax)));
        thumbMin.setAttribute("aria-valuenow", String(priceUserMin));
        thumbMax.setAttribute("aria-valuemin", String(Math.max(priceUserMin + MIN_THUMB_GAP, priceRangeMin)));
        thumbMax.setAttribute("aria-valuemax", String(priceRangeMax));
        thumbMax.setAttribute("aria-valuenow", String(priceUserMax));
      };
      updatePriceUi = render;

      track.addEventListener("click", (e) => {
        if (e.target === thumbMin || e.target === thumbMax) return;
        exitExceptionalIfOn();
        const v = clientXToVal(e.clientX);
        const dMin = Math.abs(v - priceUserMin);
        const dMax = Math.abs(v - priceUserMax);
        if (dMin <= dMax) {
          priceUserMin = snapPriceEur(
            Math.min(v, Math.max(priceRangeMin, priceUserMax - MIN_THUMB_GAP))
          );
        } else {
          priceUserMax = snapPriceEur(
            Math.max(v, Math.min(priceRangeMax, priceUserMin + MIN_THUMB_GAP))
          );
        }
        render();
        applyClientFilters();
      });

      let drag = null;
      const onPointerMove = (e) => {
        if (drag == null) return;
        e.preventDefault();
        const x =
          e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
        if (x == null) return;
        let v = clientXToVal(x);
        if (drag === "min") {
          v = Math.min(v, priceUserMax - MIN_THUMB_GAP);
          v = Math.max(v, priceRangeMin);
          priceUserMin = snapPriceEur(v);
        } else {
          v = Math.max(v, priceUserMin + MIN_THUMB_GAP);
          v = Math.min(v, priceRangeMax);
          priceUserMax = snapPriceEur(v);
        }
        render();
        if (priceDragApplyRaf) {
          cancelAnimationFrame(priceDragApplyRaf);
        }
        priceDragApplyRaf = requestAnimationFrame(() => {
          priceDragApplyRaf = 0;
          applyClientFilters();
        });
      };
      const onPointerUp = () => {
        if (priceDragApplyRaf) {
          cancelAnimationFrame(priceDragApplyRaf);
          priceDragApplyRaf = 0;
        }
        priceThumbDragging = false;
        if (drag != null) {
          drag = null;
          thumbMin.classList.remove("nnpilot-price-rail__thumb--drag");
          thumbMax.classList.remove("nnpilot-price-rail__thumb--drag");
        }
        document.removeEventListener("mousemove", onPointerMove);
        document.removeEventListener("mouseup", onPointerUp);
        document.removeEventListener("touchmove", onPointerMove, true);
        document.removeEventListener("touchend", onPointerUp, true);
        document.removeEventListener("touchcancel", onPointerUp, true);
        applyClientFilters();
      };
      const startDrag = (which) => (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.button != null && e.button !== 0) return;
        exitExceptionalIfOn();
        priceThumbDragging = true;
        drag = which;
        (which === "min" ? thumbMin : thumbMax).classList.add("nnpilot-price-rail__thumb--drag");
        document.addEventListener("mousemove", onPointerMove, { passive: false });
        document.addEventListener("mouseup", onPointerUp);
        document.addEventListener("touchmove", onPointerMove, { capture: true, passive: false });
        document.addEventListener("touchend", onPointerUp, { capture: true });
        document.addEventListener("touchcancel", onPointerUp, { capture: true });
      };
      thumbMin.addEventListener("mousedown", startDrag("min"));
      thumbMax.addEventListener("mousedown", startDrag("max"));
      thumbMin.addEventListener("touchstart", startDrag("min"), { passive: false });
      thumbMax.addEventListener("touchstart", startDrag("max"), { passive: false });

      recomputePriceBoundsAndClamp();
      render();

      return {
        el: block,
        resetToDefault() {
          recomputePriceBoundsAndClamp();
          priceUserMin = priceRangeMin;
          priceUserMax = priceRangeMax;
          render();
        }
      };
    }

    const createCounterSection = (kicker, initialVal, step, minVal, isSqm, onValue) => {
      let val = initialVal;
      const section = document.createElement("div");
      section.className = "counter-section";
      const h = document.createElement("span");
      h.className = "modern-filters-title";
      h.textContent = kicker;

      const wrapper = document.createElement("div");
      wrapper.className = "modern-counter-chip";
      const minus = document.createElement("div");
      minus.className = "counter-btn";
      minus.setAttribute("role", "button");
      minus.setAttribute("tabindex", "0");
      minus.setAttribute("aria-label", isSqm ? "Decrease minimum surface" : "Decrease minimum bedrooms");
      const minusText = document.createElement("span");
      minusText.className = "counter-btn-txt";
      minusText.textContent = "−";
      minus.appendChild(minusText);

      const display = document.createElement("div");
      let refreshDisplay;
      if (isSqm) {
        display.className = "counter-val counter-val--sqm";
        const numEl = document.createElement("span");
        numEl.className = "counter-val__num";
        const unitEl = document.createElement("span");
        unitEl.className = "counter-val__unit";
        unitEl.textContent = "sqm";
        display.append(numEl, unitEl);
        refreshDisplay = () => {
          numEl.textContent = `${val}+`;
        };
      } else {
        display.className = "counter-val";
        refreshDisplay = () => {
          display.textContent = `${val}+`;
        };
      }
      refreshDisplay();

      const plus = document.createElement("div");
      plus.className = "counter-btn";
      plus.setAttribute("role", "button");
      plus.setAttribute("tabindex", "0");
      plus.setAttribute("aria-label", isSqm ? "Increase minimum surface" : "Increase minimum bedrooms");
      const plusText = document.createElement("span");
      plusText.className = "counter-btn-txt";
      plusText.textContent = "+";
      plus.appendChild(plusText);

      const setMinusDisabled = (dis) => {
        if (dis) {
          minus.classList.add("is-disabled");
          minus.setAttribute("aria-disabled", "true");
          minus.setAttribute("tabindex", "-1");
          minusText.textContent = "−";
          minus.title = isSqm ? "Minimum already reached" : "Minimum already reached (0+)";
        } else {
          minus.classList.remove("is-disabled");
          minus.setAttribute("tabindex", "0");
          minus.setAttribute("aria-disabled", "false");
          minusText.textContent = "−";
          minus.removeAttribute("title");
        }
      };
      setMinusDisabled(val <= minVal);

      const bump = (delta) => {
        if (exitExceptionalIfOn()) return;
        if (delta < 0 && val <= minVal) return;
        val += delta;
        if (val < minVal) val = minVal;
        refreshDisplay();
        setMinusDisabled(val <= minVal);
        onValue(val);
      };

      display.addEventListener("click", (e) => {
        if (exitExceptionalIfOn()) e.preventDefault();
      });

      minus.addEventListener("click", (e) => {
        e.preventDefault();
        bump(-step);
      });
      plus.addEventListener("click", (e) => {
        e.preventDefault();
        bump(step);
      });
      [minus, plus].forEach((b) => {
        b.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            b.click();
          }
        });
      });

      wrapper.append(minus, display, plus);
      section.append(h, wrapper);

      const defaultReset = isSqm ? 10 : 0;
      const resetToDefault = () => {
        val = defaultReset;
        if (val < minVal) val = minVal;
        refreshDisplay();
        setMinusDisabled(val <= minVal);
        onValue(val);
      };

      return { section, resetToDefault };
    };

    const bedState = createCounterSection("Bedrooms", 0, 1, 0, false, (v) => {
      bedCount = v;
      applyClientFilters();
    });
    const sqmState = createCounterSection("Surface", 10, 10, 10, true, (v) => {
      sqmCount = v;
      applyClientFilters();
    });
    const bedSec = bedState.section;
    const sqmSec = sqmState.section;

    const counterDivider = document.createElement("div");
    counterDivider.className = "modern-vertical-divider modern-vertical-divider--counters";
    counterDivider.setAttribute("role", "presentation");
    const priceCounterDivider = document.createElement("div");
    priceCounterDivider.className = "modern-vertical-divider modern-vertical-divider--counters";
    priceCounterDivider.setAttribute("role", "presentation");
    const priceBlock = buildPriceRangeUI();

    let filterTimeout;
    const FILTER_APPLY_DEBOUNCE_MS = 50;
    function scheduleApplyClientFilters() {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => {
        filterTimeout = undefined;
        applyClientFilters();
      }, FILTER_APPLY_DEBOUNCE_MS);
    }
    let excPriceAfterNativeTimeout = 0;
    function resetAllFiltersToInitial() {
      clearTimeout(filterTimeout);
      filterTimeout = undefined;
      luxHoodMenuLastSig = null;
      outHoodMenuLastSig = null;
      clearTimeout(excPriceAfterNativeTimeout);
      excPriceAfterNativeTimeout = 0;
      closeSortListingsMenu();
      closeLuxHoodMenu();
      closeOutsideHoodMenu();
      luxNeighbourhoodAll = true;
      luxNeighbourhoodSelected.clear();
      outsideNeighbourhoodAll = true;
      outsideNeighbourhoodSelected.clear();
      priceRosterRawMin = null;
      priceRosterRawMax = null;
      listingSortMode = "date";
      syncSortUiToMode();
      houseNode.input.checked = true;
      aptNode.input.checked = true;
      luxCityNode.input.checked = true;
      outsideNode.input.checked = true;
      excNode.input.checked = false;
      bedState.resetToDefault();
      sqmState.resetToDefault();
      priceBlock.resetToDefault();
      syncUI();
      triggerNativeFilter();
      applyClientFilters();
    }

    countersRow = document.createElement("div");
    countersRow.className = "modern-filters-counters-row";
    countersRow.append(bedSec, counterDivider, sqmSec, priceCounterDivider, priceBlock.el);

    const advancedDetails = document.createElement("details");
    advancedDetails.className = "nnpilot-advanced-filters__details";
    const advSummary = document.createElement("summary");
    advSummary.className = "nnpilot-advanced-filters__summary";
    const advLabel = document.createElement("span");
    advLabel.textContent = "Advanced filters";
    const advChev = document.createElement("span");
    advChev.className = "material-symbols-outlined nnpilot-advanced-filters__chev";
    advChev.textContent = "expand_more";
    advSummary.append(advChev, advLabel);
    const advBody = document.createElement("div");
    advBody.className = "nnpilot-advanced-filters__body";
    const advSizer = document.createElement("div");
    advSizer.className = "nnpilot-advanced-filters__sizer";
    const advInner = document.createElement("div");
    advInner.className = "nnpilot-advanced-filters__inner";
    const advFoot = document.createElement("div");
    advFoot.className = "nnpilot-advanced-filters__inner-foot";
    const resetFiltersBtn = document.createElement("button");
    resetFiltersBtn.type = "button";
    resetFiltersBtn.className = "nnpilot-advanced-filters__reset";
    resetFiltersBtn.textContent = "Reset filters";
    resetFiltersBtn.setAttribute("aria-label", "Reset all filters to defaults");
    resetFiltersBtn.addEventListener("click", () => {
      resetAllFiltersToInitial();
    });
    advFoot.appendChild(resetFiltersBtn);
    updateResetFiltersButton = function () {
      if (!resetFiltersBtn) return;
      resetFiltersBtn.disabled = isAtDefaultFilterState();
    };
    advInner.append(countersRow, advFoot);
    advSizer.appendChild(advInner);
    advBody.appendChild(advSizer);
    advancedDetails.append(advSummary, advBody);
    container.append(typeTitleLabel, topRowWrapper, advancedDetails);
    oldNav.parentNode.insertBefore(container, oldNav);
    if (!tryInstallListingsSort()) {
      const so = new MutationObserver(() => {
        if (tryInstallListingsSort()) {
          so.disconnect();
        }
      });
      so.observe(document.body, { childList: true, subtree: true });
    }

    topRowWrapper.addEventListener(
      "click",
      (e) => {
        if (!excNode.input.checked) return;
        const lab = e.target.closest("label.modern-chip-label");
        if (!lab || lab === excNode.label) return;
        e.preventDefault();
        e.stopPropagation();
        excNode.input.checked = false;
        syncUI();
        triggerNativeFilter();
      },
      true
    );

    houseNode.input.addEventListener("change", function () {
      if (!this.checked && !aptNode.input.checked) {
        this.checked = true;
        return;
      }
      if (excNode.input.checked) excNode.input.checked = false;
      syncUI();
      triggerNativeFilter();
    });
    aptNode.input.addEventListener("change", function () {
      if (!this.checked && !houseNode.input.checked) {
        this.checked = true;
        return;
      }
      if (excNode.input.checked) excNode.input.checked = false;
      syncUI();
      triggerNativeFilter();
    });
    excNode.input.addEventListener("change", function () {
      if (this.checked) {
        if (!houseNode.input.checked) houseNode.input.checked = true;
        if (!aptNode.input.checked) aptNode.input.checked = true;
      } else {
        houseNode.input.checked = true;
        aptNode.input.checked = true;
      }
      syncUI();
      triggerNativeFilter();
      if (this.checked) {
        clearTimeout(excPriceAfterNativeTimeout);
        excPriceAfterNativeTimeout = setTimeout(() => {
          excPriceAfterNativeTimeout = 0;
          recomputePriceBoundsAndClamp();
          priceUserMin = priceRangeMin;
          priceUserMax = priceRangeMax;
          updatePriceUi();
          applyClientFilters();
        }, 450);
      } else {
        clearTimeout(excPriceAfterNativeTimeout);
        excPriceAfterNativeTimeout = 0;
      }
    });
    luxCityNode.input.addEventListener("change", function () {
      if (!this.checked && !outsideNode.input.checked) {
        this.checked = true;
        return;
      }
      if (!this.checked) {
        closeLuxHoodMenu();
      }
      syncUI();
      applyClientFilters();
    });
    outsideNode.input.addEventListener("change", function () {
      if (!this.checked && !luxCityNode.input.checked) {
        this.checked = true;
        return;
      }
      if (!this.checked) {
        closeOutsideHoodMenu();
      }
      syncUI();
      applyClientFilters();
    });

    const targetContainer = document.getElementById("listingsContainer") || document.body;
    const domObserver = new MutationObserver((muts) => {
      const needs = muts.some((m) => m.addedNodes.length > 0);
      if (needs) {
        scheduleApplyClientFilters();
      }
    });
    domObserver.observe(targetContainer, { childList: true, subtree: true });
    syncUI();
    applyClientFilters();

    const historyUrlSyncKey = () =>
      typeof location !== "undefined" ? `${location.pathname}${location.search}` : "";
    let lastUrlSyncKey = historyUrlSyncKey();

    function onBuyListingsPathMaybeChanged() {
      /**
       * In-app history updates can fire very often (same URL) — re-running
       * applyClientFilters is unusably expensive. Only sync when path/query changed.
       */
      const k = historyUrlSyncKey();
      if (k === lastUrlSyncKey) {
        return;
      }
      lastUrlSyncKey = k;
      syncExcCheckboxFromUrl();
      syncUI();
      scheduleApplyClientFilters();
    }

    window.addEventListener("popstate", function () {
      onBuyListingsPathMaybeChanged();
    });

    try {
      const h = history;
      const psh = h.pushState;
      const rps = h.replaceState;
      if (typeof psh === "function" && typeof rps === "function") {
        h.pushState = function () {
          psh.apply(h, arguments);
          onBuyListingsPathMaybeChanged();
        };
        h.replaceState = function () {
          rps.apply(h, arguments);
          onBuyListingsPathMaybeChanged();
        };
      }
    } catch {
      // ignore
    }

    window.addEventListener("pageshow", (ev) => {
      if (ev.persisted) {
        resetAllFiltersToInitial();
      }
    });

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes[ENABLE_SORTING_KEY]) return;
        const on = changes[ENABLE_SORTING_KEY].newValue !== false;
        sortListingsWrap.hidden = !on;
      });
    } catch {
      // ignore
    }
  }
})();
