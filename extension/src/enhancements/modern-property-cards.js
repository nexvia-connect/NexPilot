/**
 * Modern property cards — card styling plus left/right gallery preview on listing search pages.
 */
(function () {
  "use strict";

  if (window.nnModernPropertyCardsLoaded) return;
  window.nnModernPropertyCardsLoaded = true;

  const TOOL_KEY = "tool.modernPropertyCards";

  (async function boot() {
    try {
      const ok = self.__npToolEnabled
        ? await self.__npToolEnabled(TOOL_KEY, true)
        : (await chrome.storage.sync.get({ [TOOL_KEY]: true }))[TOOL_KEY];
      if (ok === false) return;
    } catch {
      // default on
    }

    run();
  })();

  const EXC_HERO_IMAGE_URL =
    "https://nexvia-listings.b-cdn.net/stored-photo/19650b62-7b11-11e9-8606-0cc47a9452c2/5397331_2[.jpg]?optimizer=image&width=1920&height=1080&format=jpeg&quality=80&nxversion=5fb732d3f6f7aef464f5878c9329d22a";

  function addStyles(css) {
    const s = document.createElement("style");
    s.setAttribute("data-nnpilot", "modern-property-cards");
    s.textContent = css;
    document.head.appendChild(s);
  }

  function ensureSatisfyFont() {
    if (document.querySelector("link[data-nnpilot-satisfy-font]")) {
      return;
    }
    const fl = document.createElement("link");
    fl.rel = "stylesheet";
    fl.href = "https://fonts.googleapis.com/css2?family=Satisfy&display=swap";
    fl.setAttribute("data-nnpilot-satisfy-font", "1");
    document.head.appendChild(fl);
  }

  function run() {
    const css = `
        #listingsContainer.nnpilot-exc-hero--active .unavailablePropertiesSeparatorWrapper,
        #listingsContainer.nnpilot-exc-hero--active [data-nnpilot-sold-separator-row] {
            display: none !important;
        }
        /* Single root: no Bootstrap .row (negative margins misalign vs. listing grid). */
        [data-nnpilot-exc-hero-row].nnpilot-exc-hero {
            --nnpilot-exc-img: none;
            position: relative;
            width: 100%;
            max-width: 100%;
            height: 300px;
            margin: 0 0 30px;
            padding: 0;
            box-sizing: border-box;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
        }
        .nnpilot-exc-hero__backdrop {
            position: absolute;
            inset: 0;
            background-color: #1a1a1a;
            background-size: cover;
            background-position: center;
            background-image: linear-gradient(rgba(0, 0, 0, 0.5), rgba(0, 0, 0, 0.5)), var(--nnpilot-exc-img);
        }
        .nnpilot-exc-hero__stack {
            position: relative;
            z-index: 1;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 16px 20px;
            box-sizing: border-box;
            font-family: "Gotham A", "Gotham B", "Gotham SSm A", "Gotham SSm B", Gotham, "Helvetica Neue", Helvetica, Arial, sans-serif;
            color: #fff;
        }
        .nnpilot-exc-hero__line {
            margin: 0;
            max-width: 70rem;
            line-height: 1.2;
            font-size: 3rem;
            font-weight: 500;
        }
        .nnpilot-exc-hero__line--sub {
            margin-top: 0.35rem;
            font-size: 2rem;
            font-weight: 400;
            line-height: 1.3;
        }
        .nnpilot-exc-hero__accent {
            font-family: Satisfy, cursive;
            color: #fc3366;
            font-size: 1.15em;
            font-weight: 400;
        }
        .nnpilot-exc-hero__chevs {
            display: flex;
            flex-direction: column;
            align-items: center;
            margin-top: 10px;
            color: rgba(255, 255, 255, 0.9);
            pointer-events: none;
        }
        .nnpilot-exc-hero__chev {
            display: block;
            width: 22px;
            height: 11px;
            flex-shrink: 0;
            animation: nnpilot-exc-hero-chev-nudge 2.2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
        .nnpilot-exc-hero__chev + .nnpilot-exc-hero__chev {
            margin-top: -4px;
            animation-delay: 0.14s;
        }
        @keyframes nnpilot-exc-hero-chev-nudge {
            0%, 100% {
                transform: translateY(0);
                opacity: 0.42;
            }
            50% {
                transform: translateY(4px);
                opacity: 0.98;
            }
        }
        @media (prefers-reduced-motion: reduce) {
            .nnpilot-exc-hero__chev {
                animation: none;
                opacity: 0.72;
            }
            .nnpilot-exc-hero__chev + .nnpilot-exc-hero__chev {
                opacity: 0.48;
            }
        }
        .listings-item-wrapper {
            display: block;
            background: #ffffff !important;
            border-radius: 10px !important;
            overflow: hidden;
            margin-bottom: 30px;
            border: none !important;
            text-decoration: none !important;
            box-shadow: 0 0 20px rgba(0, 0, 0, 0.1);
            transition: transform 0.45s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.45s cubic-bezier(0.23, 1, 0.32, 1) !important;
            will-change: transform;
        }

        .listings-item-header {
            border-radius: 10px 10px 0 0 !important;
            background-size: cover !important;
            background-position: center !important;
            position: relative;
            transition: transform 0.6s cubic-bezier(0.23, 1, 0.32, 1) !important;
            will-change: transform;
        }

        .listings-item-wrapper:hover {
            transform: scale(1.01);
            box-shadow: 0 0 30px rgba(0, 0, 0, 0.15) !important;
            z-index: 10;
        }

        .listings-item-wrapper:hover .listings-item-header {
            transform: scale(1.04);
        }

        .listings-item-body {
            background-color: #ffffff !important;
            padding: 15px 20px !important;
            border: none !important;
            position: relative;
            z-index: 2;
        }

        .listings-item {
            border: none !important;
            background: transparent !important;
            margin-bottom: 0px !important;
        }

        .listings-item-city-neighborhood {
            font-weight: 800 !important;
            color: #1a1a1a !important;
            font-size: 1.1rem;
            margin-bottom: 4px;
        }

        .listings-item-street {
            color: #666 !important;
            font-size: 1.2rem;
            margin-bottom: 12px;
        }

        .listing-icons-separator {
            color: #ccc !important;
        }

        .listings-item-wrapper .listing-icons-icon-bed .fa-bed-alt:before {
            font-size: 15px !important;
        }

        .carousel-hitbox {
            position: absolute;
            top: 0;
            bottom: 0;
            width: 18%;
            display: flex;
            align-items: center;
            color: white;
            opacity: 0;
            transition: opacity 0.3s ease;
            z-index: 20;
        }

        .listings-item-wrapper:hover .carousel-hitbox {
            opacity: 1;
        }

        .carousel-left {
            left: 0;
            justify-content: flex-start;
            padding-left: 10px;
            background: linear-gradient(to right, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 100%);
        }

        .carousel-right {
            right: 0;
            justify-content: flex-end;
            padding-right: 10px;
            background: linear-gradient(to left, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0) 100%);
        }

        .carousel-hitbox svg {
            width: 32px;
            height: 32px;
            filter: drop-shadow(0px 1px 3px rgba(0,0,0,0.3));
            transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), stroke-width 0.2s ease;
        }

        .carousel-hitbox.disabled svg {
            stroke: rgba(255, 255, 255, 0.3);
            filter: none;
        }

        .carousel-hitbox.disabled {
            cursor: not-allowed;
        }

        .carousel-hitbox:not(.disabled) {
            cursor: pointer;
        }

        .carousel-hitbox:not(.disabled):hover svg {
            transform: scale(1.15);
            stroke-width: 2;
        }
    `;
    addStyles(css);
    ensureSatisfyFont();

    const svgLeft =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';
    const svgRight =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

    function listingsDomRoot() {
      return document.getElementById("listingsContainer") || document.body;
    }

    function buildExcHeroRow() {
      const hero = document.createElement("div");
      hero.setAttribute("data-nnpilot-exc-hero-row", "");
      hero.className = "nnpilot-exc-hero";
      hero.style.setProperty("--nnpilot-exc-img", "url('" + EXC_HERO_IMAGE_URL.replace(/'/g, "\\'") + "')");

      const chev =
        '<svg class="nnpilot-exc-hero__chev" viewBox="0 0 24 12" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l9 6 9-6"/></svg>';
      hero.innerHTML =
        '<div class="nnpilot-exc-hero__backdrop" aria-hidden="true"></div>' +
        '<div class="nnpilot-exc-hero__stack">' +
        '<p class="nnpilot-exc-hero__line"><span>A selection of </span>' +
        '<span class="nnpilot-exc-hero__accent">exceptional</span>' +
        "<span> properties.</span></p>" +
        '<p class="nnpilot-exc-hero__line nnpilot-exc-hero__line--sub">Sold by Nexvia.</p>' +
        '<div class="nnpilot-exc-hero__chevs" aria-hidden="true">' +
        chev +
        chev +
        "</div></div>";

      return hero;
    }

    function placeExcHero(listingsContainer) {
      let row = listingsContainer.querySelector("[data-nnpilot-exc-hero-row]");
      if (!row) {
        row = buildExcHeroRow();
        const sortBar = listingsContainer.querySelector(".nnpilot-listings-sort-bar");
        if (sortBar) {
          sortBar.insertAdjacentElement("afterend", row);
        } else {
          listingsContainer.insertBefore(row, listingsContainer.firstChild);
        }
      }
    }

    function ensureExceptionalHero(listingsContainer) {
      if (listingsContainer.id !== "listingsContainer" || !listingsContainer.classList.contains("nnpilot-exc-hero--active")) {
        return;
      }
      placeExcHero(listingsContainer);
    }

    function removeExceptionalHerosIfNeeded(root) {
      if (root.id === "listingsContainer" && root.classList.contains("nnpilot-exc-hero--active")) {
        return;
      }
      root.querySelectorAll("[data-nnpilot-exc-hero-row]").forEach((n) => n.remove());
    }

    function upgradeBedIcons(root) {
      const r = root || document;
      const scope = ".listings-item-wrapper .listing-icons-icon-bed i";
      r.querySelectorAll(`${scope}.fas.fa-bed`).forEach((el) => {
        el.classList.remove("fas", "fa-bed");
        el.classList.add("fal", "fa-bed-alt");
      });
      r.querySelectorAll(`${scope}.fa-solid.fa-bed`).forEach((el) => {
        el.classList.remove("fa-solid", "fa-bed");
        el.classList.add("fa-light", "fa-bed-alt");
      });
    }

    function initCarousels(root) {
      const r = root || document;
      const listings = r.querySelectorAll(".listings-item-wrapper:not(.carousel-initialized)");

      listings.forEach((wrapper) => {
        wrapper.classList.add("carousel-initialized");

        const header = wrapper.querySelector(".listings-item-header");
        if (!header) return;

        header.insertAdjacentHTML(
          "beforeend",
          `<div class="carousel-hitbox carousel-left disabled">${svgLeft}</div>
                <div class="carousel-hitbox carousel-right">${svgRight}</div>`
        );

        const leftBtn = header.querySelector(".carousel-left");
        const rightBtn = header.querySelector(".carousel-right");
        const listingUrl = wrapper.getAttribute("href");

        let images = [];
        let currentIndex = 0;
        let isFetching = false;
        let hasFetched = false;

        const bgImageStyle = header.style.backgroundImage;
        if (bgImageStyle) {
          const cleanUrl = bgImageStyle.slice(4, -1).replace(/["']/g, "");
          images.push(cleanUrl);
        }

        async function fetchImages() {
          if (!listingUrl) return;
          isFetching = true;
          rightBtn.style.opacity = "0.5";

          try {
            const response = await fetch(listingUrl);
            const htmlText = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlText, "text/html");

            const fetchedImages = Array.from(doc.querySelectorAll("img"))
              .map((img) => img.src || img.getAttribute("data-src"))
              .filter((src) => src && src.includes("stored-photo"));

            if (fetchedImages.length > 0) {
              images = [...new Set(fetchedImages)];
            }

            hasFetched = true;
          } catch (error) {
            console.error("NexPilot modern cards: gallery fetch failed", error);
          } finally {
            rightBtn.style.opacity = "";
            isFetching = false;
          }
        }

        function updateCarousel() {
          if (images.length > 0 && images[currentIndex]) {
            header.style.backgroundImage = `url('${images[currentIndex]}')`;
          }

          leftBtn.classList.toggle("disabled", currentIndex === 0);

          const atEnd = hasFetched ? currentIndex === images.length - 1 : false;
          rightBtn.classList.toggle("disabled", atEnd);
        }

        leftBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (isFetching) return;
          if (!hasFetched) await fetchImages();

          if (currentIndex > 0) {
            currentIndex--;
            updateCarousel();
          }
        });

        rightBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (isFetching) return;
          if (!hasFetched) await fetchImages();

          if (currentIndex < images.length - 1) {
            currentIndex++;
            updateCarousel();
          }
        });

        updateCarousel();
      });
    }

    function tick() {
      const root = listingsDomRoot();
      if (
        root.id === "listingsContainer" &&
        typeof window !== "undefined" &&
        !window.location.pathname.includes("/buy/outstanding")
      ) {
        root.classList.remove("nnpilot-exc-hero--active");
      }
      if (root.id === "listingsContainer" && root.classList.contains("nnpilot-exc-hero--active")) {
        ensureExceptionalHero(root);
      } else {
        removeExceptionalHerosIfNeeded(root);
      }
      upgradeBedIcons(root);
      initCarousels(root);
    }

    let tickDebounce = 0;
    function scheduleTick() {
      if (tickDebounce) {
        clearTimeout(tickDebounce);
      }
      tickDebounce = setTimeout(() => {
        tickDebounce = 0;
        tick();
      }, 120);
    }

    tick();
    const listingsObserver = new MutationObserver(() => {
      scheduleTick();
    });
    listingsObserver.observe(listingsDomRoot(), { childList: true, subtree: true });
  }
})();
