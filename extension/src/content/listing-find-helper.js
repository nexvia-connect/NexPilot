(function () {
  "use strict";

  // Prevent double-injection
  if (window.nnListingFindLoaded) return;
  window.nnListingFindLoaded = true;

  let findId = null;

  const isImmotop = window.location.hostname.includes("immotop.lu");
  const isAthome = window.location.hostname.includes("athome.lu");
  const isWortimmo = window.location.hostname.includes("wortimmo.lu");

  function syncState() {
    let searchStr = window.location.search;
    const savedSearch = sessionStorage.getItem("immo_helper_search_find");

    if (savedSearch) {
      searchStr = savedSearch;
      sessionStorage.removeItem("immo_helper_search_find");
    }

    const queryParams = searchStr.replace("?", "").split("&").filter(Boolean);
    const findParam = queryParams.find((param) => param.startsWith("find="));

    if (findParam) {
      findId = findParam.split("=")[1];
      sessionStorage.setItem("immotop_find_id", findId);
      return;
    }

    if (queryParams.some((p) => p.startsWith("upgrade=") || p.startsWith("downgrade="))) {
      sessionStorage.removeItem("immotop_find_id");
      findId = null;
      return;
    }

    const storedFind = sessionStorage.getItem("immotop_find_id");
    if (storedFind) findId = storedFind;
  }

  function wireCopyButton({ buttonEl, tooltipEl, url }) {
    const icons = window.NexviaNoviaUI?.icons?.() || {};
    const setCopied = () => {
      buttonEl.style.background = "#2e7d32";
      buttonEl.style.borderColor = "#2e7d32";
      buttonEl.innerHTML = icons.check || "✓";
      if (tooltipEl) tooltipEl.style.opacity = "1";

      setTimeout(() => {
        buttonEl.style.background = "";
        buttonEl.style.borderColor = "";
        buttonEl.innerHTML = icons.copy || "⧉";
        if (tooltipEl) tooltipEl.style.opacity = "0";
      }, 2000);
    };

    const performCopy = () => {
      navigator.clipboard
        .writeText(url)
        .then(setCopied)
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[Nexvia Novia] Clipboard blocked until user gesture.", err);
        });
    };

    buttonEl.addEventListener("click", performCopy);
    performCopy(); // attempt auto-copy (may be blocked)
  }

  async function createPopup(url, imgSrc) {
    if (!window.NexviaNoviaUI?.createCard) return;

    const card = await window.NexviaNoviaUI.createCard({
      id: "listing-find-popup",
      title: "Listing Found",
      width: 420,
      anchor: "center"
    });

    // If it already existed, don't rebuild contents
    const body = window.NexviaNoviaUI.getBody(card);
    if (body.dataset.nnInit === "true") return;
    body.dataset.nnInit = "true";

    card.querySelector("[data-nn-close]")?.addEventListener("click", () => {
      findId = null;
      sessionStorage.removeItem("immotop_find_id");
    });

    body.innerHTML = `
      ${imgSrc ? `<img class="nn-img" src="${imgSrc}" alt="Listing image" />` : ""}
      <div class="nn-row">
        <input class="nn-input" type="text" readonly value="${url}" />
        <div style="position:relative; width:38px; flex: 0 0 38px;">
          <div class="nn-tooltip" data-nn-tooltip>Copied!</div>
          <button class="nn-btn" data-nn-copy title="Copy to clipboard">${window.NexviaNoviaUI.icons().copy}</button>
        </div>
      </div>
    `;

    const copyBtn = body.querySelector("[data-nn-copy]");
    const tooltip = body.querySelector("[data-nn-tooltip]");
    wireCopyButton({ buttonEl: copyBtn, tooltipEl: tooltip, url });
  }

  function enforceFind() {
    if (!findId) return;

    let containers = [];
    if (isImmotop) {
      containers = Array.from(document.querySelectorAll(".search-agency-item-container"));
    } else if (isAthome) {
      containers = Array.from(document.querySelectorAll("tbody tr.bg-white"));
    } else if (isWortimmo) {
      containers = Array.from(document.querySelectorAll('div[itemprop="itemListElement"]'));
    }

    let triggerPopupUrl = null;
    let triggerPopupImg = null;

    for (const container of containers) {
      let isMatch = false;
      let copyUrl = null;
      let imgUrl = null;

      if (isImmotop) {
        const desc = container.querySelector(".ad_desc");
        if (desc && desc.textContent.includes(`https://www.nexvia.lu/fr/buy/detail/${findId}`)) {
          isMatch = true;
          const link = container.querySelector('a[href*="/annonces/"]');
          if (link) {
            const match = link.href.match(/\/annonces\/(\d+)/);
            if (match?.[1]) copyUrl = `https://www.immotop.lu/annonces/${match[1]}/`;
          }
          const imgEl = container.querySelector(".search-agency-item-image img");
          if (imgEl) imgUrl = imgEl.getAttribute("data-src") || imgEl.src;
        }
      } else if (isAthome) {
        const refSpans = Array.from(container.querySelectorAll("span.text-xs.text-raven"));
        let refVal = null;
        let idVal = null;
        for (const span of refSpans) {
          const text = span.textContent || "";
          if (text.includes("Ref:")) refVal = text.replace("Ref:", "").trim();
          if (text.includes("ID:")) idVal = text.replace("ID:", "").trim();
        }
        if (refVal === findId && idVal) {
          isMatch = true;
          copyUrl = `https://www.athome.lu/id-${idVal}.html`;
          const imgEl = container.querySelector("img.object-cover");
          if (imgEl) imgUrl = imgEl.src;
        }
      } else if (isWortimmo) {
        const infoDivs = Array.from(container.querySelectorAll(".col-sm-5.col-xs-5"));
        for (const div of infoDivs) {
          if ((div.textContent || "").trim().includes(`_${findId}`)) {
            isMatch = true;
            const linkEl = container.querySelector("h2.title a");
            if (linkEl) copyUrl = linkEl.href;
            const imgSpan = container.querySelector(".imgs");
            if (imgSpan && imgSpan.style.backgroundImage) {
              imgUrl = imgSpan.style.backgroundImage.slice(4, -1).replace(/["']/g, "");
            }
            break;
          }
        }
      }

      if (isMatch && container.dataset.nnFindTriggered !== "true") {
        container.dataset.nnFindTriggered = "true";
        triggerPopupUrl = copyUrl;
        triggerPopupImg = imgUrl;
        break;
      }
    }

    if (triggerPopupUrl) createPopup(triggerPopupUrl, triggerPopupImg);
  }

  function initApp() {
    syncState();
    enforceFind();

    let mutTimeout;
    const observer = new MutationObserver(() => {
      clearTimeout(mutTimeout);
      mutTimeout = setTimeout(enforceFind, 150);
    });

    const waitForBody = setInterval(() => {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
        clearInterval(waitForBody);
      }
    }, 50);

    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        syncState();
        enforceFind();
      }
    }, 500);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();

