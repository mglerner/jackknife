import type { Maneuver } from "./autopilot";

/**
 * A verified solution maneuver per scenario, keyed by scenario id. Each is a
 * control sequence the Demo plays back, and that test/solvable.test.ts replays
 * through the real physics to PROVE the scenario is solvable (and, for the easy
 * ones, solvable reverse-only). Solutions are reverse-engineered: drive forward
 * out of the parked pose, then play that path back (see autopilot.reverseManeuver).
 */
export const SOLUTIONS: Record<string, Maneuver> = {
  "street-to-driveway-90": [
    { gear: "reverse", steer: 0.3209137181226225, seconds: 2.560367215202747 },
    { gear: "reverse", steer: 0.4743092941651077, seconds: 2.6725572427055035 },
  ],
};
