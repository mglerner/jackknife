import { describe, it, expect } from "vitest";
import { step, derive } from "../src/core/physics";
import { predictTailPath } from "../src/core/predict";
import type { Rig, State } from "../src/core/types";

// Self-contained test rig (physics tests must not depend on rigs/ data).
const RIG: Rig = {
  id: "test",
  label: "Test",
  W: 3.0,
  L: 1.1,
  D: 1.8,
  maxSteer: 0.55,
  carLength: 5,
  carWidth: 2,
  carFrontOverhang: 0.9,
  trailerLength: 3,
  trailerWidth: 1.8,
  trailerRearOverhang: 0.6,
  hardLimitGamma: 1.309, // ~75°
  loadBlocksCamera: false,
  axleConfig: "single",
};

const straight = (): State => ({ x: 0, y: 0, carHeading: 0, trailerHeading: 0 });
const gammaOf = (s: State): number => s.trailerHeading - s.carHeading;

function run(s0: State, delta: number, v: number, seconds: number, dt = 1 / 120): State {
  let s = s0;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) s = step(s, RIG, { delta, v, dt });
  return s;
}

describe("physics — sign conventions (hard gate)", () => {
  it("straight reverse holds gamma = 0 (fixed point)", () => {
    const s = run(straight(), 0, -1, 3);
    expect(Math.abs(gammaOf(s))).toBeLessThan(1e-9);
    expect(s.x).toBeLessThan(0); // moved straight back along -x
    expect(Math.abs(s.y)).toBeLessThan(1e-9);
  });

  it("forward + no steer self-centers gamma (pins the minus sign)", () => {
    const s0: State = { x: 0, y: 0, carHeading: 0, trailerHeading: 0.3 };
    const s = run(s0, 0, +1, 2);
    const g = gammaOf(s);
    expect(g).toBeGreaterThan(0); // didn't overshoot through zero in this window
    expect(g).toBeLessThan(0.3); // shrank toward zero — trailer self-centers going forward
  });

  it("reverse + no steer grows gamma (jackknife instability)", () => {
    const s0: State = { x: 0, y: 0, carHeading: 0, trailerHeading: 0.1 };
    const s = run(s0, 0, -1, 1.5);
    expect(gammaOf(s)).toBeGreaterThan(0.1);
  });

  it("reverse + positive delta drives gamma positive (pins delta<->world)", () => {
    // delta>0 = wheels CCW/left; in REVERSE this swings the trailer CCW (gamma>0),
    // i.e. the trailer's tail goes to the vehicle's RIGHT (-y). The classic inversion.
    const s = run(straight(), 0.3, -1, 1.0);
    expect(gammaOf(s)).toBeGreaterThan(0);
    const tail = derive(s, RIG, { v: -1, delta: 0.3 }).trailerTail;
    expect(tail.y).toBeLessThan(0); // tail to vehicle's right
  });

  it("forward recovery reduces a large recoverable gamma", () => {
    const s0: State = { x: 0, y: 0, carHeading: 0, trailerHeading: 0.5 };
    const s = run(s0, 0, +1, 1.0);
    expect(gammaOf(s)).toBeLessThan(0.5);
  });

  it("numeric regression: one substep from straight reverse + steer", () => {
    const dt = 1 / 120;
    const s = step(straight(), RIG, { delta: 0.3, v: -1, dt });
    const expectedCarHeading = (-1 / RIG.W) * Math.tan(0.3) * dt;
    expect(s.carHeading).toBeCloseTo(expectedCarHeading, 12);
    // gamma after one step from 0 = gammaDot(0) * dt
    const gammaDot0 = -(-1 / RIG.W) * Math.tan(0.3) * (1 + RIG.L / RIG.D);
    expect(gammaOf(s)).toBeCloseTo(gammaDot0 * dt, 12);
  });
});

describe("predict — ghost path", () => {
  it("straight reverse predicts a straight ghost", () => {
    const pts = predictTailPath(straight(), RIG, { v: -1, delta: 0 }, 2);
    expect(pts.length).toBeGreaterThan(1);
    expect(Math.max(...pts.map((p) => Math.abs(p.y)))).toBeLessThan(1e-9);
    expect(pts[pts.length - 1].x).toBeLessThan(pts[0].x); // moving backward
  });
});
