import { NEXVIA_BLUE } from "./site-tools.js";

const SIZES = [16, 32, 48];

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 */
function drawHexagonPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = Math.PI / 6 + i * (Math.PI / 3);
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Blue square, large white flat-top hexagon, blue count centered inside the hex
 * (no separate notification pill).
 * @param {number} size
 * @param {number} activeCount
 * @returns {ImageData}
 */
function drawAtSize(size, activeCount) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("2d context unavailable");
  }

  // 1) Full bleed Nexvia blue square
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = NEXVIA_BLUE;
  ctx.fillRect(0, 0, size, size);

  // 2) White hex slightly inset so more blue frame shows; still dominant in the tile.
  const margin = Math.max(0, Math.min(1, size * 0.02));
  const rMax = (size - 2 * margin) / 2;
  const r = rMax * 0.88;
  const cx = size / 2;
  const cy = size / 2;
  drawHexagonPath(ctx, cx, cy, r);
  ctx.fillStyle = "#ffffff";
  ctx.fill();

  // 3) Tool count: blue on white, centered in the hex (not a separate badge)
  if (activeCount > 0) {
    const label = activeCount > 99 ? "99+" : String(activeCount);
    // Use most of the hex interior for the digit(s).
    const safeR = r * 0.8;
    let fontSize =
      label === "99+"
        ? Math.max(4, Math.floor(size * 0.3))
        : label.length > 1
          ? Math.max(5, Math.floor(size * 0.36))
          : Math.max(6, Math.floor(size * 0.52));

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = NEXVIA_BLUE;

    for (let i = 0; i < 20; i += 1) {
      ctx.font = `800 ${fontSize}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
      const m = ctx.measureText(label);
      const w = m.width;
      const h =
        (m.actualBoundingBoxAscent ?? fontSize * 0.72) + (m.actualBoundingBoxDescent ?? fontSize * 0.22);
      if (w <= 2 * safeR * 0.96 && h <= 2 * safeR * 0.94) break;
      fontSize = Math.max(2, fontSize - 1);
    }

    ctx.fillText(label, cx, cy + size * 0.008);
  }

  return ctx.getImageData(0, 0, size, size);
}

/**
 * @param {number} activeCount
 * @returns {Record<number, ImageData>}
 */
export function buildActionIconForSizes(activeCount) {
  return Object.fromEntries(
    SIZES.map((s) => [s, drawAtSize(s, activeCount)])
  );
}
