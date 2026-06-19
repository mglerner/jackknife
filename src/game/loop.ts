import { step } from "../core/physics";
import { computeCriticalGamma } from "../core/jackknife";
import { clamp } from "../core/vec";
import type { GameState } from "./state";
import { updateSession } from "./session";
import { rigCollision } from "./collision";

/**
 * Cap a frame's worth of catch-up to avoid a spiral of death after a stall.
 * Time beyond this is intentionally DROPPED (the sim pauses rather than
 * fast-forwards) - do not "fix" this into an unbounded catch-up loop.
 */
const MAX_FRAME = 0.25;

/**
 * Quasi-static gravity-roll speed (m/s) at full grade (sin = 1). A graded scenario
 * adds SLOPE_ROLL * sin(grade) * cos(heading - downhill) to the wheel speed, so the
 * rig drifts toward downhill. This is a simplified steady-state roll, not full
 * vehicle dynamics, but it captures the teaching point: backing DOWNHILL, the
 * trailer wants to run away, so you feather speed and counter-steer earlier.
 */
const SLOPE_ROLL = 2.4;

/** Signed commanded speed from gear + throttle + difficulty caps. */
export function commandedSpeed(gs: GameState): number {
  const d = gs.difficulty;
  if (gs.gear === "reverse") return -gs.throttle * d.maxReverseSpeed;
  if (gs.gear === "forward") return gs.throttle * d.maxForwardSpeed;
  return 0;
}

/**
 * Advance the world by a real-time frame using a fixed-timestep accumulator, so
 * physics is deterministic and framerate-independent. Pure: returns new state.
 * The steering angle slews toward `targetDelta` at the difficulty's rate limit.
 */
export function advance(gs: GameState, frameDt: number): GameState {
  const dt = gs.difficulty.physicsDt;
  const v = commandedSpeed(gs);
  const slew = gs.difficulty.steerRateLimit * dt;

  const crit = computeCriticalGamma(gs.rig);
  const blockRev = gs.difficulty.blockReverseWhenJackknifed;
  const allowFwd = gs.difficulty.allowPullForwardAlways;
  const slope = gs.scenario.slope;
  const slopeDir = gs.scenario.slopeDir ?? 0;

  let acc = gs.accumulator + Math.min(frameDt, MAX_FRAME);
  let physics = gs.physics;
  let delta = gs.delta;
  let session = gs.session;

  while (acc >= dt) {
    delta = clamp(
      delta + clamp(gs.targetDelta - delta, -slew, slew),
      -gs.rig.maxSteer,
      gs.rig.maxSteer,
    );
    // Once folded past the recoverable angle, reverse is disabled: the only way
    // out is to pull forward and straighten. (Beginner guardrail; data-driven.)
    let vSub = v;
    if (blockRev && vSub < 0) {
      const gamma = Math.abs(physics.trailerHeading - physics.carHeading);
      if (gamma >= crit) vSub = 0;
    }
    // Expert rule (allowPullForwardAlways false): pulling forward is allowed only
    // when physically necessary, i.e. once folded into the recoverable angle.
    if (!allowFwd && vSub > 0) {
      const gamma = Math.abs(physics.trailerHeading - physics.carHeading);
      if (gamma < crit) vSub = 0;
    }
    // Gravity roll on a graded scenario: while you are moving (throttle engaged),
    // the rig drifts toward downhill on top of the commanded speed, strongest when
    // the heading aligns with the slope, so backing downhill runs away. At rest
    // (throttle released) the brake holds, so you can still come to a stop and park.
    if (slope > 0 && Math.abs(v) > 1e-4) {
      vSub += SLOPE_ROLL * Math.sin(slope) * Math.cos(physics.carHeading - slopeDir);
    }

    const candidate = step(physics, gs.rig, { delta, v: vSub, dt });
    const col = rigCollision(candidate, gs.rig, gs.scenario.obstacles, gs.scenario.worldBounds);
    if (col.wall || col.bounds) {
      // Walls are solid: reject the move. Count one contact on the rising edge.
      if (!session.collidingNow) {
        session = { ...session, collidingNow: true, wallContacts: session.wallContacts + 1 };
      }
      // A blocked reverse still shows intent to back up, so a later pull-forward
      // is counted even if every reverse substep here was rejected by a wall.
      if (vSub < -1e-4 && !session.reversedSinceForward) {
        session = { ...session, reversedSinceForward: true };
      }
    } else {
      physics = candidate;
      if (session.collidingNow) session = { ...session, collidingNow: false };
      session = updateSession(session, physics, gs.rig, vSub, dt);
    }
    acc -= dt;
  }

  return { ...gs, physics, delta, accumulator: acc, session };
}

/**
 * requestAnimationFrame driver. `tick` receives the freshly-advanced state each
 * frame and should render it (and may return a replacement, e.g. after input).
 */
export function startRafLoop(
  initial: GameState,
  tick: (gs: GameState) => GameState | void,
): () => void {
  let state = initial;
  let last = 0;
  let raf = 0;
  const frame = (t: number): void => {
    const dt = last ? (t - last) / 1000 : 0;
    last = t;
    state = advance(state, dt);
    const next = tick(state);
    if (next) state = next;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
