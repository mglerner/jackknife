/**
 * All "feel" knobs live here as data (per the plan's riskiest-part de-risking):
 * tuning the game is editing numbers in difficulty.ts, never touching logic.
 */
export interface DifficultyConfig {
  id: string;
  label: string;

  // Motion feel:
  physicsDt: number; // fixed physics substep (s), e.g. 1/120
  maxReverseSpeed: number; // m/s (magnitude), reverse
  maxForwardSpeed: number; // m/s (magnitude), forward
  steerRateLimit: number; // rad/s max slew of delta (lower = gentler/forgiving)

  // Aids / overlays:
  ghostHorizon: number; // s of predicted trailer-tail path
  showGhost: boolean;
  showGuideLines: boolean;
  showCoaching: boolean;
  mirrorsDefault: boolean; // mirror strip on by default

  // Rules:
  allowPullForwardAlways: boolean; // false => only when jackknifeState is recoverable/contact
  blockReverseWhenJackknifed: boolean; // true => once past criticalGamma, reverse is disabled (must pull forward)

  // Scoring tolerances (scaled by difficulty):
  posTolerance: number; // m
  headingTolerance: number; // rad
}
