import { describe, it, expect } from "vitest";
import { createGame, setGear, setThrottle } from "../src/game/state";
import { advance, commandedSpeed } from "../src/game/loop";
import type { GameState } from "../src/game/state";
import { DEFAULT_RIG } from "../src/rigs/rigs";
import { DEFAULT_SCENARIO } from "../src/scenarios/scenarios";
import { BEGINNER } from "../src/difficulty/difficulty";
import { computeCriticalGamma } from "../src/core/jackknife";

const reversing = () =>
  setThrottle(setGear(createGame(DEFAULT_RIG, DEFAULT_SCENARIO, BEGINNER), "reverse"), 1);

// Drive the loop the way the real rAF driver does: many small frames.
function simulate(gs: GameState, seconds: number, frameDt = 1 / 60): GameState {
  let s = gs;
  const frames = Math.round(seconds / frameDt);
  for (let i = 0; i < frames; i++) s = advance(s, frameDt);
  return s;
}

const substep = Math.abs(BEGINNER.maxReverseSpeed) * BEGINNER.physicsDt;

describe("game loop — fixed timestep", () => {
  it("straight reverse moves the car backward by ~v*t (within one substep), gamma stays 0", () => {
    const start = reversing();
    const gs = simulate(start, 1.0);
    const v = commandedSpeed(gs);
    expect(gs.physics.x).toBeLessThan(start.physics.x);
    expect(Math.abs(gs.physics.x - (start.physics.x + v * 1.0))).toBeLessThan(2 * substep);
    expect(Math.abs(gs.physics.trailerHeading - gs.physics.carHeading)).toBeLessThan(1e-9);
  });

  it("advance is pure/deterministic: same input gives identical output", () => {
    const a = simulate(reversing(), 1.0);
    const b = simulate(reversing(), 1.0);
    expect(b.physics.x).toBe(a.physics.x);
    expect(b.physics.carHeading).toBe(a.physics.carHeading);
  });

  it("splitting the run agrees to within one substep", () => {
    const single = simulate(reversing(), 1.0);
    const split = simulate(simulate(reversing(), 0.5), 0.5);
    expect(Math.abs(split.physics.x - single.physics.x)).toBeLessThan(2 * substep);
  });

  it("park gear holds the rig still", () => {
    const gs = simulate(createGame(DEFAULT_RIG, DEFAULT_SCENARIO, BEGINNER), 1.0);
    expect(gs.physics.x).toBe(DEFAULT_SCENARIO.start.x);
  });

  it("blocks reverse past the critical angle, but forward straightens it", () => {
    const crit = computeCriticalGamma(DEFAULT_RIG);
    // Start folded beyond the recoverable angle.
    let gs = setThrottle(setGear(createGame(DEFAULT_RIG, DEFAULT_SCENARIO, BEGINNER), "reverse"), 1);
    gs = { ...gs, physics: { ...gs.physics, trailerHeading: gs.physics.carHeading + crit + 0.1 } };
    const g0 = Math.abs(gs.physics.trailerHeading - gs.physics.carHeading);

    // Holding reverse must NOT worsen the fold (reverse is blocked).
    gs = simulate(gs, 0.5);
    expect(Math.abs(gs.physics.trailerHeading - gs.physics.carHeading)).toBeLessThanOrEqual(g0 + 1e-9);

    // Pulling forward straightens it back below where it started.
    gs = setThrottle(setGear(gs, "forward"), 1);
    gs = simulate(gs, 1.0);
    expect(Math.abs(gs.physics.trailerHeading - gs.physics.carHeading)).toBeLessThan(g0);
  });
});
