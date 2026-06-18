import type { Rig, State } from "../core/types";

/** Per-attempt bookkeeping the scorer reads at the end. */
export interface SessionState {
  pathLength: number; // total distance traveled (m)
  maxAbsGamma: number; // worst articulation reached (rad)
  stops: number; // number of times the rig came to rest after moving (info only)
  pullForwards: number; // pull-ups: reverse -> forward changes that followed real reversing
  startedMoving: boolean;
  movingPrev: boolean;
  reversedSinceForward: boolean; // has the rig actually reversed since the last forward pull?
  wallContacts: number; // number of distinct times the rig bumped a wall / the bounds
  collidingNow: boolean; // currently pressed against a wall / the bounds
}

export function initSession(): SessionState {
  return {
    pathLength: 0,
    maxAbsGamma: 0,
    stops: 0,
    pullForwards: 0,
    startedMoving: false,
    movingPrev: false,
    reversedSinceForward: false,
    wallContacts: 0,
    collidingNow: false,
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
    ...s,
    pathLength: s.pathLength + Math.abs(v) * dt,
    maxAbsGamma: Math.max(s.maxAbsGamma, gamma),
    stops: cameToRest ? s.stops + 1 : s.stops,
    startedMoving,
    movingPrev: moving,
    reversedSinceForward: s.reversedSinceForward || (moving && v < 0),
  };
}
