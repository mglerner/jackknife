import type { DifficultyConfig } from "./types";

const deg = (d: number): number => (d * Math.PI) / 180;

/** Phase-1 difficulty: forgiving, all aids on, pull-forward always allowed. */
export const BEGINNER: DifficultyConfig = {
  id: "beginner",
  label: "Beginner",
  physicsDt: 1 / 120,
  maxReverseSpeed: 1.4, // ~3 mph
  maxForwardSpeed: 1.8,
  steerRateLimit: deg(140), // gentle, smooth steering
  ghostHorizon: 2.5,
  showGhost: true,
  showGuideLines: true,
  showCoaching: true,
  mirrorsDefault: true,
  realisticWheel: false, // super-beginner: compact wheel sweep + readout
  allowPullForwardAlways: true,
  blockReverseWhenJackknifed: true,
  posTolerance: 0.9,
  headingTolerance: deg(12),
};

/** Phase-2 difficulty: fewer aids, tighter tolerances, brisker handling. */
export const INTERMEDIATE: DifficultyConfig = {
  id: "intermediate",
  label: "Intermediate",
  physicsDt: 1 / 120,
  maxReverseSpeed: 1.8, // ~4 mph
  maxForwardSpeed: 2.4,
  steerRateLimit: deg(170),
  ghostHorizon: 1.8,
  showGhost: true,
  showGuideLines: false,
  showCoaching: true,
  mirrorsDefault: true,
  realisticWheel: true, // real steering ratio: full lock is ~1.4 turns
  allowPullForwardAlways: true,
  blockReverseWhenJackknifed: true,
  posTolerance: 0.6,
  headingTolerance: deg(8),
};

/** Phase-3 difficulty: no aids, strict tolerances, true-to-life feel. */
export const EXPERT: DifficultyConfig = {
  id: "expert",
  label: "Expert",
  physicsDt: 1 / 120,
  maxReverseSpeed: 2.2, // ~5 mph
  maxForwardSpeed: 3.1,
  steerRateLimit: deg(200),
  ghostHorizon: 0,
  showGhost: false,
  showGuideLines: false,
  showCoaching: false,
  mirrorsDefault: true,
  realisticWheel: true, // real steering ratio: full lock is ~1.4 turns
  allowPullForwardAlways: false, // only when jackknifeState is recoverable/contact
  blockReverseWhenJackknifed: true,
  posTolerance: 0.4,
  headingTolerance: deg(5),
};

export const DIFFICULTIES: Record<string, DifficultyConfig> = {
  [BEGINNER.id]: BEGINNER,
  [INTERMEDIATE.id]: INTERMEDIATE,
  [EXPERT.id]: EXPERT,
};

export const DEFAULT_DIFFICULTY = BEGINNER;
