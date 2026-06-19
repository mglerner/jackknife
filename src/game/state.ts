import type { State } from "../core/types";
import type { Rig } from "../core/types";
import type { Scenario } from "../scenarios/types";
import type { DifficultyConfig } from "../difficulty/types";
import { clamp } from "../core/vec";
import { initSession, type SessionState } from "./session";

export type Gear = "reverse" | "forward" | "park";
export type GameStatus = "driving" | "won";

/** The entire mutable game world. Plain object; no class, no state library. */
export interface GameState {
  rig: Rig;
  scenario: Scenario;
  difficulty: DifficultyConfig;
  physics: State;
  gear: Gear;
  throttle: number; // 0..1
  targetDelta: number; // desired steer (rad), from input
  delta: number; // actual steer after rate-limiting
  accumulator: number; // fixed-timestep carry (s)
  session: SessionState;
  status: GameStatus;
}

export function createGame(
  rig: Rig,
  scenario: Scenario,
  difficulty: DifficultyConfig,
): GameState {
  return {
    rig,
    scenario,
    difficulty,
    physics: {
      x: scenario.start.x,
      y: scenario.start.y,
      carHeading: scenario.start.carHeading,
      trailerHeading: scenario.start.trailerHeading,
    },
    gear: "park",
    throttle: 0,
    targetDelta: 0,
    delta: 0,
    accumulator: 0,
    session: initSession(),
    status: "driving",
  };
}

export function resetGame(gs: GameState): GameState {
  return createGame(gs.rig, gs.scenario, gs.difficulty);
}

export function setTargetDelta(gs: GameState, value: number): GameState {
  return { ...gs, targetDelta: clamp(value, -gs.rig.maxSteer, gs.rig.maxSteer) };
}

export function setThrottle(gs: GameState, value: number): GameState {
  return { ...gs, throttle: clamp(value, 0, 1) };
}

export function setGear(gs: GameState, gear: Gear): GameState {
  // Count a pull-up whenever switching INTO forward after actually reversing,
  // regardless of the immediately prior gear (so pausing in park between backing
  // and pulling forward still counts, but idle toggling at rest does not).
  const pullForward =
    gear === "forward" && gs.gear !== "forward" && gs.session.reversedSinceForward;
  return {
    ...gs,
    gear,
    session: pullForward
      ? {
          ...gs.session,
          pullForwards: gs.session.pullForwards + 1,
          reversedSinceForward: false,
        }
      : gs.session,
  };
}
