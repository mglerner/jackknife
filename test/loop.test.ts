import { describe, it, expect } from "vitest";
import { createGame, setGear, setThrottle } from "../src/game/state";
import { advance, commandedSpeed } from "../src/game/loop";
import type { GameState } from "../src/game/state";
import { DEFAULT_RIG } from "../src/rigs/rigs";
import { DEFAULT_SCENARIO } from "../src/scenarios/scenarios";
import { BEGINNER } from "../src/difficulty/difficulty";
import { computeCriticalGamma } from "../src/core/jackknife";

// An explicit straight, axis-aligned pose (the scenario start is angled).
const straightGame = (): GameState => ({
  ...createGame(DEFAULT_RIG, DEFAULT_SCENARIO, BEGINNER),
  physics: { x: 0, y: 0, carHeading: 0, trailerHeading: 0 },
});
const reversing = () => setThrottle(setGear(straightGame(), "reverse"), 1);

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

  it("blocks the rig at the world boundary and counts a contact", () => {
    let gs = createGame(DEFAULT_RIG, DEFAULT_SCENARIO, BEGINNER);
    gs = { ...gs, physics: { x: 12, y: 0, carHeading: 0, trailerHeading: 0 } };
    gs = setThrottle(setGear(gs, "forward"), 1);
    const after = simulate(gs, 4.0); // unblocked this would run well past maxX (18)
    expect(after.physics.x).toBeLessThan(15); // stopped at the boundary
    expect(after.session.wallContacts).toBeGreaterThan(0);
  });

  it("park gear holds the rig still", () => {
    const gs = simulate(createGame(DEFAULT_RIG, DEFAULT_SCENARIO, BEGINNER), 1.0);
    expect(gs.physics.x).toBe(DEFAULT_SCENARIO.start.x);
  });

  it("counts a pull-up only after actually reversing (not idle gear toggles)", () => {
    let gs = createGame(DEFAULT_RIG, DEFAULT_SCENARIO, BEGINNER);
    // Toggle reverse -> forward at rest: no real reversing happened.
    gs = setGear(gs, "reverse");
    gs = setGear(gs, "forward");
    expect(gs.session.pullForwards).toBe(0);

    // Actually reverse and move, then pull forward: that is a real pull-up.
    gs = setThrottle(setGear(gs, "reverse"), 1);
    gs = simulate(gs, 0.4);
    gs = setGear(gs, "forward");
    expect(gs.session.pullForwards).toBe(1);
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
