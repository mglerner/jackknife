import type { Vec2 } from "../core/vec";
import type { WorldBounds } from "../scenarios/types";

/**
 * Maps world meters to CSS pixels. World +y is car LEFT (UP on screen); canvas y
 * grows DOWN, so the y axis is FLIPPED here. The drawing context is assumed to be
 * pre-scaled by `dpr` (caller sized the backing store), so we work in CSS px.
 */
export interface Camera {
  centerX: number; // world x at canvas center (m)
  centerY: number; // world y at canvas center (m)
  pxPerMeter: number;
  wCss: number; // viewport width (CSS px)
  hCss: number; // viewport height (CSS px)
  dpr: number;
}

/** World point -> screen (CSS px). Flips y so +y world points up on screen. */
export function worldToScreen(cam: Camera, p: Vec2): Vec2 {
  return {
    x: cam.wCss / 2 + (p.x - cam.centerX) * cam.pxPerMeter,
    y: cam.hCss / 2 - (p.y - cam.centerY) * cam.pxPerMeter,
  };
}

/**
 * Build a camera that frames `bounds` inside a `wCss` x `hCss` viewport, leaving
 * `marginPx` of padding on every edge. Picks the tighter of the two axis fits so
 * the whole world is visible.
 */
export function fitBounds(
  bounds: WorldBounds,
  wCss: number,
  hCss: number,
  dpr: number,
  marginPx = 24,
): Camera {
  const worldW = Math.max(bounds.maxX - bounds.minX, 1e-3);
  const worldH = Math.max(bounds.maxY - bounds.minY, 1e-3);
  const availW = Math.max(wCss - 2 * marginPx, 1);
  const availH = Math.max(hCss - 2 * marginPx, 1);
  const pxPerMeter = Math.min(availW / worldW, availH / worldH);
  return {
    centerX: (bounds.minX + bounds.maxX) / 2,
    centerY: (bounds.minY + bounds.maxY) / 2,
    pxPerMeter,
    wCss,
    hCss,
    dpr,
  };
}
