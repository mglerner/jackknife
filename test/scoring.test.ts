import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/state";
import { initSession } from "../src/game/session";
import { defaultScorer } from "../src/scoring/defaultScorer";
import { isTrailerInTarget } from "../src/scoring/types";
import { ODYSSEY_UTILITY } from "../src/rigs/rigs";
import { STREET_TO_DRIVEWAY_90 } from "../src/scenarios/scenarios";
import { BEGINNER } from "../src/difficulty/difficulty";

const rig = ODYSSEY_UTILITY;
const target = STREET_TO_DRIVEWAY_90.target;

// Place the rig so the trailer axle sits exactly on the target with both bodies
// pointing at the target heading. With car & trailer heading = target.heading:
//   hitch       = (x, y) - L*(cos h, sin h)
//   trailerAxle = hitch - D*(cos h, sin h)
// so trailerAxle = (x, y) - (L + D)*(cos h, sin h). Invert to land it on target.
function placeOnTarget() {
  const h = target.heading;
  const x = target.x + (rig.L + rig.D) * Math.cos(h);
  const y = target.y + (rig.L + rig.D) * Math.sin(h);
  return { x, y, carHeading: h, trailerHeading: h };
}

function makeGame() {
  return createGame(rig, STREET_TO_DRIVEWAY_90, BEGINNER);
}

describe("scoring", () => {
  it("trailer exactly in target, heading matched: passes and scores high", () => {
    const gs = makeGame();
    gs.physics = placeOnTarget();
    gs.session = { ...initSession(), pathLength: 12, stops: 1 };

    expect(isTrailerInTarget(gs)).toBe(true);
    const r = defaultScorer.scoreAttempt(gs);
    expect(r.passed).toBe(true);
    expect(r.score).toBeGreaterThan(85);
    expect(r.summary).not.toMatch(/[–—]/); // no en/em dashes
  });

  it("trailer far off-target: fails and scores low", () => {
    const gs = makeGame();
    const p = placeOnTarget();
    // Shove it well outside the box, lateral + heading way off.
    gs.physics = { ...p, x: p.x + 6, trailerHeading: p.trailerHeading + 1.0 };
    // A flailing run: long path, many stops on top of being off target.
    gs.session = { ...initSession(), pathLength: 60, stops: 5 };

    expect(isTrailerInTarget(gs)).toBe(false);
    const r = defaultScorer.scoreAttempt(gs);
    expect(r.passed).toBe(false);
    expect(r.score).toBeLessThan(15);
  });

  it("extra stops and a big maxAbsGamma reduce the score", () => {
    const base = makeGame();
    base.physics = placeOnTarget();
    base.session = { ...initSession(), pathLength: 12, stops: 1, maxAbsGamma: 0 };
    const clean = defaultScorer.scoreAttempt(base).score;

    const messy = makeGame();
    messy.physics = placeOnTarget();
    messy.session = {
      ...initSession(),
      pathLength: 12,
      stops: 6,
      maxAbsGamma: rig.hardLimitGamma, // past critical
      pullForwards: 3,
    };
    const messyScore = defaultScorer.scoreAttempt(messy).score;

    expect(messyScore).toBeLessThan(clean);
    // Still passes the box (same pose) but loses a lot of points.
    expect(defaultScorer.scoreAttempt(messy).passed).toBe(true);
  });
});
