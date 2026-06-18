import { describe, it, expect } from "vitest";
import { computeCriticalGamma, classify } from "../src/core/jackknife";
import type { Rig } from "../src/core/types";

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

// gammaDot from the canonical EOM, used only to verify the critical-angle property.
const gammaDot = (g: number, v: number, delta: number): number =>
  -(v / RIG.D) * Math.sin(g) - (v / RIG.W) * (1 + (RIG.L / RIG.D) * Math.cos(g)) * Math.tan(delta);

describe("jackknife — critical angle", () => {
  it("criticalGamma is within (0, hardLimitGamma)", () => {
    const c = computeCriticalGamma(RIG);
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(RIG.hardLimitGamma);
  });

  it("full counter-steer nulls growth just below critical, not above", () => {
    const c = computeCriticalGamma(RIG);
    // gamma>0 jackknifing in reverse; full opposite lock = -maxSteer.
    expect(gammaDot(c - 0.05, -1, -RIG.maxSteer)).toBeLessThan(0); // recovering
    expect(gammaDot(c + 0.05, -1, -RIG.maxSteer)).toBeGreaterThan(0); // diverging
  });

  it("the critical condition is v-independent (geometry only)", () => {
    const c = computeCriticalGamma(RIG);
    for (const v of [-0.5, -2.0, -5.0]) {
      expect(Math.abs(gammaDot(c, v, -RIG.maxSteer))).toBeLessThan(1e-6);
    }
  });

  it("classify transitions ok -> warn -> recoverable -> contact", () => {
    const c = computeCriticalGamma(RIG);
    expect(classify(0, c, RIG.hardLimitGamma)).toBe("ok");
    expect(classify(0.9 * c, c, RIG.hardLimitGamma)).toBe("warn");
    expect(classify(c + 0.01, c, RIG.hardLimitGamma)).toBe("recoverable");
    expect(classify(RIG.hardLimitGamma, c, RIG.hardLimitGamma)).toBe("contact");
    // sign-symmetric
    expect(classify(-(c + 0.01), c, RIG.hardLimitGamma)).toBe("recoverable");
  });
});
