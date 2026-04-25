/**
 * Load first in each content_script bundle. Exposes:
 *   self.__npToolEnabled(toolKey, defaultOn) -> Promise<boolean>
 * Default per-tool is on when the key is missing, matching `storage.sync.get({ [key]: true })`.
 * When master is off, all tools are effectively off without changing per-tool storage.
 */
(function (g) {
  var M = "nn.toolsMasterEnabled";
  g.__NP_MASTER_KEY = M;
  g.__npToolEnabled = function (toolKey, defaultOn) {
    var d = { [M]: true };
    d[toolKey] = defaultOn !== false;
    return chrome.storage.sync.get(d).then(function (r) {
      if (r[M] === false) return false;
      return r[toolKey] !== false;
    });
  };
})(typeof self !== "undefined" ? self : this);
