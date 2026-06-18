import { advance, commandedSpeed } from "./loop";
import { createGame, setGear, setThrottle, setTargetDelta, type GameState } from "./state";
import { steerFromBottomWheel } from "../input/bottomWheel";
import { isTrailerInTarget, trailerTargetError, wrapAngle } from "../scoring/types";
import { derive } from "../core/physics";
import { clamp } from "../core/vec";
import type { Rig } from "../core/types";
import type { Scenario } from "../scenarios/types";
import type { DifficultyConfig } from "../difficulty/types";

/**
 * A scripted maneuver: piecewise-constant control. `steer` is the normalized
 * bottom-of-wheel input in [-1, 1]; `gear` and `seconds` define the segment.
 * This is the data a Demo plays back and that the solvability tests replay.
 */
export interface ManeuverSegment {
  gear: "reverse" | "forward";
  steer: number; // -1..1 (bottom-of-wheel)
  seconds: number;
}
export type Maneuver = ManeuverSegment[];

export const maneuverUsesForward = (m: Maneuver): boolean => m.some((s) => s.gear === "forward");
export const maneuverDuration = (m: Maneuver): number => m.reduce((t, s) => t + s.seconds, 0);

/**
 * Time-reverse a forward maneuver into a reverse-only one. The kinematic model is
 * path-reversible: driving the segments backward (reversed order, same steer,
 * reverse gear) retraces the exact path. So the reverse of a forward "pull-out"
 * from the parked pose is a guaranteed-solvable back-in.
 */
export function reverseManeuver(m: Maneuver): Maneuver {
  return [...m].reverse().map((s) => ({ gear: "reverse" as const, steer: s.steer, seconds: s.seconds }));
}

/** The straight, parked pose with the trailer axle exactly on the target. */
export function parkedPose(rig: Rig, scenario: Scenario): StartPose {
  const t = scenario.target;
  const k = rig.L + rig.D; // car rear axle sits (L+D) ahead of the trailer axle
  return {
    x: t.x + k * Math.cos(t.heading),
    y: t.y + k * Math.sin(t.heading),
    carHeading: t.heading,
    trailerHeading: t.heading,
  };
}

/** Apply the controls for the segment active at elapsed time `t` to `gs`. */
export function applyManeuverAt(gs: GameState, m: Maneuver, t: number): GameState {
  let acc = 0;
  let seg = m[m.length - 1];
  for (const s of m) {
    if (t < acc + s.seconds) {
      seg = s;
      break;
    }
    acc += s.seconds;
  }
  let next = setGear(gs, seg.gear);
  next = setThrottle(next, 1);
  next = setTargetDelta(next, steerFromBottomWheel(seg.steer, next.rig.maxSteer));
  return next;
}

export interface StartPose {
  x: number;
  y: number;
  carHeading: number;
  trailerHeading: number;
}

/** Run a maneuver from a fresh game to completion; return the final state. */
export function simulateManeuver(
  rig: Rig,
  scenario: Scenario,
  difficulty: DifficultyConfig,
  m: Maneuver,
  frameDt = 1 / 60,
  startPose?: StartPose,
): GameState {
  let gs = createGame(rig, scenario, difficulty);
  if (startPose) gs = { ...gs, physics: { ...startPose } };
  const total = maneuverDuration(m);
  const frames = Math.round(total / frameDt);
  for (let i = 0; i < frames; i++) {
    gs = applyManeuverAt(gs, m, i * frameDt);
    gs = advance(gs, frameDt);
  }
  // Settle: hold the last steer with no throttle so it comes fully to rest.
  for (let i = 0; i < 30; i++) {
    gs = setThrottle(gs, 0);
    gs = advance(gs, frameDt);
  }
  return gs;
}

export interface ManeuverResult {
  parked: boolean;
  lateral: number;
  longitudinal: number;
  heading: number;
  usesForward: boolean;
  wallContacts: number;
  maxAbsGamma: number;
}

// =============================================================================
// Feedback controller: a trailer-backing autopilot. Reverses continuously and
// steers to drive the trailer axle onto the target pose. Used both as the live
// Demo and to PROVE a scenario is solvable reverse-only.
// =============================================================================

export interface Gains {
  kh: number; // heading-error -> desired hitch angle
  kl: number; // lateral-error -> desired hitch angle
  kg: number; // hitch-angle error -> steer
  gMax: number; // cap on desired hitch angle (keep below jackknife)
}

/** Normalized bottom-of-wheel steer the controller wants this instant. */
export function backingSteer(gs: GameState, g: Gains): number {
  const d = derive(gs.physics, gs.rig, { v: commandedSpeed(gs), delta: gs.delta });
  const t = gs.scenario.target;
  const dx = d.trailerAxle.x - t.x;
  const dy = d.trailerAxle.y - t.y;
  const c = Math.cos(t.heading);
  const s = Math.sin(t.heading);
  const eLat = -dx * s + dy * c; // cross-track error
  const eHead = wrapAngle(d.trailerHeading - t.heading);
  const gamma = gs.physics.trailerHeading - gs.physics.carHeading;
  const gammaDes = clamp(-(g.kh * eHead + g.kl * eLat), -g.gMax, g.gMax);
  return clamp(g.kg * (gammaDes - gamma), -1, 1);
}

export interface FeedbackResult {
  gs: GameState;
  parked: boolean;
  seconds: number;
}

/** Reverse under the feedback controller until parked or `maxSeconds`. */
export function simulateFeedback(
  rig: Rig,
  scenario: Scenario,
  difficulty: DifficultyConfig,
  start: StartPose,
  g: Gains,
  maxSeconds = 30,
  frameDt = 1 / 60,
): FeedbackResult {
  let gs = createGame(rig, scenario, difficulty);
  gs = { ...gs, physics: { ...start } };
  gs = setGear(gs, "reverse");
  const frames = Math.round(maxSeconds / frameDt);
  let held = 0;
  for (let i = 0; i < frames; i++) {
    const u = backingSteer(gs, g);
    gs = setThrottle(setTargetDelta(gs, steerFromBottomWheel(u, gs.rig.maxSteer)), 1);
    gs = advance(gs, frameDt);
    if (isTrailerInTarget(gs)) {
      if (++held > 18) return { gs: setThrottle(gs, 0), parked: true, seconds: i * frameDt };
    } else {
      held = 0;
    }
  }
  return { gs, parked: isTrailerInTarget(gs), seconds: maxSeconds };
}

export function evaluateManeuver(
  rig: Rig,
  scenario: Scenario,
  difficulty: DifficultyConfig,
  m: Maneuver,
  startPose?: StartPose,
): ManeuverResult {
  const gs = simulateManeuver(rig, scenario, difficulty, m, 1 / 60, startPose);
  const e = trailerTargetError(gs);
  return {
    parked: isTrailerInTarget(gs),
    lateral: e.lateral,
    longitudinal: e.longitudinal,
    heading: e.heading,
    usesForward: maneuverUsesForward(m),
    wallContacts: gs.session.wallContacts,
    maxAbsGamma: gs.session.maxAbsGamma,
  };
}
