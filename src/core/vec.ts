// Tiny 2D vector helpers. Pure; no DOM. Only what the core actually uses.

export interface Vec2 {
  x: number;
  y: number;
}

export const v2 = (x: number, y: number): Vec2 => ({ x, y });

export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);

/** Unit (or scaled) vector pointing along angle `a` (radians, CCW from +x). */
export const dir = (a: number, m = 1): Vec2 => ({ x: Math.cos(a) * m, y: Math.sin(a) * m });

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;
