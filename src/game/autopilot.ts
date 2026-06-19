import { advance, commandedSpeed } from "./loop";
import { createGame, setGear, setThrottle, setTargetDelta, type GameState } from "./state";
import { steerFromBottomWheel } from "../input/bottomWheel";
import { isTrailerInTarget, trailerTargetError, wrapAngle } from "../scoring/types";
import { derive } from "../core/physics";
import { computeCriticalGamma } from "../core/jackknife";
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
  // Time-reversal negates velocity, so each segment's gear flips and the order
  // reverses. A multi-phase forward/reverse exit thus reverses into a back-in that
  // can legitimately include a pull-forward.
  return [...m].reverse().map((s) => ({
    gear: s.gear === "forward" ? ("reverse" as const) : ("forward" as const),
    steer: s.steer,
    seconds: s.seconds,
  }));
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

/**
 * Like simulateManeuver but RECORDS the full state at every frame, so the Demo can
 * replay the exact verified trajectory pose-by-pose instead of re-running live
 * physics (which diverges for sensitive open-loop maneuvers, e.g. the unstable
 * reverse straight-start). Same fixed-timestep loop + 30-frame settle.
 */
export function simulateManeuverFrames(
  rig: Rig,
  scenario: Scenario,
  difficulty: DifficultyConfig,
  m: Maneuver,
  frameDt = 1 / 60,
): GameState[] {
  let gs = createGame(rig, scenario, difficulty);
  const total = maneuverDuration(m);
  const frames = Math.round(total / frameDt);
  const out: GameState[] = [];
  for (let i = 0; i < frames; i++) {
    gs = applyManeuverAt(gs, m, i * frameDt);
    gs = advance(gs, frameDt);
    out.push(gs);
  }
  for (let i = 0; i < 30; i++) {
    gs = setThrottle(gs, 0);
    gs = advance(gs, frameDt);
    out.push(gs);
  }
  return out;
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

// =============================================================================
// Backing controller WITH pull-forward recovery. Backs toward the target under
// the feedback law; when the articulation nears jackknife it pulls forward to
// straighten, then resumes backing. This is the human technique, and it can solve
// a 90 degree back-in from a straight street start (which open-loop cannot).
// =============================================================================

export interface BackingCtrl {
  mode: "back" | "pull";
  pullFrames: number;
  pulls: number;
}
export const newBackingCtrl = (): BackingCtrl => ({ mode: "back", pullFrames: 0, pulls: 0 });

/** Decide gear+steer for the next step, updating the controller state in place. */
export function backingStep(
  gs: GameState,
  ctrl: BackingCtrl,
  gains: Gains,
  crit: number,
): GameState {
  const gamma = gs.physics.trailerHeading - gs.physics.carHeading;
  const absG = Math.abs(gamma);
  if (ctrl.mode === "back" && absG > 0.82 * crit) {
    ctrl.mode = "pull";
    ctrl.pullFrames = 0;
    ctrl.pulls += 1;
  } else if (ctrl.mode === "pull") {
    ctrl.pullFrames += 1;
    if (absG < 0.22 * crit || ctrl.pullFrames > 150) ctrl.mode = "back";
  }

  if (ctrl.mode === "back") {
    const u = backingSteer(gs, gains);
    return setThrottle(setTargetDelta(setGear(gs, "reverse"), steerFromBottomWheel(u, gs.rig.maxSteer)), 1);
  }
  // Pull forward, steering to unbend the rig (drive gamma toward zero).
  const u = clamp(3 * gamma, -1, 1);
  return setThrottle(setTargetDelta(setGear(gs, "forward"), steerFromBottomWheel(u, gs.rig.maxSteer)), 1);
}

export interface ControllerResult {
  gs: GameState;
  parked: boolean;
  pulls: number;
  seconds: number;
  wallContacts: number;
  maxAbsGamma: number;
}

/** Run the backing controller from `start` to parked or timeout. */
export function simulateController(
  rig: Rig,
  scenario: Scenario,
  difficulty: DifficultyConfig,
  start: StartPose,
  gains: Gains,
  maxSeconds = 45,
  frameDt = 1 / 60,
): ControllerResult {
  let gs = createGame(rig, scenario, difficulty);
  gs = { ...gs, physics: { ...start } };
  const crit = computeCriticalGamma(rig);
  const ctrl = newBackingCtrl();
  const frames = Math.round(maxSeconds / frameDt);
  let held = 0;
  for (let i = 0; i < frames; i++) {
    gs = backingStep(gs, ctrl, gains, crit);
    gs = advance(gs, frameDt);
    if (isTrailerInTarget(gs)) {
      if (++held > 20) {
        return { gs, parked: true, pulls: ctrl.pulls, seconds: i * frameDt, wallContacts: gs.session.wallContacts, maxAbsGamma: gs.session.maxAbsGamma };
      }
    } else {
      held = 0;
    }
  }
  return { gs, parked: isTrailerInTarget(gs), pulls: ctrl.pulls, seconds: maxSeconds, wallContacts: gs.session.wallContacts, maxAbsGamma: gs.session.maxAbsGamma };
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
