import { describe, it, expect } from "vitest";
import { createGame, setGear, setThrottle } from "../src/game/state";
import type { GameState } from "../src/game/state";
import { advance } from "../src/game/loop";
import { DEFAULT_RIG } from "../src/rigs/rigs";
import { DEFAULT_SCENARIO } from "../src/scenarios/scenarios";
import { EXPERT } from "../src/difficulty/difficulty";
import { computeCriticalGamma } from "../src/core/jackknife";
import { coachingMessage } from "../src/ui/coach";
import { classify } from "../src/core/jackknife";
import type { PhysicsDerived } from "../src/core/types";

function simulate(gs: GameState, seconds: number, frameDt = 1 / 60): GameState {
  let s = gs;
  const frames = Math.round(seconds / frameDt);
  for (let i = 0; i < frames; i++) s = advance(s, frameDt);
  return s;
}

// TASK B.1 — Expert forward-lock rule. On EXPERT (allowPullForwardAlways=false),
// a forward substep is zeroed while |gamma| < criticalGamma, but allowed once the
// rig is folded at/past the critical angle.
describe("Expert forward-lock rule", () => {
  it("blocks forward while near-straight, but allows it once folded past critical", () => {
    const crit = computeCriticalGamma(DEFAULT_RIG);

    // Near-straight articulated pose: |gamma| well below critical. Command forward.
    let straight = setThrottle(
      setGear(
        { ...createGame(DEFAULT_RIG, DEFAULT_SCENARIO, EXPERT), physics: { x: 0, y: 0, carHeading: 0, trailerHeading: 0.05 } },
        "forward",
      ),
      1,
    );
    const x0 = straight.physics.x;
    straight = simulate(straight, 1.0);
    // Forward is locked out while |gamma| < crit: the car must not translate.
    expect(straight.physics.x).toBeCloseTo(x0, 9);

    // Now fold past the critical angle: forward becomes allowed and DOES move.
    let folded = setThrottle(
      setGear(
        { ...createGame(DEFAULT_RIG, DEFAULT_SCENARIO, EXPERT), physics: { x: 0, y: 0, carHeading: 0, trailerHeading: crit + 0.1 } },
        "forward",
      ),
      1,
    );
    const fx0 = folded.physics.x;
    folded = simulate(folded, 1.0);
    // Forward pull-out moves the car forward (x increases) to straighten the rig.
    expect(folded.physics.x).toBeGreaterThan(fx0 + 0.1);
  });
});

// TASK B.2 — "Folding up fast" coaching cue. coachingMessage returns the folding-up
// line when sign(gamma)*gammaDot exceeds the FOLD_FAST threshold while the jackknife
// state is "ok"/"warn", and does NOT when the trailer is unfolding.
describe("Folding-up-fast coaching cue", () => {
  const crit = computeCriticalGamma(DEFAULT_RIG);
  const baseGame = (): GameState =>
    setGear({ ...createGame(DEFAULT_RIG, DEFAULT_SCENARIO, EXPERT), physics: { x: 0, y: 0, carHeading: 0, trailerHeading: 0.2 } }, "reverse");

  const derived = (gamma: number, gammaDot: number): PhysicsDerived => ({
    gamma,
    gammaDot,
    trailerHeading: gamma,
    hitch: { x: 0, y: 0 },
    trailerAxle: { x: 0, y: 0 },
    trailerTail: { x: 0, y: 0 },
    criticalGamma: crit,
    hardLimitGamma: DEFAULT_RIG.hardLimitGamma,
    jackknifeState: classify(gamma, crit, DEFAULT_RIG.hardLimitGamma),
  });

  it("warns when the fold is growing fast", () => {
    // gamma > 0 in the "ok"/"warn" band, gammaDot positive => fold growing fast.
    const gamma = 0.3 * crit; // ok band
    const d = derived(gamma, 1.0); // sign(gamma)*gammaDot = +1.0 > FOLD_FAST
    const msg = coachingMessage(baseGame(), d);
    expect(msg).toContain("Folding up fast");
  });

  it("does NOT warn when the trailer is unfolding", () => {
    const gamma = 0.3 * crit;
    const d = derived(gamma, -1.0); // sign(gamma)*gammaDot = -1.0 < 0
    const msg = coachingMessage(baseGame(), d);
    expect(msg).not.toContain("Folding up fast");
  });
});
