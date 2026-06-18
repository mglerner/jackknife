import type { Rig } from "../core/types";

const deg = (d: number): number => (d * Math.PI) / 180;

/**
 * Phase-1 rig: Honda Odyssey + a small single-axle utility trailer.
 * W≈3.0 m (Odyssey wheelbase 118.1"), L≈1.1 m rear-axle→ball, D≈1.8 m ball→axle.
 * A short D makes a utility trailer twitchy — the genuinely hard case.
 */
export const ODYSSEY_UTILITY: Rig = {
  id: "odyssey-utility",
  label: "Honda Odyssey + utility trailer",
  W: 3.0,
  L: 1.1,
  D: 1.8,
  maxSteer: deg(33),
  carLength: 5.16,
  carWidth: 2.0,
  carFrontOverhang: 4.06, // rear axle -> front bumper (rear bumper is carLength - this behind axle)
  trailerLength: 2.3, // overall hitch ball -> tail = D (1.8) + trailerRearOverhang (0.5)
  trailerWidth: 1.8,
  trailerRearOverhang: 0.5, // trailer axle -> tail
  hardLimitGamma: deg(75),
  loadBlocksCamera: false, // open utility trailer: backup camera sees past it
  axleConfig: "single",
};

export const RIGS: Record<string, Rig> = {
  [ODYSSEY_UTILITY.id]: ODYSSEY_UTILITY,
};

export const DEFAULT_RIG = ODYSSEY_UTILITY;
