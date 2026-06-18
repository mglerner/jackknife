import { derive } from "../core/physics";
import type { GameState } from "../game/state";

/** Result of scoring one attempt. */
export interface ScoreResult {
  score: number; // 0..100-ish
  passed: boolean; // trailer parked inside the target box within tolerances
  breakdown: Record<string, number>; // named contributions, for UI / debugging
  summary: string; // one-line, no em/en dashes
}

/** A scorer turns a finished GameState into a ScoreResult. */
export interface Scorer {
  scoreAttempt(gs: GameState): ScoreResult;
}

/** Wrap an angle to (-pi, pi]. */
export function wrapAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x > Math.PI) x -= 2 * Math.PI;
  if (x <= -Math.PI) x += 2 * Math.PI;
  return x;
}

/**
 * Trailer pose error relative to the target box, expressed in the target's frame.
 * The reference point is the trailer axle (the tracked point the ghost predicts).
 *   lateral      = cross-track offset (perpendicular to target heading)
 *   longitudinal = along-track offset (parallel to target heading)
 *   heading      = wrapped trailerHeading - target.heading
 */
export interface TargetError {
  lateral: number;
  longitudinal: number;
  heading: number;
}

export function trailerTargetError(gs: GameState): TargetError {
  const d = derive(gs.physics, gs.rig, { v: 0, delta: 0 });
  const t = gs.scenario.target;
  const dx = d.trailerAxle.x - t.x;
  const dy = d.trailerAxle.y - t.y;
  const c = Math.cos(t.heading);
  const s = Math.sin(t.heading);
  return {
    longitudinal: dx * c + dy * s,
    lateral: -dx * s + dy * c,
    heading: wrapAngle(d.trailerHeading - t.heading),
  };
}

/**
 * True when the trailer is parked inside the target box within difficulty
 * tolerances: lateral error within posTolerance, longitudinal error within the
 * box half-length, and heading error within headingTolerance.
 */
export function isTrailerInTarget(gs: GameState): boolean {
  const e = trailerTargetError(gs);
  const t = gs.scenario.target;
  const { posTolerance, headingTolerance } = gs.difficulty;
  return (
    Math.abs(e.lateral) <= posTolerance &&
    Math.abs(e.longitudinal) <= t.halfLength &&
    Math.abs(e.heading) <= headingTolerance
  );
}
