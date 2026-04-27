(function () {
  "use strict";

  if (window.nnNexviaMapViewLoaded) return;
  window.nnNexviaMapViewLoaded = true;

  const TOOL_KEY = "tool.nexviaMapView";
  const PARENT_TOOL_KEY = "tool.advancedNexviaFilters";
  /** 0 = only same-coordinate pins merge; 100 = merge pins within ~88px on screen at current zoom. */
  const CLUSTER_FLEX_KEY = "option.nexviaMapView.clusterFlexibility";
  const CLUSTER_FLEX_DEFAULT = 20;
  /** Max screen distance (px) between pin centres to merge into one cluster at flexibility 100. */
  const CLUSTER_MAX_RADIUS_PX = 88;
  const CACHE_KEY = "nnpilotListingCoordsV2";
  const TILE_SIZE = 256;
  const TILE_SUBDOMAINS = ["a", "b", "c", "d"];
  /** Slightly south of geometric centre so the south of the country is not clipped at default zoom. */
  const DEFAULT_CENTER = { lat: 49.52, lon: 6.14 };
  const DEFAULT_ZOOM = 12;
  const MIN_ZOOM = 8;
  const MAX_ZOOM = 17;
  const FETCH_CONCURRENCY = 5;
  /**
   * TEMP: when `true`, marker listing hover is not closed on mouseleave (or map re-render), so you can
   * tweak CSS in DevTools. Set to `false` before shipping. Leaving map mode still clears the tooltip.
   */
  const DEBUG_KEEP_MAP_LISTING_HOVER_OPEN = false;

  (async function boot() {
    try {
      const parentOn = self.__npToolEnabled
        ? await self.__npToolEnabled(PARENT_TOOL_KEY, true)
        : (await chrome.storage.sync.get({ [PARENT_TOOL_KEY]: true }))[PARENT_TOOL_KEY];
      if (parentOn === false) return;

      const mapOn = self.__npToolEnabled
        ? await self.__npToolEnabled(TOOL_KEY, true)
        : (await chrome.storage.sync.get({ [TOOL_KEY]: true }))[TOOL_KEY];
      if (mapOn === false) return;
    } catch {
      // default on
    }

    let clusterFlexibility = CLUSTER_FLEX_DEFAULT;
    try {
      const cr = await chrome.storage.sync.get({ [CLUSTER_FLEX_KEY]: CLUSTER_FLEX_DEFAULT });
      const n = parseInt(String(cr[CLUSTER_FLEX_KEY]), 10);
      if (Number.isFinite(n)) clusterFlexibility = Math.min(100, Math.max(0, n));
    } catch {
      clusterFlexibility = CLUSTER_FLEX_DEFAULT;
    }

    if (!/\/buy(?:\/|$|\?)/i.test(window.location.pathname + window.location.search)) return;
    run(clusterFlexibility);
  })();

  function addStyles(css) {
    const s = document.createElement("style");
    s.setAttribute("data-nnpilot", "nexvia-map-view");
    s.textContent = css;
    document.head.appendChild(s);
  }

  function tileUrl(z, x, y) {
    const s = TILE_SUBDOMAINS[Math.abs(x + y) % 4];
    return `https://${s}.basemaps.cartocdn.com/light_all/${z}/${x}/${y}.png`;
  }

  function hrefCacheKey(href) {
    try {
      return String(href || "").split("?")[0];
    } catch {
      return String(href || "");
    }
  }

  /**
   * Nexvia detail pages set explicit globals before `#listing-map` (see `listing-map-wrapper` script).
   * @param {string} html
   * @returns {{ lat: number, lon: number } | null}
   */
  function coordsFromNexviaMapGlobals(html) {
    const latM = html.match(/(?:window\.)?mapLatitude\s*=\s*([-+\d.eE]+)/i);
    const lonM = html.match(/(?:window\.)?mapLongitude\s*=\s*([-+\d.eE]+)/i);
    if (!latM || !lonM) return null;
    const lat = parseFloat(latM[1]);
    const lon = parseFloat(lonM[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  /**
   * Nexvia listing pages embed Leaflet; coords may appear as globals, setView([lat, lng], z), etc.
   * @param {string} html
   * @returns {{ lat: number, lon: number } | null}
   */
  function extractCoordsFromListingHtml(html) {
    if (!html || typeof html !== "string") return null;
    const fromGlobals = coordsFromNexviaMapGlobals(html);
    if (fromGlobals) return fromGlobals;
    const patterns = [
      /setView\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/i,
      /\.setView\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/i,
      /flyTo\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/i,
      /L\.marker\s*\(\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/i,
      /LatLng\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i,
      /latLng\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/i,
      /center\s*:\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/i,
      /"latitude"\s*:\s*([\d.]+)[^}\n]{0,120}?"longitude"\s*:\s*([\d.]+)/i,
      /data-lat(?:itude)?\s*=\s*["']([\d.-]+)["'][^>]{0,200}?data-lon(?:gitude)?\s*=\s*["']([\d.-]+)["']/i,
      /data-lat(?:itude)?\s*=\s*["']([\d.-]+)["'][^>]{0,200}?data-lng\s*=\s*["']([\d.-]+)["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        const hit = normalizeLatLonPair(m[1], m[2]);
        if (hit) return hit;
      }
    }
    const gj = html.match(
      /"type"\s*:\s*"Point"[^}]{0,200}?"coordinates"\s*:\s*\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\]/i
    );
    if (gj) {
      return normalizeLatLonPair(gj[2], gj[1]);
    }
    return coordsFromMapboxStyleTiles(html);
  }

  /**
   * Mapbox raster tiles in listing HTML: .../tiles/{z}/{x}/{y}...
   * Uses tile center as a fallback when Leaflet init strings are minified away.
   * @param {string} html
   * @returns {{ lat: number, lon: number } | null}
   */
  function coordsFromMapboxStyleTiles(html) {
    const re = /\/tiles\/(\d+)\/(\d+)\/(\d+)(?:\?|"|'|>|\s)/gi;
    const tiles = [];
    let m;
    while ((m = re.exec(html)) !== null) {
      const z = parseInt(m[1], 10);
      const x = parseInt(m[2], 10);
      const y = parseInt(m[3], 10);
      if (z >= 8 && z <= 22 && x >= 0 && y >= 0) {
        tiles.push({ z, x, y });
      }
    }
    if (!tiles.length) return null;
    const t = tiles[0];
    const n = Math.pow(2, t.z);
    const lon = ((t.x + 0.5) / n) * 360 - 180;
    const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (t.y + 0.5)) / n)));
    const lat = (latRad * 180) / Math.PI;
    return normalizeLatLonPair(lat, lon);
  }

  function normalizeLatLonPair(a, b) {
    const p = parseFloat(a);
    const q = parseFloat(b);
    if (!Number.isFinite(p) || !Number.isFinite(q)) return null;
    if (p >= 48.5 && p <= 51 && q >= 5 && q <= 7.5) return { lat: p, lon: q };
    if (q >= 48.5 && q <= 51 && p >= 5 && p <= 7.5) return { lat: q, lon: p };
    return null;
  }

  function run(initialClusterFlexibility) {
    addStyles(`
      .nnpilot-view-switch {
        position: relative;
        display: inline-flex;
        align-items: stretch;
        vertical-align: middle;
        border-radius: 10px;
        transition: background 0.18s ease;
        flex-shrink: 0;
        min-width: 156px;
      }
      .nnpilot-view-switch:hover {
        background: #f5f5f5;
      }
      .nnpilot-view-switch__highlight {
        position: absolute;
        top: 1px;
        bottom: 1px;
        left: 1px;
        width: calc(50% - 2px);
        border-radius: 9px;
        background: #ddd;
        z-index: 0;
        pointer-events: none;
        opacity: 0;
        transition:
          left 0.45s cubic-bezier(0.22, 1, 0.28, 1),
          opacity 0.2s ease;
      }
      .nnpilot-view-switch:hover .nnpilot-view-switch__highlight {
        opacity: 1;
      }
      .nnpilot-view-switch[data-active-pill="map"] .nnpilot-view-switch__highlight {
        left: calc(50% + 1px);
      }
      .nnpilot-view-switch__btn {
        position: relative;
        z-index: 1;
        flex: 1 1 0;
        min-width: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 28px;
        padding: 0 10px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: #71717a;
        white-space: nowrap;
        cursor: pointer;
        transition: color 0.12s ease;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
      .nnpilot-view-switch__btn:hover {
        color: #52525b;
      }
      .nnpilot-view-switch__btn.is-active {
        background: transparent;
        color: #111;
      }
      .nnpilot-map-view-fallback-toolbar {
        display: flex; flex-direction: row; align-items: center; justify-content: flex-start;
        width: 100%; box-sizing: border-box; margin: 0; padding: 0 0 6px; position: relative; z-index: 2;
      }
      .nnpilot-map-panel {
        display: none; width: 100%; min-height: 560px; margin: 0 0 28px; border-radius: 12px;
        border: 1px solid #cfcfcf; background: #e8e8e8; overflow: hidden; position: relative;
        box-shadow: 0 4px 18px rgba(0,0,0,0.08);
      }
      #listingsContainer.nnpilot-map-view-active > .row,
      #listingsContainer.nnpilot-map-view-active > [class*="col-md-"],
      #listingsContainer.nnpilot-map-view-active > [class*="col-sm-"],
      #listingsContainer.nnpilot-map-view-active > [class*="col-"],
      #listingsContainer.nnpilot-map-view-active > [data-nnpilot-sold-separator-row],
      #listingsContainer.nnpilot-map-view-active > [data-nnpilot-exc-hero-row],
      #listingsContainer.nnpilot-map-view-active > .unavailablePropertiesSeparatorWrapper {
        display: none !important;
      }
      #listingsContainer.nnpilot-map-view-active > .nnpilot-map-panel { display: block; }
      #listingsContainer.nnpilot-map-view-active .nnpilot-listings-sort-wrap {
        display: none !important;
      }
      #listingsContainer.nnpilot-map-view-active .nnpilot-map-hide-unavailable {
        display: none !important;
      }
      body.nnpilot-map-view-active a[href*="/buy/signed" i],
      body.nnpilot-map-view-active a[href*="/buy/sold" i],
      body.nnpilot-map-view-active a[href*="/rent/signed" i],
      body.nnpilot-map-view-active a[href*="/rent/sold" i] {
        display: none !important;
      }
      body.nnpilot-map-view-active li:has(> a[href*="/buy/signed" i]),
      body.nnpilot-map-view-active li:has(> a[href*="/buy/sold" i]),
      body.nnpilot-map-view-active li:has(> a[href*="/rent/signed" i]),
      body.nnpilot-map-view-active li:has(> a[href*="/rent/sold" i]) {
        display: none !important;
      }
      .nnpilot-map-canvas { position: absolute; inset: 0; overflow: hidden; background: #dcdcdc; cursor: grab; }
      .nnpilot-map-canvas.is-dragging { cursor: grabbing; }
      .nnpilot-map-world { position: absolute; inset: 0; will-change: transform; }
      .nnpilot-map-tile { position: absolute; width: 256px; height: 256px; user-select: none; -webkit-user-drag: none; }
      .nnpilot-map-marker {
        position: absolute; transform: translate(-50%, -100%); min-width: 28px; height: 28px; padding: 0 7px;
        border: 2px solid #fff; border-radius: 999px 999px 999px 3px; background: #111; color: #fff;
        display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 800;
        box-shadow: 0 4px 14px rgba(0,0,0,0.35); cursor: pointer; z-index: 10;
      }
      .nnpilot-map-marker:hover, .nnpilot-map-marker.is-active { background: #000; }
      .nnpilot-map-status {
        position: absolute; top: 12px; left: 12px; z-index: 15; max-width: min(400px, calc(100% - 24px));
        padding: 7px 10px; border-radius: 999px; background: rgba(255,255,255,0.95); color: #333;
        border: 1px solid #ccc; box-shadow: 0 4px 14px rgba(0,0,0,0.1);
        font-size: 11px; font-weight: 650;
      }
      .nnpilot-map-controls { position: absolute; right: 12px; top: 12px; z-index: 15; display: grid; gap: 5px; }
      .nnpilot-map-control {
        width: 32px; height: 32px; border: 1px solid #bbb; border-radius: 8px; background: #fff;
        color: #111; font-size: 18px; line-height: 1; font-weight: 700; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }
      .nnpilot-map-attrib {
        position: absolute; right: 8px; bottom: 6px; z-index: 12; padding: 2px 5px; border-radius: 6px;
        background: rgba(255,255,255,0.9); color: #555; font-size: 9px;
      }
      .nnpilot-map-attrib a { color: #222; text-decoration: underline; }
      .nnpilot-map-marker-hover {
        /* Shell must not eat hits: it sits above the map canvas; large min-width would block the pin. */
        position: absolute; z-index: 40; min-width: 288px; max-width: min(380px, calc(100% - 24px));
        padding: 0; border-radius: 14px;
        border: 0; background: transparent; box-shadow: none; pointer-events: none;
        opacity: 0; visibility: hidden;
        transition: opacity 0.14s ease, visibility 0.14s ease, transform 0.14s ease; text-align: left;
      }
      .nnpilot-map-marker-hover.is-visible {
        opacity: 1 !important; visibility: visible !important; display: block !important;
      }
      .nnpilot-map-marker-hover.nnpilot-map-marker-hover--has-listing .nnpilot-map-marker-hover__inner { cursor: pointer; }
      .nnpilot-map-marker-hover__inner {
        display: flex; flex-direction: row; align-items: flex-start; gap: 16px;
        box-sizing: border-box; min-width: 100%;
        padding: 16px 18px 14px 18px; border-radius: 14px; pointer-events: auto;
        border: 1px solid rgba(0,0,0,0.08); background: #fff;
        box-shadow:
          0 1px 0 rgba(255,255,255,0.8) inset,
          0 14px 40px rgba(0,0,0,0.12),
          0 4px 12px rgba(0,0,0,0.06);
      }
      .nnpilot-map-marker-hover__thumb {
        width: 96px; height: 96px; object-fit: cover; border-radius: 12px; background: #ececec;
        flex-shrink: 0; display: block; box-shadow: 0 0 0 1px rgba(0,0,0,0.06) inset;
      }
      .nnpilot-map-marker-hover__thumb[hidden] { display: none !important; }
      .nnpilot-map-marker-hover__col {
        flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0; align-items: flex-start;
      }
      .nnpilot-map-marker-hover__muni {
        font-size: 16px; font-weight: 800; color: #0a0a0a; line-height: 1.28; letter-spacing: -0.025em;
        margin: 0;
      }
      .nnpilot-map-marker-hover__street {
        font-size: 12px; font-weight: 500; color: #5c5c5c; line-height: 1.38; margin: 0 0 5px 0;
      }
      .nnpilot-map-marker-hover__street[hidden] { display: none !important; margin-bottom: 0; }
      .nnpilot-map-marker-hover__street[hidden] + .nnpilot-map-marker-hover__specs { margin-top: 8px; }
      .nnpilot-map-marker-hover__specs {
        display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-start;
        align-self: stretch; width: 100%; box-sizing: border-box;
        column-gap: 4px; row-gap: 5px;
        font-size: 12px; font-weight: 600; color: #3d3d3d; line-height: 1.45;
        margin: 0 0 6px 0; padding: 0; text-align: left;
        background: transparent; border: 0; border-radius: 0;
      }
      .nnpilot-map-marker-hover__specs:empty { display: none; margin-bottom: 0; }
      .nnpilot-map-marker-hover__divider {
        align-self: stretch; width: 100%; box-sizing: border-box; flex-shrink: 0;
        height: 0; margin: 2px 0 8px 0; padding: 0; border: 0;
        border-top: 1px solid #ebebed;
      }
      .nnpilot-map-marker-hover__divider[hidden] { display: none !important; margin: 0; border: 0; }
      .nnpilot-map-marker-hover__icons-sep { color: #bdbdbd; font-weight: 500; user-select: none; padding: 0 1px; }
      .nnpilot-map-marker-hover__icons-icon {
        display: inline-flex; flex-direction: row; align-items: center; gap: 4px; white-space: nowrap;
      }
      .nnpilot-map-marker-hover__icons-icon--bed i {
        font-size: 14px !important; line-height: 1 !important; opacity: 0.88; vertical-align: -0.08em;
      }
      .nnpilot-map-marker-hover__price {
        font-size: 16px; font-weight: 800; color: #0d0d0d; line-height: 1.28; letter-spacing: -0.03em;
        margin: 0; padding: 0; border: 0;
      }
      .nnpilot-map-marker-hover__price[hidden] { display: none !important; }
      .nnpilot-map-marker-hover__stack {
        font-size: 12px; font-weight: 600; color: #888; margin: 8px 0 0 0; line-height: 1.35; letter-spacing: 0.01em;
      }
      .nnpilot-map-marker-hover__stack[hidden] { display: none !important; }
    `);

    let mode = "list";
    let center = { ...DEFAULT_CENTER };
    let zoom = DEFAULT_ZOOM;
    /** @type {Record<string, { lat: number, lon: number } | null | undefined>} */
    let coordCache = {};
    let coordCacheLoaded = false;
    let renderTimer = 0;
    let listingSyncTimer = 0;
    /** @type {MutationObserver | null} */
    let listingsDomObserver = null;
    let mapDataRefreshInFlight = false;
    /** Fingerprint of visible listing URLs; reset when leaving map mode so a re-open re-syncs. */
    let lastSeenListingSignature = "";
    /** When true, pan or +/- zoom was used; auto bounds-fit skips until the listing set changes. */
    let userAdjustedMapView = false;
    /** @type {string | null} Fingerprint of visible (filtered) hrefs; when this changes, refit bounds. */
    let lastVisibleSetSigForMap = null;
    /** Last marker-geometry signature we auto-fitted to (avoids repeated fits on identical coords). */
    let lastBoundsFitMarkerSig = "";
    /** Listing URLs + marker pin signature; skips full map tile redraw when unchanged (reduces DOM churn). */
    let lastListingGeomSyncSig = "";
    /** Last painted map state; avoids replaceChildren + img blitz on redundant scheduleRender. */
    let lastRenderMapViewSig = "";
    let latestListings = [];
    let latestGroups = [];
    /** rAF id for auto-bounds fit animation; cancelled on user interaction. */
    let viewAnimRafId = 0;
    let clusterFlexibility = Math.min(
      100,
      Math.max(0, Number(initialClusterFlexibility) || CLUSTER_FLEX_DEFAULT)
    );
    /** @type {HTMLDivElement | null} */
    let fallbackToolbar = null;

    const switchWrap = document.createElement("div");
    switchWrap.className = "nnpilot-view-switch";
    switchWrap.setAttribute("role", "tablist");
    switchWrap.setAttribute("aria-label", "Property results view");
    const listBtn = makeViewButton("list", "List view");
    const mapBtn = makeViewButton("map", "Map view");
    const switchHighlight = document.createElement("div");
    switchHighlight.className = "nnpilot-view-switch__highlight";
    switchHighlight.setAttribute("aria-hidden", "true");
    switchWrap.append(switchHighlight, listBtn, mapBtn);

    const panel = document.createElement("div");
    panel.className = "nnpilot-map-panel";
    const canvas = document.createElement("div");
    canvas.className = "nnpilot-map-canvas";
    /** @type {HTMLDivElement | null} */
    let mapWorld = null;
    function getMapWorldEl() {
      if (!mapWorld) {
        mapWorld = document.createElement("div");
        mapWorld.className = "nnpilot-map-world";
      }
      if (mapWorld.parentNode !== canvas) {
        canvas.appendChild(mapWorld);
      }
      return mapWorld;
    }
    let dragStart = null;
    /**
     * If `renderMap` runs while the user is panning (e.g. listing sync), the inner world is
     * rebuilt; re-apply the live translate so the pointer target list stays stable.
     */
    function reapplyMapWorldPanIfDragging() {
      if (!mapWorld || !mapWorld.isConnected) {
        return;
      }
      if (!dragStart) {
        mapWorld.style.transform = "";
        return;
      }
      const dx = dragStart.lastClientX - dragStart.x;
      const dy = dragStart.lastClientY - dragStart.y;
      mapWorld.style.transform = `translate(${dx}px, ${dy}px)`;
    }
    const status = document.createElement("div");
    status.className = "nnpilot-map-status";
    const controls = document.createElement("div");
    controls.className = "nnpilot-map-controls";
    const zoomIn = makeMapControl("+", "Zoom in");
    const zoomOut = makeMapControl("-", "Zoom out");
    controls.append(zoomIn, zoomOut);
    const attrib = document.createElement("div");
    attrib.className = "nnpilot-map-attrib";
    attrib.innerHTML =
      '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, ' +
      '<a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';

    const markerHover = document.createElement("div");
    markerHover.className = "nnpilot-map-marker-hover nnpilot-map-listing-popup";
    markerHover.setAttribute("role", "tooltip");
    markerHover.hidden = true;
    const markerHoverInner = document.createElement("div");
    markerHoverInner.className = "nnpilot-map-marker-hover__inner";
    const markerHoverThumb = document.createElement("img");
    markerHoverThumb.className = "nnpilot-map-marker-hover__thumb";
    markerHoverThumb.alt = "";
    markerHoverThumb.hidden = true;
    const markerHoverCol = document.createElement("div");
    markerHoverCol.className = "nnpilot-map-marker-hover__col";
    const markerHoverMuni = document.createElement("div");
    markerHoverMuni.className = "nnpilot-map-marker-hover__muni";
    const markerHoverStreet = document.createElement("div");
    markerHoverStreet.className = "nnpilot-map-marker-hover__street";
    const markerHoverSpecs = document.createElement("div");
    markerHoverSpecs.className = "nnpilot-map-marker-hover__specs";
    const markerHoverDivider = document.createElement("div");
    markerHoverDivider.className = "nnpilot-map-marker-hover__divider";
    markerHoverDivider.setAttribute("aria-hidden", "true");
    markerHoverDivider.hidden = true;
    const markerHoverPrice = document.createElement("div");
    markerHoverPrice.className = "nnpilot-map-marker-hover__price";
    const markerHoverStack = document.createElement("div");
    markerHoverStack.className = "nnpilot-map-marker-hover__stack";
    markerHoverStack.hidden = true;
    markerHoverCol.append(markerHoverMuni, markerHoverStreet, markerHoverSpecs, markerHoverDivider, markerHoverPrice, markerHoverStack);
    markerHoverInner.append(markerHoverThumb, markerHoverCol);
    markerHover.appendChild(markerHoverInner);

    const HOVER_BED_SVG_NS = "http://www.w3.org/2000/svg";
    /** Stroke bed (Lucide-like), used only when the listing has no Font Awesome icon to clone. */
    function createHoverBedIcon() {
      const svg = document.createElementNS(HOVER_BED_SVG_NS, "svg");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      svg.setAttribute("viewBox", "0 0 24 24");
      svg.setAttribute("fill", "none");
      svg.setAttribute("stroke", "currentColor");
      svg.setAttribute("stroke-width", "1.75");
      svg.setAttribute("stroke-linecap", "round");
      svg.setAttribute("stroke-linejoin", "round");
      svg.setAttribute("aria-hidden", "true");
      svg.style.cssText = "flex-shrink:0;opacity:0.82;display:block";
      const path = document.createElementNS(HOVER_BED_SVG_NS, "path");
      path.setAttribute("d", "M2 17v3M22 17v3M2 11h20v6H2zM7 11V8a2 2 0 012-2h6a2 2 0 012 2v3");
      svg.appendChild(path);
      return svg;
    }

    /**
     * @param {ParentNode | null | undefined} wrapper
     * @returns {HTMLElement | null}
     */
    function cloneListingBedIcon(wrapper) {
      const src = wrapper && wrapper.querySelector(".listing-icons-icon-bed i");
      if (!src || src.nodeType !== 1) return null;
      const i = /** @type {HTMLElement} */ (src.cloneNode(true));
      i.setAttribute("aria-hidden", "true");
      return i;
    }

    /**
     * @param {HTMLElement} specsEl
     * @param {{ bedsText?: string, sqmText?: string } | null | undefined} li
     * @param {ParentNode | null | undefined} liveWrapper
     */
    function buildHoverSpecsRow(specsEl, li, liveWrapper) {
      specsEl.replaceChildren();
      if (!li) return;
      const chunks = [];
      if (li.bedsText) chunks.push({ kind: "bed", text: li.bedsText });
      if (li.sqmText) chunks.push({ kind: "sqm", text: li.sqmText });
      let first = true;
      for (const ch of chunks) {
        if (!first) {
          const sep = document.createElement("span");
          sep.className = "nnpilot-map-marker-hover__icons-sep";
          sep.textContent = "|";
          specsEl.appendChild(sep);
        }
        first = false;
        const wrap = document.createElement("span");
        wrap.className =
          "nnpilot-map-marker-hover__icons-icon nnpilot-map-marker-hover__icons-icon--" + ch.kind;
        if (ch.kind === "bed") {
          const icon = cloneListingBedIcon(liveWrapper) || createHoverBedIcon();
          wrap.append(document.createTextNode(ch.text + " "), icon);
        } else {
          wrap.textContent = ch.text;
        }
        specsEl.appendChild(wrap);
      }
    }

    let markerHoverHideTimer = 0;
    let markerHoverAnchor = null;
    /** @type {string | null} */
    let markerHoverListingHref = null;

    function hideMarkerHoverImmediate() {
      if (DEBUG_KEEP_MAP_LISTING_HOVER_OPEN) return;
      clearTimeout(markerHoverHideTimer);
      markerHoverHideTimer = 0;
      markerHover.classList.remove("is-visible");
      markerHover.classList.remove("nnpilot-map-marker-hover--has-listing");
      markerHover.hidden = true;
      markerHoverAnchor = null;
      markerHoverListingHref = null;
    }

    function hideMarkerHoverSoon() {
      if (DEBUG_KEEP_MAP_LISTING_HOVER_OPEN) return;
      clearTimeout(markerHoverHideTimer);
      markerHoverHideTimer = setTimeout(() => {
        markerHoverHideTimer = 0;
        hideMarkerHoverImmediate();
      }, 140);
    }

    function cancelMarkerHoverHide() {
      clearTimeout(markerHoverHideTimer);
      markerHoverHideTimer = 0;
    }

    /**
     * Leaving the map pin: hide the card unless the pointer is moving into the mini listing
     * (or a short gap before `mouseenter` on the card — 140ms handles that). `relatedTarget`
     * avoids spurious close when the card draws over the pin.
     * @param {MouseEvent} e
     */
    function onMapMarkerMouseLeave(e) {
      const rt = e.relatedTarget;
      if (rt && rt instanceof Node && markerHover.contains(rt)) {
        return;
      }
      hideMarkerHoverSoon();
    }

    /**
     * Leaving the mini listing: close unless re-entering the same anchor pin.
     * @param {MouseEvent} e
     */
    function onMapMarkerHoverMouseLeave(e) {
      if (DEBUG_KEEP_MAP_LISTING_HOVER_OPEN) return;
      const rt = e.relatedTarget;
      if (
        rt &&
        rt instanceof Node &&
        markerHoverAnchor &&
        (markerHoverAnchor === rt || markerHoverAnchor.contains(rt))
      ) {
        return;
      }
      hideMarkerHoverImmediate();
    }

    function positionMarkerHover(anchorEl) {
      if (!anchorEl || !panel.isConnected) return;
      const pr = panel.getBoundingClientRect();
      const mr = anchorEl.getBoundingClientRect();
      const hw = Math.min(380, Math.max(268, markerHover.offsetWidth || 308));
      let left = mr.left - pr.left + mr.width / 2 - hw / 2;
      left = Math.max(10, Math.min(left, pr.width - hw - 10));
      let top = mr.top - pr.top + mr.height + 6;
      const hh = markerHover.offsetHeight || 120;
      if (top + hh > pr.height - 10) {
        top = mr.top - pr.top - hh - 6;
      }
      markerHover.style.left = `${Math.round(left)}px`;
      markerHover.style.top = `${Math.round(top)}px`;
      markerHover.style.maxWidth = `${Math.round(Math.min(380, pr.width - 20))}px`;
    }

    function listingWrapperFromHref(href) {
      if (!href || typeof href !== "string") return null;
      try {
        const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(href) : href.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return document.querySelector(`#listingsContainer a.listings-item-wrapper[href="${esc}"]`);
      } catch {
        return null;
      }
    }

    function showMarkerHover(group, anchorEl) {
      if (group.listings && group.listings.length > 1) {
        hideMarkerHoverImmediate();
        return;
      }
      cancelMarkerHoverHide();
      markerHoverAnchor = anchorEl;
      const first = group.listings[0];
      const liveWrap = first && first.href ? listingWrapperFromHref(first.href) : null;
      const label = group.label || "";
      const labelParts = label.split(" - ").map((s) => normalizeText(s));
      const muni =
        first?.municipalityText || (liveWrap ? listingMunicipality(liveWrap) : "") || labelParts[0] || "Listing";
      const street =
        first?.streetText || (liveWrap ? listingStreetOnly(liveWrap) : "") || labelParts.slice(1).join(" - ") || "";
      markerHoverMuni.textContent = muni;
      markerHoverStreet.textContent = street;
      markerHoverStreet.hidden = !street;
      const thumbSrc = (first && first.thumbSrc) || (liveWrap ? listingThumbSrc(liveWrap) : "");
      if (thumbSrc) {
        markerHoverThumb.src = thumbSrc;
        markerHoverThumb.hidden = false;
      } else {
        markerHoverThumb.removeAttribute("src");
        markerHoverThumb.hidden = true;
      }
      buildHoverSpecsRow(markerHoverSpecs, first, liveWrap);
      let priceText = (first && first.priceText) || "";
      if (!priceText && liveWrap) priceText = listingPriceLine(liveWrap);
      if (priceText) {
        markerHoverPrice.textContent = priceText;
        markerHoverPrice.hidden = false;
        markerHoverDivider.hidden = false;
      } else {
        markerHoverPrice.textContent = "";
        markerHoverPrice.hidden = true;
        markerHoverDivider.hidden = true;
      }
      const nAtPin = group.listings && group.listings.length;
      if (nAtPin > 1) {
        markerHoverStack.textContent = `${nAtPin} listings at this pin`;
        markerHoverStack.hidden = false;
      } else {
        markerHoverStack.textContent = "";
        markerHoverStack.hidden = true;
      }
      markerHoverListingHref = (first && first.href) || null;
      markerHover.classList.toggle("nnpilot-map-marker-hover--has-listing", Boolean(markerHoverListingHref));
      markerHover.hidden = false;
      markerHover.classList.add("is-visible");
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          positionMarkerHover(anchorEl);
        });
      });
    }

    markerHover.addEventListener("click", (e) => {
      const href = markerHoverListingHref;
      if (!href) return;
      e.preventDefault();
      e.stopPropagation();
      window.open(href, "_blank", "noopener,noreferrer");
    });
    // Hover must bind to the inner (pointer-interactive) card: the outer shell is pointer-events:none.
    markerHoverInner.addEventListener("mouseenter", cancelMarkerHoverHide);
    markerHoverInner.addEventListener("mouseleave", onMapMarkerHoverMouseLeave);

    panel.append(canvas, markerHover, status, controls, attrib);

    function makeViewButton(nextMode, text) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nnpilot-view-switch__btn nnpilot-view-switch__btn--" + nextMode;
      btn.setAttribute("role", "tab");
      btn.textContent = text;
      btn.addEventListener("click", () => setMode(nextMode));
      return btn;
    }

    function makeMapControl(text, label) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "nnpilot-map-control";
      btn.setAttribute("aria-label", label);
      btn.textContent = text;
      return btn;
    }

    async function loadCoordCache() {
      if (coordCacheLoaded) return;
      coordCacheLoaded = true;
      try {
        coordCache = (await chrome.storage.local.get({ [CACHE_KEY]: {} }))[CACHE_KEY] || {};
      } catch {
        coordCache = {};
      }
    }

    async function saveCoordCache() {
      try {
        await chrome.storage.local.set({ [CACHE_KEY]: coordCache });
      } catch {
        // ignore
      }
    }

    function getListingsContainer() {
      return document.getElementById("listingsContainer");
    }

    const MAP_HIDE_UNAVAILABLE_CLASS = "nnpilot-map-hide-unavailable";

    function syncMapViewBodyClass(wantMap) {
      try {
        document.body.classList.toggle("nnpilot-map-view-active", wantMap);
      } catch {
        // ignore
      }
    }

    function mountViewSwitch() {
      const c = getListingsContainer();
      if (!c) return false;
      const slot = document.getElementById("nnpilot-listings-toolbar-left");
      if (slot) {
        if (fallbackToolbar) {
          fallbackToolbar.remove();
          fallbackToolbar = null;
        }
        if (!slot.contains(switchWrap)) {
          slot.appendChild(switchWrap);
        }
      } else {
        if (!fallbackToolbar) {
          fallbackToolbar = document.createElement("div");
          fallbackToolbar.className = "nnpilot-map-view-fallback-toolbar";
          fallbackToolbar.setAttribute("data-nnpilot", "map-view-fallback-toolbar");
          fallbackToolbar.appendChild(switchWrap);
        }
        if (!c.contains(fallbackToolbar)) {
          c.insertBefore(fallbackToolbar, c.firstChild);
        }
      }
      const anchor = c.querySelector(":scope > .nnpilot-listings-sort-bar") || fallbackToolbar;
      if (anchor && !c.contains(panel)) {
        anchor.insertAdjacentElement("afterend", panel);
      } else if (anchor && panel.previousElementSibling !== anchor) {
        anchor.insertAdjacentElement("afterend", panel);
      } else if (!anchor && !c.contains(panel)) {
        c.insertBefore(panel, c.firstChild);
      }
      const wantMap = mode === "map";
      if (c.classList.contains("nnpilot-map-view-active") !== wantMap) {
        c.classList.toggle("nnpilot-map-view-active", wantMap);
      }
      syncMapViewBodyClass(wantMap);
      return true;
    }

    function setMode(nextMode) {
      mode = nextMode === "map" ? "map" : "list";
      const c = getListingsContainer();
      if (c) {
        const wantMap = mode === "map";
        if (c.classList.contains("nnpilot-map-view-active") !== wantMap) {
          c.classList.toggle("nnpilot-map-view-active", wantMap);
        }
        syncMapViewBodyClass(wantMap);
      } else {
        syncMapViewBodyClass(false);
      }
      listBtn.classList.toggle("is-active", mode === "list");
      mapBtn.classList.toggle("is-active", mode === "map");
      listBtn.setAttribute("aria-selected", mode === "list" ? "true" : "false");
      mapBtn.setAttribute("aria-selected", mode === "map" ? "true" : "false");
      switchWrap.setAttribute("data-active-pill", mode === "map" ? "map" : "list");
      if (mode !== "map") {
        cancelAutoBoundsAnimation();
        lastSeenListingSignature = "";
        lastListingGeomSyncSig = "";
        lastRenderMapViewSig = "";
        lastVisibleSetSigForMap = null;
        cancelMarkerHoverHide();
        markerHover.classList.remove("is-visible");
        markerHover.classList.remove("nnpilot-map-marker-hover--has-listing");
        markerHover.hidden = true;
        markerHoverAnchor = null;
        markerHoverListingHref = null;
        applyMapViewUnavailableHiding(false);
      } else {
        cancelAutoBoundsAnimation();
        lastListingGeomSyncSig = "";
        lastRenderMapViewSig = "";
        center = { ...DEFAULT_CENTER };
        zoom = DEFAULT_ZOOM;
        userAdjustedMapView = false;
        lastBoundsFitMarkerSig = "";
        syncListingSyncNow();
        applyMapViewUnavailableHiding(true);
      }
    }

    function normalizeText(s) {
      return String(s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
    }

    function foldText(s) {
      return normalizeText(s)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
    }

    function isAfterUnavailableSeparator(wrapper) {
      const sep = document.querySelector("#listingsContainer .unavailablePropertiesSeparatorWrapper");
      return Boolean(sep && wrapper && sep.compareDocumentPosition(wrapper) & Node.DOCUMENT_POSITION_FOLLOWING);
    }

    function listingColumn(wrapper) {
      return wrapper.closest(".col-md-6, .col-md-12, .col-sm-6, .col-sm-12, .col-6, [class*='col-md-' i], [class*='col-sm-' i]") || wrapper;
    }

    function isHiddenByFilters(wrapper) {
      if (wrapper.classList.contains(MAP_HIDE_UNAVAILABLE_CLASS)) return true;
      const root = getListingsContainer();
      if (!root) return true;
      let el = listingColumn(wrapper);
      while (el && el !== root && el.nodeType === 1) {
        if (el.classList.contains("nnpilot-map-panel")) return true;
        if (el.classList.contains(MAP_HIDE_UNAVAILABLE_CLASS)) return true;
        if (el instanceof HTMLElement) {
          if (el.style.display === "none") return true;
          if (el.hasAttribute("hidden")) return true;
        }
        if (el.getAttribute("aria-hidden") === "true") return true;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.contentVisibility === "hidden") return true;
        el = el.parentElement;
      }
      return false;
    }

    /**
     * What the list shows after advanced filters (and map-mode CSS). Prefer native visibility so
     * we always match the real DOM, even when column structure differs from our heuristics.
     * @param {Element} wrapper
     */
    function isListingInLiveFilteredSet(wrapper) {
      if (!wrapper || wrapper.nodeType !== 1) return false;
      if (wrapper.classList && wrapper.classList.contains(MAP_HIDE_UNAVAILABLE_CLASS)) {
        return false;
      }
      if (typeof wrapper.checkVisibility === "function") {
        try {
          return wrapper.checkVisibility({ checkOpacity: true, checkSize: true });
        } catch {
          // fall through
        }
      }
      return !isHiddenByFilters(wrapper);
    }

    function isUnavailableListing(wrapper) {
      if (isAfterUnavailableSeparator(wrapper)) return true;
      const text = foldText(wrapper.textContent);
      return /\b(sold|signed|reserved|vendu|vendue|compromis|reserve|reservee)\b/i.test(text);
    }

    function applyMapViewUnavailableHiding(on) {
      const root = getListingsContainer();
      if (!root) return;
      if (!on) {
        root.querySelectorAll("." + MAP_HIDE_UNAVAILABLE_CLASS).forEach((el) => {
          el.classList.remove(MAP_HIDE_UNAVAILABLE_CLASS);
        });
        return;
      }
      const wrappers = root.querySelectorAll("a.listings-item-wrapper[href]");
      for (const w of wrappers) {
        if (isUnavailableListing(w)) w.classList.add(MAP_HIDE_UNAVAILABLE_CLASS);
        else w.classList.remove(MAP_HIDE_UNAVAILABLE_CLASS);
      }
      const sep = root.querySelector(".unavailablePropertiesSeparatorWrapper");
      if (sep) sep.classList.add(MAP_HIDE_UNAVAILABLE_CLASS);
      root.querySelectorAll("[data-nnpilot-sold-separator-row]").forEach((row) => {
        row.classList.add(MAP_HIDE_UNAVAILABLE_CLASS);
      });
    }

    function listingMunicipality(wrapper) {
      if (!wrapper) return "";
      const el =
        wrapper.querySelector(".listings-item-city-neighborhood") ||
        wrapper.querySelector("[class*='city-neighborhood' i]") ||
        wrapper.querySelector("[class*='listings-item-city' i]");
      return el ? normalizeText(el.textContent) : "";
    }

    function listingStreetOnly(wrapper) {
      if (!wrapper) return "";
      const el =
        wrapper.querySelector(".listings-item-street") ||
        wrapper.querySelector("[class*='listings-item-street' i]") ||
        wrapper.querySelector(".listings-item-body [class*='street' i]");
      return el ? normalizeText(el.textContent) : "";
    }

    function listingTitle(wrapper) {
      const city = listingMunicipality(wrapper);
      const street = listingStreetOnly(wrapper);
      return [city, street].filter(Boolean).join(" - ") || "Property";
    }

    function listingMeta(wrapper) {
      const price = listingPriceLine(wrapper);
      const city = listingMunicipality(wrapper);
      return [price, city].filter(Boolean).join(" - ");
    }

    function listingBedDigits(wrapper) {
      const bed = wrapper.querySelector(".listing-icons-icon-bed");
      if (!bed) return "";
      const m = bed.textContent.replace(/\u00a0/g, " ").match(/\d+/);
      return m ? m[0] : "";
    }

    function listingSqmLine(wrapper) {
      const n = wrapper.querySelector(".listing-icons-icon-area-surface");
      return n ? normalizeText(n.textContent) : "";
    }

    function listingPriceLine(wrapper) {
      if (!wrapper) return "";
      const candidates = wrapper.querySelectorAll(
        ".listings-item-price, [class*='listings-item-price' i], [class*='listing-price' i], [class*='item-price' i], [itemprop='price'], [class*='price' i], [class*='Price']"
      );
      for (const p of candidates) {
        const t = normalizeText(p.textContent);
        if (t && /\d/.test(t) && (/€|EUR|(\d[\d\s.',]{2,})/i.test(t) || /\d{3,}/.test(t))) return t;
      }
      const body = wrapper.querySelector(".listings-item-body");
      if (body) {
        const raw = (body.innerText || body.textContent || "").replace(/\u00a0/g, " ");
        const m =
          raw.match(/€\s*[\d\s.',]+/) ||
          raw.match(/[\d\s.',]+\s*€/) ||
          raw.match(/EUR\s*[\d\s.',]+/i);
        if (m) return normalizeText(m[0]);
      }
      const blob = (wrapper.getAttribute("title") || wrapper.textContent || "").replace(/\u00a0/g, " ");
      const euroAfter = [...blob.matchAll(/€\s*([\d\s.',]+)/gi)];
      if (euroAfter.length) {
        return normalizeText("€ " + euroAfter[euroAfter.length - 1][1].replace(/'/g, " "));
      }
      const euroBefore = blob.match(/([\d\s.',]+\s*€)/i);
      if (euroBefore) return normalizeText(euroBefore[1]);
      return "";
    }

    function listingThumbSrc(wrapper) {
      if (!wrapper) return "";
      const header = wrapper.querySelector(".listings-item-header");
      if (!header) return "";
      const bg = header.style && header.style.backgroundImage;
      if (bg && bg !== "none") {
        const m = bg.match(/url\(\s*["']?([^"')]+)/i);
        if (m && m[1]) return m[1].trim();
      }
      const img = header.querySelector("img[src]");
      if (img && img.src) return img.src;
      return "";
    }

    function collectListings() {
      return Array.from(document.querySelectorAll("#listingsContainer a.listings-item-wrapper[href]"))
        .filter(
          (wrapper) => !isUnavailableListing(wrapper) && isListingInLiveFilteredSet(/** @type {Element} */ (wrapper))
        )
        .map((wrapper) => ({
          href: wrapper.href,
          title: listingTitle(wrapper),
          meta: listingMeta(wrapper),
          municipalityText: listingMunicipality(wrapper),
          streetText: listingStreetOnly(wrapper),
          bedsText: listingBedDigits(wrapper),
          sqmText: listingSqmLine(wrapper),
          priceText: listingPriceLine(wrapper),
          thumbSrc: listingThumbSrc(wrapper),
        }));
    }

    function groupListings() {
      const groups = new Map();
      for (const li of latestListings) {
        const key = hrefCacheKey(li.href);
        const c = coordCache[key];
        if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) continue;
        const coordKey = `${c.lat.toFixed(5)},${c.lon.toFixed(5)}`;
        if (!groups.has(coordKey)) {
          groups.set(coordKey, { lat: c.lat, lon: c.lon, label: li.title, listings: [] });
        }
        groups.get(coordKey).listings.push(li);
      }
      return Array.from(groups.values());
    }

    function clusterFlexToRadiusPx() {
      return (clusterFlexibility / 100) * CLUSTER_MAX_RADIUS_PX;
    }

    /**
     * Merges exact-coordinate groups whose centres fall within `radiusPx` screen pixels at `zoom`
     * (connected components). Centroid is weighted by listing count.
     * @param {Array<{ lat: number, lon: number, label: string, listings: unknown[] }>} groups
     */
    function clusterGroupsByPixelRadius(groups, zoomLevel, rect, mapCenter, radiusPx) {
      if (!groups.length || radiusPx <= 0) return groups;
      const left = lonToWorldX(mapCenter.lon, zoomLevel) - rect.width / 2;
      const top = latToWorldY(mapCenter.lat, zoomLevel) - rect.height / 2;
      const pts = groups.map((g) => ({
        g,
        x: lonToWorldX(g.lon, zoomLevel) - left,
        y: latToWorldY(g.lat, zoomLevel) - top,
      }));
      const n = pts.length;
      const parent = Array.from({ length: n }, (_, i) => i);
      function find(i) {
        let p = i;
        while (parent[p] !== p) p = parent[p];
        let x = i;
        while (parent[x] !== x) {
          const nx = parent[x];
          parent[x] = p;
          x = nx;
        }
        return p;
      }
      function union(a, b) {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) parent[ra] = rb;
      }
      const thr = radiusPx;
      const thr2 = thr * thr;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          if (dx * dx + dy * dy <= thr2) union(i, j);
        }
      }
      const buckets = new Map();
      for (let i = 0; i < n; i++) {
        const r = find(i);
        if (!buckets.has(r)) buckets.set(r, []);
        buckets.get(r).push(pts[i].g);
      }
      const out = [];
      for (const arr of buckets.values()) {
        let tw = 0;
        let wlat = 0;
        let wlon = 0;
        const flat = [];
        for (const g of arr) {
          const w = g.listings.length;
          tw += w;
          wlat += g.lat * w;
          wlon += g.lon * w;
          flat.push(...g.listings);
        }
        const listings = dedupeListingsByHref(flat);
        const lat = tw > 0 ? wlat / tw : arr[0].lat;
        const lon = tw > 0 ? wlon / tw : arr[0].lon;
        listings.sort((a, b) => hrefCacheKey(a.href).localeCompare(hrefCacheKey(b.href)));
        const label = (listings[0] && listings[0].title) || arr[0].label || "";
        out.push({ lat, lon, label, listings });
      }
      return out;
    }

    function dedupeListingsByHref(listings) {
      const seen = new Set();
      const out = [];
      for (const li of listings) {
        const k = hrefCacheKey(li.href);
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(li);
      }
      return out;
    }

    async function fetchCoordsForUrl(href) {
      const key = hrefCacheKey(href);
      if (Object.prototype.hasOwnProperty.call(coordCache, key)) {
        return coordCache[key];
      }
      try {
        const res = await fetch(href, { credentials: "include" });
        if (!res.ok) {
          coordCache[key] = null;
          return null;
        }
        const html = await res.text();
        const coords = extractCoordsFromListingHtml(html);
        coordCache[key] = coords;
        return coords;
      } catch {
        coordCache[key] = null;
        return null;
      }
    }

    async function fetchMissingCoordsParallel(listings) {
      const todo = listings.filter((li) => !Object.prototype.hasOwnProperty.call(coordCache, hrefCacheKey(li.href)));
      if (!todo.length) return;
      let idx = 0;
      async function worker() {
        while (true) {
          const i = idx++;
          if (i >= todo.length) break;
          await fetchCoordsForUrl(todo[i].href);
        }
      }
      const n = Math.min(FETCH_CONCURRENCY, Math.max(1, todo.length));
      await Promise.all(Array.from({ length: n }, () => worker()));
    }

    function getCoordResolutionCounts() {
      let withCoords = 0;
      let failed = 0;
      let notYet = 0;
      for (const li of latestListings) {
        const k = hrefCacheKey(li.href);
        if (!Object.prototype.hasOwnProperty.call(coordCache, k)) {
          notYet++;
          continue;
        }
        const c = coordCache[k];
        if (c && Number.isFinite(c.lat) && Number.isFinite(c.lon)) withCoords++;
        else failed++;
      }
      return { withCoords, failed, notYet };
    }

    function updateStatus() {
      const { withCoords, failed, notYet } = getCoordResolutionCounts();
      if (latestListings.length === 0) {
        status.textContent = "No active for-sale listings match the current filters.";
      } else if (notYet > 0) {
        status.textContent = `${withCoords}/${latestListings.length} on map. Resolving ${notYet} location${notYet === 1 ? "" : "s"}...`;
      } else if (failed > 0) {
        status.textContent = `${withCoords} on map, ${failed} without coordinates (check listing page HTML).`;
      } else {
        status.textContent = `${withCoords} active for-sale listing${withCoords === 1 ? "" : "s"} on the map.`;
      }
    }

    function markerGeometrySignature(groups) {
      return groups
        .map((g) => `${g.lat.toFixed(4)},${g.lon.toFixed(4)}:${g.listings.length}`)
        .sort()
        .join("|");
    }

    function easeInOutCubic(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function cancelAutoBoundsAnimation() {
      if (viewAnimRafId) {
        cancelAnimationFrame(viewAnimRafId);
        viewAnimRafId = 0;
      }
    }

    /** Stops in-flight auto-fit and drops the dedupe key so a later refit is allowed. */
    function interruptAutoBoundsForUser() {
      if (viewAnimRafId) {
        cancelAutoBoundsAnimation();
        lastBoundsFitMarkerSig = "";
      }
    }

    /**
     * Computes target center + zoom so all group markers sit inside the canvas with padding.
     * @param {Array<{ lat: number, lon: number, listings: unknown[] }>} groups
     * @returns {{ center: { lat: number, lon: number }, zoom: number } | null}
     */
    function computeBoundsFitToGroups(groups) {
      if (!groups || !groups.length) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return null;
      const pad = 28;
      const effW = Math.max(160, rect.width - 2 * pad);
      const effH = Math.max(160, rect.height - 2 * pad);
      let minLat = Infinity;
      let maxLat = -Infinity;
      let minLon = Infinity;
      let maxLon = -Infinity;
      for (const g of groups) {
        minLat = Math.min(minLat, g.lat);
        maxLat = Math.max(maxLat, g.lat);
        minLon = Math.min(minLon, g.lon);
        maxLon = Math.max(maxLon, g.lon);
      }
      let latSpan = Math.max(1e-7, maxLat - minLat);
      let lonSpan = Math.max(1e-7, maxLon - minLon);
      if (latSpan < 1e-5 && lonSpan < 1e-5) {
        return { center: { lat: minLat, lon: minLon }, zoom: Math.min(16, MAX_ZOOM) };
      }
      const padLat = Math.max(latSpan * 0.05, 0.0012);
      const padLon = Math.max(lonSpan * 0.05, 0.0012);
      minLat -= padLat;
      maxLat += padLat;
      minLon -= padLon;
      maxLon += padLon;
      latSpan = maxLat - minLat;
      lonSpan = maxLon - minLon;
      const centerLat = (minLat + maxLat) / 2;
      const centerLon = (minLon + maxLon) / 2;
      const corners = [
        { lat: minLat, lon: minLon },
        { lat: minLat, lon: maxLon },
        { lat: maxLat, lon: minLon },
        { lat: maxLat, lon: maxLon },
      ];
      let bestZ = MIN_ZOOM;
      for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
        const cx = lonToWorldX(centerLon, z);
        const cy = latToWorldY(centerLat, z);
        let ok = true;
        for (const p of corners) {
          const px = Math.abs(lonToWorldX(p.lon, z) - cx);
          const py = Math.abs(latToWorldY(p.lat, z) - cy);
          if (px * 2 > effW || py * 2 > effH) {
            ok = false;
            break;
          }
        }
        if (ok) {
          bestZ = z;
          break;
        }
      }
      return { center: { lat: centerLat, lon: centerLon }, zoom: bestZ };
    }

    /**
     * Smooth pan/zoom to target (e.g. after filter change). Renders every frame; cancelled on user input.
     * @param {{ center: { lat: number, lon: number }, zoom: number }} target
     * @param {number} durationMs
     * @param {() => void} [onComplete]
     */
    function animateToBoundsTarget(target, durationMs, onComplete) {
      cancelAutoBoundsAnimation();
      const fromC = { ...center };
      const fromZ = zoom;
      const tCenter = target.center;
      const tZ = target.zoom;
      const dLat = tCenter.lat - fromC.lat;
      const dLon = tCenter.lon - fromC.lon;
      const dZ = tZ - fromZ;
      if (Math.abs(dLat) < 1e-9 && Math.abs(dLon) < 1e-9 && dZ === 0) {
        onComplete && onComplete();
        return;
      }
      const t0 = performance.now();
      const dur = Math.max(240, Math.min(950, durationMs));
      function tick(now) {
        if (mode !== "map" || userAdjustedMapView) {
          viewAnimRafId = 0;
          if (userAdjustedMapView) {
            lastBoundsFitMarkerSig = "";
          }
          return;
        }
        const u = Math.min(1, (now - t0) / dur);
        const e = easeInOutCubic(u);
        center = {
          lat: fromC.lat + dLat * e,
          lon: fromC.lon + dLon * e
        };
        zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(fromZ + dZ * e)));
        renderMap();
        if (u < 1) {
          viewAnimRafId = requestAnimationFrame(tick);
        } else {
          center = { ...tCenter };
          zoom = tZ;
          viewAnimRafId = 0;
          renderMap();
          onComplete && onComplete();
        }
      }
      viewAnimRafId = requestAnimationFrame(tick);
    }

    function maybeApplyAutoBoundsFit() {
      if (mode !== "map" || userAdjustedMapView || !latestGroups.length) return;
      const { notYet } = getCoordResolutionCounts();
      if (notYet > 0) return;
      const mSig = markerGeometrySignature(latestGroups);
      if (mSig === lastBoundsFitMarkerSig) return;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (mode !== "map" || userAdjustedMapView) return;
          const target = computeBoundsFitToGroups(latestGroups);
          if (!target) return;
          lastBoundsFitMarkerSig = mSig;
          animateToBoundsTarget(target, 700);
        });
      });
    }

    function listingSetSignature(listings) {
      return [...new Set(listings.map((l) => hrefCacheKey(l.href)))].sort().join("\n");
    }

    /**
     * True when every mutation target / added / removed node stays inside our map panel
     * (tile loads, markers, etc.) so we should not re-run listing fetches.
     * @param {MutationRecord[]} muts
     */
    function mutationsOnlyInsideMapPanel(muts) {
      for (const m of muts) {
        if (m.type === "attributes") {
          const t = m.target;
          if (t && t.nodeType === 1 && !panel.contains(t)) return false;
        }
        if (m.type === "childList") {
          for (const n of m.addedNodes) {
            if (n.nodeType === 1 && !panel.contains(n)) return false;
          }
          for (const n of m.removedNodes) {
            if (n.nodeType === 1 && !panel.contains(n)) return false;
          }
        }
      }
      return true;
    }

    function scheduleListingSync(delay) {
      clearTimeout(listingSyncTimer);
      listingSyncTimer = setTimeout(() => {
        listingSyncTimer = 0;
        void syncListingsAndCoords();
      }, delay);
    }

    function syncListingSyncNow() {
      clearTimeout(listingSyncTimer);
      listingSyncTimer = 0;
      void syncListingsAndCoords();
    }

    async function syncListingsAndCoords() {
      mountViewSwitch();
      latestListings = collectListings();
      const visSig = listingSetSignature(latestListings);
      if (visSig !== lastVisibleSetSigForMap) {
        lastVisibleSetSigForMap = visSig;
        userAdjustedMapView = false;
        lastBoundsFitMarkerSig = "";
        cancelAutoBoundsAnimation();
      }
      latestGroups = groupListings();

      const geomSig = `${listingSetSignature(latestListings)}|${markerGeometrySignature(latestGroups)}`;

      updateStatus();

      if (mode === "map" && geomSig !== lastListingGeomSyncSig) {
        lastListingGeomSyncSig = geomSig;
        scheduleRender(0);
      }

      if (mode !== "map") {
        applyMapViewUnavailableHiding(false);
        return;
      }

      maybeApplyAutoBoundsFit();

      const sig = listingSetSignature(latestListings);
      if (sig === lastSeenListingSignature) {
        latestGroups = groupListings();
        updateStatus();
        maybeApplyAutoBoundsFit();
        const geomSig2 = `${listingSetSignature(latestListings)}|${markerGeometrySignature(latestGroups)}`;
        if (geomSig2 !== lastListingGeomSyncSig) {
          lastListingGeomSyncSig = geomSig2;
          scheduleRender(0);
        }
        applyMapViewUnavailableHiding(true);
        return;
      }
      if (mapDataRefreshInFlight) {
        scheduleListingSync(320);
        applyMapViewUnavailableHiding(true);
        return;
      }
      userAdjustedMapView = false;
      lastBoundsFitMarkerSig = "";
      lastSeenListingSignature = sig;
      mapDataRefreshInFlight = true;
      try {
        await loadCoordCache();
        await fetchMissingCoordsParallel(latestListings);
        await saveCoordCache();
      } finally {
        mapDataRefreshInFlight = false;
      }
      latestGroups = groupListings();
      updateStatus();
      const geomSig3 = `${listingSetSignature(latestListings)}|${markerGeometrySignature(latestGroups)}`;
      if (geomSig3 !== lastListingGeomSyncSig) {
        lastListingGeomSyncSig = geomSig3;
        scheduleRender(0);
      }
      maybeApplyAutoBoundsFit();
      applyMapViewUnavailableHiding(true);
    }

    function lonToWorldX(lon, z) {
      return ((lon + 180) / 360) * TILE_SIZE * Math.pow(2, z);
    }

    function latToWorldY(lat, z) {
      const sin = Math.sin((lat * Math.PI) / 180);
      return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * TILE_SIZE * Math.pow(2, z);
    }

    function worldXToLon(x, z) {
      return (x / (TILE_SIZE * Math.pow(2, z))) * 360 - 180;
    }

    function worldYToLat(y, z) {
      const n = Math.PI - (2 * Math.PI * y) / (TILE_SIZE * Math.pow(2, z));
      return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    }

    /**
     * Multi-listing (cluster) pin: zoom in one level while keeping the pin’s screen position fixed.
     * At max zoom, center the map on the cluster instead.
     * @param {HTMLElement} anchorEl
     * @param {number} lat
     * @param {number} lon
     */
    function clusterMarkerZoomIn(anchorEl, lat, lon) {
      interruptAutoBoundsForUser();
      const z0 = zoom;
      const z1 = Math.min(MAX_ZOOM, z0 + 1);
      const r = canvas.getBoundingClientRect();
      if (r.width < 10 || r.height < 10) return;
      if (z1 === z0) {
        center = { lat, lon };
        userAdjustedMapView = true;
        scheduleRender(0);
        return;
      }
      const mr = anchorEl.getBoundingClientRect();
      const offsetX = mr.left + mr.width / 2 - r.left;
      const offsetY = mr.top + mr.height / 2 - r.top;
      const wx1 = lonToWorldX(lon, z1);
      const wy1 = latToWorldY(lat, z1);
      const newCenterLon = worldXToLon(wx1 + r.width / 2 - offsetX, z1);
      const newCenterLat = worldYToLat(wy1 + r.height / 2 - offsetY, z1);
      zoom = z1;
      center = { lat: newCenterLat, lon: newCenterLon };
      userAdjustedMapView = true;
      scheduleRender(0);
    }

    /**
     * Fingerprint of everything that affects the tile + marker output. If unchanged, we skip
     * replaceChildren (stops devtools/inspector flashing and spares reload churn).
     * @param {DOMRect} rect
     * @returns {string | null} null if canvas too small
     */
    function computeRenderMapViewSigForRect(rect) {
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w < 10 || h < 10) {
        return null;
      }
      const cR = clusterFlexToRadiusPx();
      return [lastListingGeomSyncSig, zoom, center.lat.toFixed(6), center.lon.toFixed(6), w, h, cR].join(";");
    }

    function renderMap() {
      if (mode !== "map") return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10) return;
      const nextViewSig = computeRenderMapViewSigForRect(rect);
      if (nextViewSig == null) {
        return;
      }
      if (nextViewSig === lastRenderMapViewSig) {
        reapplyMapWorldPanIfDragging();
        return;
      }
      hideMarkerHoverSoon();
      const world = getMapWorldEl();
      world.replaceChildren();
      const scale = Math.pow(2, zoom);
      const centerX = lonToWorldX(center.lon, zoom);
      const centerY = latToWorldY(center.lat, zoom);
      const left = centerX - rect.width / 2;
      const top = centerY - rect.height / 2;
      const startX = Math.floor(left / TILE_SIZE);
      const endX = Math.floor((left + rect.width) / TILE_SIZE);
      const startY = Math.floor(top / TILE_SIZE);
      const endY = Math.floor((top + rect.height) / TILE_SIZE);
      for (let x = startX; x <= endX; x++) {
        for (let y = startY; y <= endY; y++) {
          if (y < 0 || y >= scale) continue;
          const wrappedX = ((x % scale) + scale) % scale;
          const img = document.createElement("img");
          img.className = "nnpilot-map-tile";
          img.alt = "";
          img.draggable = false;
          img.src = tileUrl(zoom, wrappedX, y);
          img.style.left = `${Math.round(x * TILE_SIZE - left)}px`;
          img.style.top = `${Math.round(y * TILE_SIZE - top)}px`;
          world.appendChild(img);
        }
      }
      const clusterR = clusterFlexToRadiusPx();
      const displayGroups =
        clusterR > 0 ? clusterGroupsByPixelRadius(latestGroups, zoom, rect, center, clusterR) : latestGroups;
      const orderedMarkers = displayGroups.slice().sort((a, b) => {
        const ay = latToWorldY(a.lat, zoom) - top;
        const by = latToWorldY(b.lat, zoom) - top;
        if (ay !== by) {
          return ay - by;
        }
        return a.lon - b.lon;
      });
      for (const group of orderedMarkers) {
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = "nnpilot-map-marker";
        marker.textContent = String(group.listings.length);
        const nList = group.listings.length;
        marker.setAttribute(
          "aria-label",
          nList > 1
            ? `${nList} listings clustered — click to zoom in`
            : `${nList} listing near ${group.label}`
        );
        marker.style.left = `${lonToWorldX(group.lon, zoom) - left}px`;
        marker.style.top = `${latToWorldY(group.lat, zoom) - top}px`;
        marker.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
        });
        marker.addEventListener("mouseenter", () => {
          if (nList > 1) {
            hideMarkerHoverImmediate();
            return;
          }
          showMarkerHover(group, marker);
        });
        marker.addEventListener("mouseleave", onMapMarkerMouseLeave);
        marker.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (nList > 1) {
            clusterMarkerZoomIn(marker, group.lat, group.lon);
            return;
          }
          const first = group.listings[0];
          if (first && first.href) {
            window.open(first.href, "_blank", "noopener,noreferrer");
          }
        });
        world.appendChild(marker);
      }
      lastRenderMapViewSig = nextViewSig;
      reapplyMapWorldPanIfDragging();
    }

    function scheduleRender(delay) {
      clearTimeout(renderTimer);
      renderTimer = setTimeout(renderMap, delay);
    }

    function zoomBy(delta) {
      interruptAutoBoundsForUser();
      userAdjustedMapView = true;
      zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
      scheduleRender(0);
    }

    zoomIn.addEventListener("click", () => zoomBy(1));
    zoomOut.addEventListener("click", () => zoomBy(-1));

    canvas.addEventListener("dblclick", (e) => {
      if (mode !== "map") return;
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.classList.contains("nnpilot-map-marker")) return;
      if (t !== canvas && !t.classList.contains("nnpilot-map-tile") && !t.classList.contains("nnpilot-map-world")) return;
      if (zoom >= MAX_ZOOM) return;
      interruptAutoBoundsForUser();
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      const z0 = zoom;
      const z1 = Math.min(MAX_ZOOM, z0 + 1);
      if (z1 === z0) return;
      const centerX0 = lonToWorldX(center.lon, z0);
      const centerY0 = latToWorldY(center.lat, z0);
      const left0 = centerX0 - rect.width / 2;
      const top0 = centerY0 - rect.height / 2;
      const worldXClick = left0 + offsetX;
      const worldYClick = top0 + offsetY;
      const clickLon = worldXToLon(worldXClick, z0);
      const clickLat = worldYToLat(worldYClick, z0);
      const wx1 = lonToWorldX(clickLon, z1);
      const wy1 = latToWorldY(clickLat, z1);
      const newCenterLon = worldXToLon(wx1 + rect.width / 2 - offsetX, z1);
      const newCenterLat = worldYToLat(wy1 + rect.height / 2 - offsetY, z1);
      zoom = z1;
      center = { lat: newCenterLat, lon: newCenterLon };
      userAdjustedMapView = true;
      scheduleRender(0);
    });

    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (mode === "map") {
        interruptAutoBoundsForUser();
      }
      dragStart = {
        originX: e.clientX,
        originY: e.clientY,
        x: e.clientX,
        y: e.clientY,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        moved: false,
        centerX: lonToWorldX(center.lon, zoom),
        centerY: latToWorldY(center.lat, zoom),
      };
      canvas.classList.add("is-dragging");
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!dragStart) return;
      if (Math.hypot(e.clientX - dragStart.originX, e.clientY - dragStart.originY) > 5) {
        dragStart.moved = true;
      }
      dragStart.lastClientX = e.clientX;
      dragStart.lastClientY = e.clientY;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (mapWorld) {
        mapWorld.style.transform = `translate(${dx}px,${dy}px)`;
      }
    });
    canvas.addEventListener("pointerup", (e) => {
      if (!dragStart) {
        canvas.classList.remove("is-dragging");
        return;
      }
      if (mapWorld) {
        mapWorld.style.transform = "";
      }
      const d = dragStart;
      if (d.moved || e.clientX !== d.x || e.clientY !== d.y) {
        const nextX = d.centerX - (e.clientX - d.x);
        const nextY = d.centerY - (e.clientY - d.y);
        center = { lat: worldYToLat(nextY, zoom), lon: worldXToLon(nextX, zoom) };
        if (d.moved) {
          userAdjustedMapView = true;
        }
        scheduleRender(0);
      }
      dragStart = null;
      canvas.classList.remove("is-dragging");
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore: capture may already be released
      }
    });
    canvas.addEventListener("pointercancel", () => {
      if (mapWorld) {
        mapWorld.style.transform = "";
      }
      dragStart = null;
      canvas.classList.remove("is-dragging");
    });
    window.addEventListener("resize", () => {
      scheduleRender(80);
      if (markerHover.classList.contains("is-visible") && markerHoverAnchor) {
        positionMarkerHover(markerHoverAnchor);
      }
    });

    function ensureListingsObserver() {
      const root = getListingsContainer();
      if (!root) return;
      if (listingsDomObserver) {
        listingsDomObserver.disconnect();
        listingsDomObserver = null;
      }
      listingsDomObserver = new MutationObserver((muts) => {
        mountViewSwitch();
        if (mode !== "map") return;
        if (mutationsOnlyInsideMapPanel(muts)) return;
        scheduleListingSync(110);
      });
      listingsDomObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
      });
    }

    function ensureListingsRootWatcher() {
      if (getListingsContainer()) {
        mountViewSwitch();
        ensureListingsObserver();
        return;
      }
      const once = new MutationObserver(() => {
        if (getListingsContainer()) {
          once.disconnect();
          mountViewSwitch();
          ensureListingsObserver();
        }
      });
      once.observe(document.body, { childList: true, subtree: true });
    }

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "sync" || !changes[CLUSTER_FLEX_KEY]) return;
        const raw = changes[CLUSTER_FLEX_KEY].newValue;
        const n = parseInt(String(raw), 10);
        clusterFlexibility = Number.isFinite(n)
          ? Math.min(100, Math.max(0, n))
          : CLUSTER_FLEX_DEFAULT;
        if (mode === "map") scheduleRender(0);
      });
    } catch {
      // ignore
    }

    window.addEventListener("nnpilot-listing-filters-applied", function () {
      if (mode === "map") {
        /**
         * Re-entering list→map works because setMode("map") clears `lastListingGeomSyncSig` and
         * sync runs after a paint. Filter runs in the same turn as the event, so
         * `checkVisibility` / collect can still see a pre-reflow state. Invalidate the geom
         * cache and run sync after the next two frames so column `display: none` and
         * visibility are final.
         */
        lastListingGeomSyncSig = "";
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (mode === "map") {
              scheduleListingSync(0);
            }
          });
        });
      }
    });

    setMode("list");
    ensureListingsRootWatcher();
  }
})();
