import type { Maneuver } from "./autopilot";

/**
 * Verified demo solutions, keyed by "<rigId>/<scenarioId>". Each is a control
 * sequence the Demo plays back, and that test/solvable.test.ts replays through the
 * real physics to PROVE it parks the trailer (reverse-only for all of these).
 *
 * Values are FULL PRECISION on purpose: these parks are tight (especially the
 * short-wheelbase rigs) and rounding the steers/durations can push the trailer out
 * of the target box. Each was found by search + reverse-engineering and then
 * independently re-simulated through the core physics before being trusted.
 */
export const SOLUTIONS: Record<string, Maneuver> = {
  "odyssey-utility/street-to-driveway-90": [
    { gear: "reverse", steer: 0.3209137181226225, seconds: 2.560367215202747 },
    { gear: "reverse", steer: 0.4743092941651077, seconds: 2.6725572427055035 },
  ],
  "ioniq5-utility/street-to-driveway-90": [
    { gear: "reverse", steer: 0.3345055363297127, seconds: 1.4267395411814618 },
    { gear: "reverse", steer: 0.03593048059015149, seconds: 0.1 },
    { gear: "reverse", steer: 0.35282340650327393, seconds: 5.263643916349523 },
  ],
  "tractor-ag/street-to-driveway-90": [
    { gear: "reverse", steer: 0.039525373838841915, seconds: 2.5339565254747867 },
    { gear: "reverse", steer: 0.4127404107712209, seconds: 3.398072532378137 },
    { gear: "reverse", steer: 0.5126050980761647, seconds: 0.33110527992248534 },
  ],
  "odyssey-dual/street-to-driveway-90": [
    { gear: "reverse", steer: 0.18128765749004483, seconds: 2.1970151047833264 },
    { gear: "reverse", steer: 0.572523013559252, seconds: 4.0998980855054405 },
  ],
  "odyssey-utility/apron-to-loading-dock": [
    { gear: "reverse", steer: 0.2, seconds: 3.4 },
    { gear: "reverse", steer: 0.08, seconds: 2.4 },
  ],
  // Found by a kinodynamic-RRT motion planner from a straight street start;
  // reverse-only, verified to park (score ~87).
  "odyssey-utility/driveway-straight-start": [
    { gear: "reverse", steer: -1, seconds: 0.5 },
    { gear: "reverse", steer: -0.55, seconds: 0.5 },
    { gear: "reverse", steer: 1, seconds: 2.4273053505538873 },
    { gear: "reverse", steer: 0.55, seconds: 0.8 },
    { gear: "reverse", steer: 1, seconds: 2.4 },
    { gear: "reverse", steer: 0.55, seconds: 1.6731570513076335 },
    { gear: "reverse", steer: -0.9556019526626729, seconds: 1.2877949867154286 },
    { gear: "reverse", steer: -0.42585798223376276, seconds: 0.9347265038482286 },
  ],
  // New scenarios: search-found, adversarially-verified, all reverse-only.
  "odyssey-utility/street-to-gate-narrow": [
    { gear: "reverse", steer: -0.3690815973095596, seconds: 1.9355150305330755 },
    { gear: "reverse", steer: -0.5800595700927078, seconds: 1.9490679452195763 },
    { gear: "reverse", steer: -0.3756404554005712, seconds: 0.5402605695007368 },
  ],
  "odyssey-utility/flanked-loading-dock": [
    { gear: "reverse", steer: 0.2, seconds: 3.3585279999999997 },
    { gear: "reverse", steer: 0.08, seconds: 2.6846720000000004 },
  ],
  "odyssey-utility/parallel-park-curb": [
    { gear: "reverse", steer: 0.42869613374988375, seconds: 0.5793468018897566 },
    { gear: "reverse", steer: 0.005262709169305296, seconds: 1.0646937750581156 },
    { gear: "reverse", steer: -0.6141256532883856, seconds: 3.8052696999652635 },
    { gear: "reverse", steer: -0.19700956252264298, seconds: 2.627050970181381 },
  ],
  "odyssey-utility/lcorner-backin-90": [
    { gear: "reverse", steer: -0.043165, seconds: 3.198813 },
    { gear: "reverse", steer: 0.381121, seconds: 2.205931 },
    { gear: "reverse", steer: 0.916154, seconds: 2.391716 },
    { gear: "reverse", steer: 0.566398, seconds: 2.249586 },
  ],
  // Solved WITH the gravity-roll active (the old flat maneuver no longer parks here).
  "odyssey-utility/driveway-downhill": [
    { gear: "reverse", steer: 0.3372630379162728, seconds: 4.596609081085771 },
    { gear: "reverse", steer: 1, seconds: 0.483036484522745 },
    { gear: "reverse", steer: 0.37888668235391376, seconds: 0.925833912882954 },
  ],
  "odyssey-utility/blindside-backin": [
    { gear: "reverse", steer: -0.3089021208083951, seconds: 2.1242711953021627 },
    { gear: "reverse", steer: -0.43663049239002205, seconds: 3.2279808000209864 },
    { gear: "reverse", steer: -0.2215, seconds: 1.7375000000000003 },
  ],
};
