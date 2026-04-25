/* Easy Reference Insert — port of “Easy ref insert (final fix)” userscript.
   Inserts ref into listing URL in textarea (target sentences only) and normalizes dashes. */
(async function () {
  "use strict";

  if (window.nnEasyRefInsert) return;

  const TOOL_KEY = "tool.easyReferenceInsert";
  const OPT_URL = "option.easyRefInsert.urlInDescription";
  const OPT_DASH = "option.easyRefInsert.dashToHyphen";
  const DEFAULT_OPTS = { [OPT_URL]: true, [OPT_DASH]: true };

  let refOpts = { ...DEFAULT_OPTS };

  try {
    const enabled = self.__npToolEnabled
      ? await self.__npToolEnabled(TOOL_KEY, true)
      : (await chrome.storage.sync.get({ [TOOL_KEY]: true }))[TOOL_KEY];
    if (!enabled) return;
  } catch {
    // default on
  }

  window.nnEasyRefInsert = true;

  async function loadRefOpts() {
    const r = await chrome.storage.sync.get(DEFAULT_OPTS);
    refOpts = { ...DEFAULT_OPTS, ...r };
  }

  try {
    await loadRefOpts();
  } catch {
    // use defaults
  }

  if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      const hit = [OPT_URL, OPT_DASH].some((k) => Object.prototype.hasOwnProperty.call(changes, k));
      if (!hit) return;
      void loadRefOpts().then(() => {
        scheduleUpdate();
      });
    });
  }

  const getRefNumber = () => {
    const divs = document.querySelectorAll("div");
    for (const div of divs) {
      const nodes = div.childNodes;
      if (
        nodes.length === 2 &&
        nodes[0].nodeType === Node.TEXT_NODE &&
        nodes[0].textContent.trim() === "Réf." &&
        nodes[1].nodeName === "STRONG"
      ) {
        const ref = nodes[1].textContent.trim().replace(/\D/g, "");
        if (ref) return ref;
      }
    }
    return null;
  };

  const shouldReplaceInSentence = (sentence) => {
    const trimmed = sentence.trimStart();
    return (
      trimmed.startsWith("Notre annonce complète") ||
      trimmed.startsWith("Our full listing")
    );
  };

  const replaceLinkInSentence = (sentence, ref) => {
    const urls = ["https://www.nexvia.lu/fr/buy/detail/", "https://www.nexvia.lu/buy/detail/"];
    let replaced = sentence;
    for (const base of urls) {
      const pattern = new RegExp(`${base}(\\d*)`, "g");
      replaced = replaced.replace(pattern, (match, oldId) =>
        oldId !== ref ? `${base}${ref}` : match
      );
    }
    return replaced;
  };

  const replaceDashes = (text) => text.replace(/[\u2013\u2014\u2015]/g, "-");

  const updateTextarea = () => {
    const useUrl = refOpts[OPT_URL] !== false;
    const useDash = refOpts[OPT_DASH] !== false;

    const ref = useUrl ? getRefNumber() : null;
    const textarea = document.querySelector("textarea.extended-textarea");
    if (!textarea) return;

    let original = textarea.value;
    let modified = false;

    if (useDash) {
      const dashedReplaced = replaceDashes(original);
      if (dashedReplaced !== original) {
        original = dashedReplaced;
        modified = true;
      }
    }

    if (!ref && !modified) return;

    const scrollPos = textarea.scrollTop;
    const selStart = textarea.selectionStart;
    const selEnd = textarea.selectionEnd;

    let finalValue = original;
    if (ref) {
      const lines = original.split(/\n/);
      const updatedLines = lines.map((line) => {
        if (shouldReplaceInSentence(line)) {
          const replaced = replaceLinkInSentence(line, ref);
          if (replaced !== line) {
            modified = true;
            return replaced;
          }
        }
        return line;
      });
      finalValue = updatedLines.join("\n");
    }

    if (modified) {
      textarea.value = finalValue;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.scrollTop = scrollPos;
      textarea.setSelectionRange(selStart, selEnd);
    }
  };

  let raf = 0;
  function scheduleUpdate() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      updateTextarea();
    });
  }

  updateTextarea();
  new MutationObserver(() => {
    scheduleUpdate();
  }).observe(document.body, { childList: true, subtree: true });
  setInterval(updateTextarea, 1000);
})();
