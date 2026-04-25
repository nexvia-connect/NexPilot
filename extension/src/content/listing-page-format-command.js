(async function () {
  "use strict";

  if (window.nnListingFormatCmdLoaded) return;
  window.nnListingFormatCmdLoaded = true;

  const TOOL_KEY = "tool.listingPageFormatCommand";
  try {
    const enabled = self.__npToolEnabled
      ? await self.__npToolEnabled(TOOL_KEY, true)
      : (await chrome.storage.sync.get({ [TOOL_KEY]: true }))[TOOL_KEY];
    if (!enabled) return;
  } catch {
    // if storage fails, default to enabled
  }

  const LOG_STORAGE_KEY = "immo_sync_logs";
  const ID_STORAGE_KEY = "immo_cmd_up_session";

  // Keep your original behavior
  localStorage.removeItem("immo_cmd_up");

  // Never show Format upgrade UI while in find mode.
  // This also prevents stale sessionStorage upgrades from showing up on ?find= pages.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("find")) {
      sessionStorage.removeItem(ID_STORAGE_KEY);
      return;
    }
  } catch {
    // ignore
  }

  function getIdsFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const upgradeString = params.get("upgrade") || "";
    return upgradeString
      .split(",")
      .filter((id) => id.trim().length >= 7)
      .map((id) => id.trim());
  }

  let upgrades = JSON.parse(sessionStorage.getItem(ID_STORAGE_KEY) || "[]");
  const urlIds = getIdsFromUrl();

  if (urlIds.length > 0) {
    upgrades = urlIds;
    sessionStorage.setItem(ID_STORAGE_KEY, JSON.stringify(upgrades));
  }

  if (upgrades.length === 0) return;

  const DELAY = 1000;

  const addLog = (msg, type = "") => {
    const entry = { time: new Date().toLocaleTimeString(), msg, type };
    const logs = JSON.parse(sessionStorage.getItem(LOG_STORAGE_KEY) || "[]");
    logs.push(entry);
    sessionStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs));
  };

  function markTargetDone(ui, publicId) {
    const el = ui.badgeMap?.[publicId];
    if (el) el.classList.add("nn-active");
  }

  function findMatchedPublicId(internalId, publicUrl) {
    return upgrades.find((id) => internalId.includes(id) || publicUrl.includes(id)) || null;
  }

  async function scanListings() {
    let toUpgrade = [];
    let toDowngrade = [];
    let page = 1;
    let keepScanning = true;

    while (keepScanning && page <= 50) {
      try {
        const res = await fetch(`https://pro.immotop.lu/my-listings/index${page}.html`);
        if (!res.ok || res.redirected) {
          keepScanning = false;
          break;
        }

        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, "text/html");
        const listings = doc.querySelectorAll(".search-agency-item-container");

        if (listings.length === 0) {
          keepScanning = false;
          break;
        }

        listings.forEach((row) => {
          const internalId = row.getAttribute("data-id") || "";
          const publicUrl = row.querySelector("a.domingo")?.href || "";
          const isFirst = row.querySelector('button[data-role="featured"]')?.classList.contains("active");

          const matchedPublicId = findMatchedPublicId(internalId, publicUrl);

          if (matchedPublicId) {
            if (!isFirst) toUpgrade.push({ internalId, publicId: matchedPublicId });
            // If it's already in the "first" slot, treat as done for the pill UI.
            // (This is what the user wants to see as green *before* clicking start.)
            // We'll also mark again after a successful apply.
          } else if (isFirst) {
            toDowngrade.push(internalId);
          }
        });

        page++;
      } catch (e) {
        keepScanning = false;
      }
    }

    return { toUpgrade, toDowngrade, scannedPages: page - 1 };
  }

  async function markAlreadyFeaturedTargets(ui) {
    // Lightweight scan: only used to mark greens for targets already in first slot
    const { toUpgrade, toDowngrade: _d } = await scanListings();
    const notDone = new Set(toUpgrade.map((x) => x.publicId));
    for (const id of upgrades) {
      if (!notDone.has(id)) {
        markTargetDone(ui, id);
      }
    }
  }

  async function sendCommand(internalId, pName) {
    const body = `h_ajax=1&pName=${encodeURIComponent(pName)}&pArgs%5B0%5D=${encodeURIComponent(internalId)}`;
    await fetch(window.location.href, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body
    });
  }

  async function renderUI() {
    if (!window.NexPilotUI?.createCard) return null;

    const card = await window.NexPilotUI.createCard({
      id: "listing-format-command",
      title: "Format Changer",
      width: 480,
      anchor: "center"
    });

    const body = window.NexPilotUI.getBody(card);
    if (body.dataset.nnInit === "true") return { card, body };
    body.dataset.nnInit = "true";

    const badgesHtml = upgrades
      .map((id) => `<span class="nn-badge" data-nn-badge="${id}">${id}</span>`)
      .join("");

    body.innerHTML = `
      <div class="nn-badges" style="margin-bottom: 14px;">${badgesHtml}</div>
      <div class="nn-row" style="gap: 12px;">
        <button class="nn-btn nn-btn-primary" data-nn-start style="flex: 1;">APPLY ${upgrades.length} FORMATS</button>
        <button class="nn-btn nn-btn-ghost" data-nn-copy>COPY LOGS</button>
      </div>
    `;

    // Close/minimize is handled by shared UI (NexPilot pill).
    // Keep state so user can restore and continue.

    const badgeMap = {};
    body.querySelectorAll("[data-nn-badge]").forEach((el) => {
      badgeMap[el.getAttribute("data-nn-badge")] = el;
    });

    return { card, body, badgeMap };
  }

  async function processSync(ui) {
    const startBtn = ui.body.querySelector("[data-nn-start]");
    const copyBtn = ui.body.querySelector("[data-nn-copy]");

    startBtn.disabled = true;
    copyBtn.disabled = true;

    addLog("Sync started: Mapping listings to internal IDs...", "up");
    const scan = await scanListings();
    const toDowngrade = scan.toDowngrade;
    const toUpgrade = scan.toUpgrade;
    // Pre-mark "already in first" targets
    for (const id of upgrades) {
      if (!toUpgrade.find((x) => x.publicId === id)) {
        markTargetDone(ui, id);
      }
    }

    startBtn.textContent = `CLEARING SLOTS (${toDowngrade.length})...`;
    for (const id of toDowngrade) {
      addLog(`Downgrading non-target: ${id}`, "down");
      await sendCommand(id, "chListingFeat");
      await new Promise((r) => setTimeout(r, DELAY));
    }

    startBtn.textContent = `APPLYING UPGRADES (${toUpgrade.length})...`;
    for (const item of toUpgrade) {
      addLog(`Upgrading target: ${item.publicId}`, "up");
      await sendCommand(item.internalId, "chListingFeat");
      await sendCommand(item.internalId, "vis_ad_refresh");
      markTargetDone(ui, item.publicId);
      await new Promise((r) => setTimeout(r, DELAY));
    }

    startBtn.textContent = "COMPLETE ✓";
    addLog("✅ All background tasks finished.", "up");
    setTimeout(() => window.location.reload(), 2000);
  }

  (async function init() {
    const ui = await renderUI();
    if (!ui) return;

    // Show greens immediately for targets that are already mapped + featured
    try {
      await markAlreadyFeaturedTargets(ui);
    } catch {
      // ignore
    }

    ui.body.querySelector("[data-nn-start]").addEventListener("click", () => processSync(ui));

    ui.body.querySelector("[data-nn-copy]").addEventListener("click", () => {
      const logs = JSON.parse(sessionStorage.getItem(LOG_STORAGE_KEY) || "[]")
        .map((l) => `[${l.time}] ${l.msg}`)
        .join("\n");

      if (!logs.trim()) {
        alert("Logs are currently empty.");
        return;
      }

      navigator.clipboard.writeText(logs).then(() => {
        const btn = ui.body.querySelector("[data-nn-copy]");
        const original = btn.textContent;
        btn.textContent = "COPIED!";
        btn.style.color = "#10a37f";
        btn.style.borderColor = "rgba(16, 163, 127, 0.65)";
        setTimeout(() => {
          btn.textContent = original;
          btn.style.color = "";
          btn.style.borderColor = "";
        }, 2000);
      });
    });
  })();
})();

