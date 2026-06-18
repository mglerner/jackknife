import { derive } from "../core/physics";
import type { Rig, State } from "../core/types";
import type { Vec2 } from "../core/vec";
import type { Obstacle, WorldBounds } from "../scenarios/types";

/** Oriented rectangle as 4 world corners (CCW): used for the car and trailer. */
function orientedRect(
  cx: number,
  cy: number,
  heading: number,
  halfLen: number,
  halfWid: number,
): Vec2[] {
  const c = Math.cos(heading);
  const s = Math.sin(heading);
  const fx = c;
  const fy = s; // forward
  const lx = -s;
  const ly = c; // left
  const corner = (a: number, b: number): Vec2 => ({
    x: cx + a * halfLen * fx + b * halfWid * lx,
    y: cy + a * halfLen * fy + b * halfWid * ly,
  });
  return [corner(1, 1), corner(1, -1), corner(-1, -1), corner(-1, 1)];
}

/** Car footprint: spans front bumper to rear bumper, width carWidth. */
export function carCorners(s: State, rig: Rig): Vec2[] {
  const frontX = rig.carFrontOverhang;
  const backX = -(rig.carLength - rig.carFrontOverhang);
  const halfLen = (frontX - backX) / 2;
  const midX = (frontX + backX) / 2;
  const cx = s.x + midX * Math.cos(s.carHeading);
  const cy = s.y + midX * Math.sin(s.carHeading);
  return orientedRect(cx, cy, s.carHeading, halfLen, rig.carWidth / 2);
}

/** Trailer footprint: spans the coupler/hitch to the tail, width trailerWidth. */
export function trailerCorners(s: State, rig: Rig): Vec2[] {
  const d = derive(s, rig, { v: 0, delta: 0 });
  const cx = (d.hitch.x + d.trailerTail.x) / 2;
  const cy = (d.hitch.y + d.trailerTail.y) / 2;
  const halfLen = Math.hypot(d.hitch.x - d.trailerTail.x, d.hitch.y - d.trailerTail.y) / 2;
  return orientedRect(cx, cy, d.trailerHeading, halfLen, rig.trailerWidth / 2);
}

function cross(ox: number, oy: number, ax: number, ay: number, bx: number, by: number): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox);
}

/** Do segments AB and CD intersect? */
function segSeg(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(c.x, c.y, d.x, d.y, a.x, a.y);
  const d2 = cross(c.x, c.y, d.x, d.y, b.x, b.y);
  const d3 = cross(a.x, a.y, b.x, b.y, c.x, c.y);
  const d4 = cross(a.x, a.y, b.x, b.y, d.x, d.y);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Is point p inside the convex polygon (corners CCW)? */
function pointInConvex(p: Vec2, poly: Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const cp = cross(a.x, a.y, b.x, b.y, p.x, p.y);
    if (cp !== 0) {
      const s = cp > 0 ? 1 : -1;
      if (sign === 0) sign = s;
      else if (sign !== s) return false;
    }
  }
  return true;
}

/** Does the segment AB touch the rectangle (corners CCW)? */
function segHitsRect(a: Vec2, b: Vec2, rect: Vec2[]): boolean {
  if (pointInConvex(a, rect) || pointInConvex(b, rect)) return true;
  for (let i = 0; i < rect.length; i++) {
    if (segSeg(a, b, rect[i], rect[(i + 1) % rect.length])) return true;
  }
  return false;
}

export interface RigCollision {
  wall: boolean; // hit a hard wall
  curb: boolean; // touched a curb (soft)
  bounds: boolean; // any corner outside the world
}

/** Test the car + trailer footprints against wall/curb segments and the bounds. */
export function rigCollision(
  s: State,
  rig: Rig,
  obstacles: Obstacle[],
  bounds: WorldBounds,
): RigCollision {
  const car = carCorners(s, rig);
  const trailer = trailerCorners(s, rig);
  let wall = false;
  let curb = false;
  for (const ob of obstacles) {
    if (ob.shape.type !== "segment") continue;
    const { a, b } = ob.shape;
    if (segHitsRect(a, b, car) || segHitsRect(a, b, trailer)) {
      if (ob.kind === "wall") wall = true;
      else if (ob.kind === "curb") curb = true;
    }
  }
  const outside = (p: Vec2): boolean =>
    p.x < bounds.minX || p.x > bounds.maxX || p.y < bounds.minY || p.y > bounds.maxY;
  const bnds = car.some(outside) || trailer.some(outside);
  return { wall, curb, bounds: bnds };
}
