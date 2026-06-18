import { describe, it, expect } from "vitest";
import { steerFromBottomWheel, normalizeDrag } from "../src/input/bottomWheel";
import { step, derive } from "../src/core/physics";
import type { Rig, State } from "../src/core/types";

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
  hardLimitGamma: 1.309,
  loadBlocksCamera: false,
  axleConfig: "single",
};

const straight = (): State => ({ x: 0, y: 0, carHeading: 0, trailerHeading: 0 });

function reverseWith(delta: number, seconds = 1.0, dt = 1 / 120): State {
  let s = straight();
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) s = step(s, RIG, { delta, v: -1, dt });
  return s;
}

describe("bottom-of-wheel mapping (joint input -> physics)", () => {
  it("bottom pushed RIGHT (u>0) sends the trailer tail to the vehicle's right in reverse", () => {
    const delta = steerFromBottomWheel(0.8, RIG.maxSteer);
    expect(delta).toBeGreaterThan(0);
    const d = derive(reverseWith(delta), RIG, { v: -1, delta });
    expect(d.gamma).toBeGreaterThan(0);
    expect(d.trailerTail.y).toBeLessThan(0); // vehicle's right = world -y
  });

  it("bottom pushed LEFT (u<0) sends the trailer tail to the vehicle's left", () => {
    const delta = steerFromBottomWheel(-0.8, RIG.maxSteer);
    expect(delta).toBeLessThan(0);
    const d = derive(reverseWith(delta), RIG, { v: -1, delta });
    expect(d.gamma).toBeLessThan(0);
    expect(d.trailerTail.y).toBeGreaterThan(0); // vehicle's left = world +y
  });

  it("clamps the steer angle to +/- maxSteer", () => {
    expect(steerFromBottomWheel(5, RIG.maxSteer)).toBeCloseTo(RIG.maxSteer);
    expect(steerFromBottomWheel(-5, RIG.maxSteer)).toBeCloseTo(-RIG.maxSteer);
  });

  it("normalizeDrag maps pointer offset to [-1, 1] and clamps", () => {
    expect(normalizeDrag(150, 100, 50)).toBe(1); // at +halfWidth
    expect(normalizeDrag(75, 100, 50)).toBeCloseTo(-0.5);
    expect(normalizeDrag(1000, 100, 50)).toBe(1); // beyond edge -> clamped
  });
});
