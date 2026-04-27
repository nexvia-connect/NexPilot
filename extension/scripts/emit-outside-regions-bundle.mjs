#!/usr/bin/env node
/**
 * Reads `src/data/outside-municipality-regions.tsv` (Name<TAB>RegionLetter)
 * and writes `src/data/outside-municipality-regions.bundle.js`.
 * First occurrence of a name (accent-folded, case-insensitive) wins.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const tsvPath = path.join(root, "src/data/outside-municipality-regions.tsv");
const outPath = path.join(root, "src/data/outside-municipality-regions.bundle.js");

const tsv = fs.readFileSync(tsvPath, "utf8");
const rows = [];
const seen = new Set();

function fold(s) {
  return String(s)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

for (const line of tsv.split(/\r?\n/)) {
  const s = line.trim();
  if (!s) {
    continue;
  }
  const m = s.match(/^(.+?)\t([CSEWN])\s*$/);
  if (!m) {
    continue;
  }
  const name = m[1].trim();
  const reg = m[2];
  const k = fold(name);
  if (!k || seen.has(k)) {
    continue;
  }
  seen.add(k);
  rows.push([name, reg]);
}

const header = `/**
 * Outside-city municipality → region (Centre / South / East / West / North).
 * Regenerate from TSV: \`node scripts/emit-outside-regions-bundle.mjs\`
 * (do not fetch from a content script — Nexvia CSP blocks extension-origin fetch.)
 */
`;

const body = `${header}(function (g) {
  "use strict";
  g.nnOutsideMunicipalityRegionSpec = {
    regionOrder: ["C", "S", "E", "W", "N"],
    regionLabels: { C: "Centre", S: "South", E: "East", W: "West", N: "North" },
    rows: ${JSON.stringify(rows, null, 2)}
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
`;

fs.writeFileSync(outPath, body);
console.log("wrote", outPath, "rows", rows.length);
