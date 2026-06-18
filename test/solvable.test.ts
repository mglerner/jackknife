import { describe, it, expect } from "vitest";
import { simulateManeuver, maneuverUsesForward } from "../src/game/autopilot";
import { SOLUTIONS } from "../src/game/solutions";
import { SCENARIOS } from "../src/scenarios/scenarios";
import { ODYSSEY_UTILITY } from "../src/rigs/rigs";
import { BEGINNER } from "../src/difficulty/difficulty";
import { computeCriticalGamma } from "../src/core/jackknife";
import { isTrailerInTarget } from "../src/scoring/types";

// Easy scenarios must be solvable REVERSE-ONLY (no pull-forward). Harder ones may
// require a pull-forward; for those, only assert a solution exists.
const REVERSE_ONLY = new Set(["street-to-driveway-90"]);

describe("scenario solvability", () => {
  for (const [id, scenario] of Object.entries(SCENARIOS)) {
    it(`${id}: the baked solution parks the trailer`, () => {
      const solution = SOLUTIONS[id];
      expect(solution, `no solution baked for ${id}`).toBeTruthy();

      const rig = ODYSSEY_UTILITY;
      const crit = computeCriticalGamma(rig);
      const end = simulateManeuver(rig, scenario, BEGINNER, solution);

      // It actually parks in the target box.
      expect(isTrailerInTarget(end)).toBe(true);
      // It never jackknifes and never hits anything.
      expect(end.session.maxAbsGamma).toBeLessThan(crit);
      expect(end.session.wallContacts).toBe(0);

      if (REVERSE_ONLY.has(id)) {
        expect(maneuverUsesForward(solution)).toBe(false);
      }
    });
  }
});
