/**
 * Luxembourg-City neighbourhood groupings (loaded before advanced-nexvia-filters.js).
 * Do not use fetch from a content script — Nexvia CSP blocks extension-origin requests.
 * Keep in sync with `luxembourg-city-neighbourhood-groups.json` when you edit either file.
 */
(function (g) {
  "use strict";
  g.nnLuxCityNeighbourhoodGroupSpec = {
    groups: [
      { label: "Beggen/Eich", aliases: ["Beggen", "Eich"] },
      { label: "Belair/Merl", aliases: ["Belair", "Merl"] },
      {
        label: "Bonnevoie",
        aliases: [
          "Bonnevoie",
          "Bonnevoie-Nord",
          "Bonnevoie-Sud",
          "Bonnevoie-Est",
          "Bonnevoie Nord",
          "Bonnevoie Sud",
          "Bonnevoie Est",
          "Verlorenkost",
          "Verloren Kost",
        ],
      },
      {
        label: "Cents/Hamm/Pulvermühle",
        aliases: ["Cents", "Hamm", "Pulvermühle", "Pulvermuhle", "Pulvermuehle"],
      },
      { label: "Cessange/Gasperich", aliases: ["Cessange", "Cessage", "Gasperich"] },
      { label: "Clausen/Grund/Pfaffenthal", aliases: ["Clausen", "Grund", "Pfaffenthal"] },
      { label: "Dommeldange/Weimerskirch", aliases: ["Dommeldange", "Weimerskirch"] },
      { label: "Gare/Hollerich", aliases: ["Gare", "Hollerich"] },
      { label: "Kirchberg/Weimershof", aliases: ["Kirchberg", "Weimershof"] },
      { label: "Limpertsberg", aliases: ["Limpertsberg"] },
      {
        label: "Mühlenbach/Rollingergrund",
        aliases: ["Mühlenbach", "Muhlenbach", "Muehlenbach", "Rollingergrund"],
      },
      { label: "Neudorf", aliases: ["Neudorf"] },
      { label: "Ville-Haute", aliases: ["Ville-Haute", "Ville Haute", "Villehaute"] },
    ],
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
