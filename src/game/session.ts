import type { Rig, State } from "../core/types";

/** Per-attempt bookkeeping the scorer reads at the end. */
export interface SessionState {
  pathLength: number; // total distance traveled (m)
  maxAbsGamma: number; // worst articulation reached (rad)
  stops: number; // number of times the rig came to rest after moving
  pullForwards: number; // number of reverse -> forward direction changes
  startedMoving: boolean;
  movingPrev: boolean;
}

export function initSession(): SessionState {
  return {
    pathLength: 0,
    maxAbsGamma: 0,
    stops: 0,
    pullForwards: 0,
    startedMoving: false,
    movingPrev: false,
  };
}

/** Fold one physics substep into the session metrics. Pure. */
export function updateSession(
  s: SessionState,
  physics: State,
  _rig: Rig,
  v: number,
  dt: number,
): SessionState {
  const moving = Math.abs(v) > 1e-4;
  const gamma = Math.abs(physics.trailerHeading - physics.carHeading);
  const startedMoving = s.startedMoving || moving;
  const cameToRest = s.movingPrev && !moving && startedMoving;
  return {
    pathLength: s.pathLength + Math.abs(v) * dt,
    maxAbsGamma: Math.max(s.maxAbsGamma, gamma),
    stops: cameToRest ? s.stops + 1 : s.stops,
    pullForwards: s.pullForwards,
    startedMoving,
    movingPrev: moving,
  };
}
