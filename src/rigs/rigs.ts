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
  steeringRatio: 16, // ~16:1, minivan
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
  vehicleType: "minivan",
  trailerType: "utility-single",
};

/**
 * Hyundai Ioniq 5 + small single-axle utility trailer.
 * The Ioniq 5 is an electric crossover SUV on the E-GMP platform with an
 * unusually long wheelbase: 3.0 m (118.1"), essentially the same as the
 * Odyssey, so W=3.0. A modest receiver hitch puts the ball L≈1.0 m behind
 * the rear axle. Same twitchy short utility trailer, D≈1.8 m.
 */
export const IONIQ5_UTILITY: Rig = {
  id: "ioniq5-utility",
  label: "Hyundai Ioniq 5 + utility trailer",
  steeringRatio: 15.5, // ~15.5:1 (2.67 turns lock-to-lock)
  W: 3.0, // Ioniq 5 wheelbase 118.1"
  L: 1.0, // rear axle -> ball; compact SUV rear overhang + receiver
  D: 1.8, // short single-axle utility trailer (twitchy)
  maxSteer: deg(35), // tighter-turning SUV than the long minivan
  carLength: 4.64, // Ioniq 5 overall length 182.5"
  carWidth: 1.89, // 74.4" body width
  carFrontOverhang: 3.7, // rear axle -> front bumper
  trailerLength: 2.3, // hitch ball -> tail = D (1.8) + rear overhang (0.5)
  trailerWidth: 1.8,
  trailerRearOverhang: 0.5, // trailer axle -> tail
  hardLimitGamma: deg(75),
  loadBlocksCamera: false, // open utility trailer
  axleConfig: "single",
  vehicleType: "suv",
  trailerType: "utility-single",
};

/**
 * Honda Odyssey + a dual-axle ("4-wheel") tandem utility trailer.
 * Same tow vehicle as ODYSSEY_UTILITY (W=3.0, L=1.1). A tandem trailer has
 * two closely spaced axles; the pivot behaves like a single effective axle
 * roughly midway between them, giving a longer effective wheelbase
 * D≈2.4 m. The longer D is more directionally stable and less twitchy in
 * reverse than the short single-axle trailer.
 */
export const ODYSSEY_DUAL: Rig = {
  id: "odyssey-dual",
  label: "Honda Odyssey + tandem-axle trailer",
  steeringRatio: 16, // ~16:1, minivan
  W: 3.0,
  L: 1.1,
  D: 2.4, // effective wheelbase to the tandem's midpoint (stabler)
  maxSteer: deg(33),
  carLength: 5.16,
  carWidth: 2.0,
  carFrontOverhang: 4.06,
  trailerLength: 3.6, // longer tandem deck: D (2.4) + rear overhang (1.2)
  trailerWidth: 2.0,
  trailerRearOverhang: 1.2, // tandem midpoint -> tail
  hardLimitGamma: deg(75),
  loadBlocksCamera: false, // open utility trailer
  axleConfig: "dual",
  vehicleType: "minivan",
  trailerType: "utility-dual",
};

/**
 * Compact farm tractor + a single-axle ag trailer/implement.
 * Compact utility tractor wheelbase W≈2.05 m. Implements hitch via a
 * drawbar that sits well behind the rear axle, L≈0.8 m. The ag trailer is
 * large with a long wheelbase to the axle, D≈3.0 m. The long D makes it
 * sluggish but very stable in reverse (high critical angle headroom).
 * Tractors steer hard, so a generous maxSteer.
 */
export const TRACTOR_AG: Rig = {
  id: "tractor-ag",
  label: "Compact tractor + ag trailer",
  steeringRatio: 18, // tractors crank a lot of wheel for full lock
  W: 2.05, // compact utility tractor wheelbase
  L: 0.8, // drawbar: rear axle -> hitch point
  D: 3.0, // long ag trailer wheelbase (sluggish but stable)
  maxSteer: deg(45), // tractors turn very tightly
  carLength: 3.6, // tractor body length
  carWidth: 2.1, // wide rear tires
  carFrontOverhang: 2.9, // rear axle -> front
  trailerLength: 4.2, // large ag trailer: D (3.0) + rear overhang (1.2)
  trailerWidth: 2.4, // wide implement / wagon
  trailerRearOverhang: 1.2, // trailer axle -> tail
  hardLimitGamma: deg(80), // long drawbar tolerates a larger contact angle
  loadBlocksCamera: true, // tall enclosed ag load blocks any backup view
  axleConfig: "single",
  vehicleType: "tractor",
  trailerType: "ag",
};

export const RIGS: Record<string, Rig> = {
  [ODYSSEY_UTILITY.id]: ODYSSEY_UTILITY,
  [IONIQ5_UTILITY.id]: IONIQ5_UTILITY,
  [ODYSSEY_DUAL.id]: ODYSSEY_DUAL,
  [TRACTOR_AG.id]: TRACTOR_AG,
};

export const DEFAULT_RIG = ODYSSEY_UTILITY;
