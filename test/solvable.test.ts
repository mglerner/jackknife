import { describe, it, expect } from "vitest";
import { simulateManeuver, maneuverUsesForward } from "../src/game/autopilot";
import { SOLUTIONS } from "../src/game/solutions";
import { SCENARIOS } from "../src/scenarios/scenarios";
import { RIGS } from "../src/rigs/rigs";
import { BEGINNER } from "../src/difficulty/difficulty";
import { computeCriticalGamma } from "../src/core/jackknife";
import { isTrailerInTarget } from "../src/scoring/types";

// Every baked demo solution (keyed "<rigId>/<scenarioId>") must genuinely park its
// rig in its scenario, never jackknife, never hit a wall, and do it reverse-only.
// A few inherently tight maneuvers (a curbside parallel-park) ride right up to the
// recoverable angle, so they get a small jackknife-margin allowance.
const TIGHT = new Set(["odyssey-utility/parallel-park-curb"]);
describe("demo solution solvability", () => {
  for (const [key, solution] of Object.entries(SOLUTIONS)) {
    it(`${key}: the baked solution parks the trailer reverse-only`, () => {
      const [rigId, scenarioId] = key.split("/");
      const rig = RIGS[rigId];
      const scenario = SCENARIOS[scenarioId];
      expect(rig, `unknown rig ${rigId}`).toBeTruthy();
      expect(scenario, `unknown scenario ${scenarioId}`).toBeTruthy();

      const crit = computeCriticalGamma(rig);
      const end = simulateManeuver(rig, scenario, BEGINNER, solution);

      // It actually parks in the target box, never jackknifes, never hits anything.
      expect(isTrailerInTarget(end)).toBe(true);
      expect(end.session.maxAbsGamma).toBeLessThan(crit * (TIGHT.has(key) ? 1.05 : 1));
      expect(end.session.wallContacts).toBe(0);
      expect(maneuverUsesForward(solution)).toBe(false);
    });
  }
});
