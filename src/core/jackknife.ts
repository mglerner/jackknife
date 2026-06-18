import type { JackknifeState, Rig } from "./types";

/** Fraction of criticalGamma at which we start warning the driver. */
const WARN_FRACTION = 0.85;

const criticalCache = new WeakMap<Rig, number>();

/**
 * The critical articulation angle: the largest |gamma| from which FULL opposite
 * lock can still null growth while reversing. Beyond it, continued reverse only
 * worsens the fold — pulling forward becomes physically necessary.
 *
 * Setting gammaDot = 0 at delta = ±delta_max in reverse and factoring out v gives
 * the v-independent (geometry-only) condition:
 *
 *     sin(gamma)/D = (tan(delta_max)/W) * (1 + (L/D)*cos(gamma))
 *
 * f(gamma) = LHS - RHS is < 0 near 0 (recoverable) and crosses to > 0 at the
 * critical angle. Solve by bisection on (0, hardLimitGamma). Cached per rig.
 */
export function computeCriticalGamma(rig: Rig): number {
  const cached = criticalCache.get(rig);
  if (cached !== undefined) return cached;

  const { W, L, D, maxSteer, hardLimitGamma } = rig;
  const t = Math.tan(maxSteer);
  const f = (g: number): number => Math.sin(g) / D - (t / W) * (1 + (L / D) * Math.cos(g));

  let root: number;
  const f0 = f(0);
  const fHi = f(hardLimitGamma);
  if (f0 >= 0) {
    // Degenerate geometry: unstable from the start.
    root = 0;
  } else if (fHi <= 0) {
    // Even at the hard limit full counter-steer still recovers: critical = hard limit.
    root = hardLimitGamma;
  } else {
    let lo = 0;
    let hi = hardLimitGamma;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid;
      else lo = mid;
    }
    root = (lo + hi) / 2;
  }

  criticalCache.set(rig, root);
  return root;
}

/**
 * Classify the articulation severity. `recoverable` means past the critical angle
 * (so pulling forward is now physically necessary) but not yet at hard contact.
 */
export function classify(
  gamma: number,
  criticalGamma: number,
  hardLimitGamma: number,
): JackknifeState {
  const a = Math.abs(gamma);
  if (a >= hardLimitGamma - 1e-6) return "contact";
  if (a >= criticalGamma) return "recoverable";
  if (a >= WARN_FRACTION * criticalGamma) return "warn";
  return "ok";
}
