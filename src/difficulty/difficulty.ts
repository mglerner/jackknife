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
  allowPullForwardAlways: true,
  blockReverseWhenJackknifed: true,
  posTolerance: 0.9,
  headingTolerance: deg(12),
};

export const DIFFICULTIES: Record<string, DifficultyConfig> = {
  [BEGINNER.id]: BEGINNER,
};

export const DEFAULT_DIFFICULTY = BEGINNER;
