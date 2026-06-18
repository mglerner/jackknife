import type { Rig, State } from "./types";
import type { Vec2 } from "./vec";
import { derive, step } from "./physics";

/**
 * Forward-simulate the trailer tail over a fixed horizon, HOLDING the current
 * delta and v constant — this is the "where will the tail go if I keep this
 * input" ghost overlay. Reuses the real physics; no separate model.
 */
export function predictTailPath(
  s: State,
  rig: Rig,
  cmd: { v: number; delta: number },
  horizonSec: number,
  dt = 1 / 60,
): Vec2[] {
  const pts: Vec2[] = [];
  let cur = s;
  const steps = Math.max(1, Math.round(horizonSec / dt));
  for (let i = 0; i < steps; i++) {
    cur = step(cur, rig, { delta: cmd.delta, v: cmd.v, dt });
    pts.push(derive(cur, rig, cmd).trailerTail);
  }
  return pts;
}
