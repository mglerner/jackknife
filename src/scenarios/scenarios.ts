import type { Scenario } from "./types";

const seg = (ax: number, ay: number, bx: number, by: number) =>
  ({ type: "segment", a: { x: ax, y: ay }, b: { x: bx, y: by } }) as const;

/**
 * 90° back-in: a street running east–west (centered on y=0), with a driveway
 * opening on the north side between x∈[-3, 3], extending north to a house wall.
 * The rig starts on the street east of the opening, straight, facing east — so
 * reversing (west) while curling the trailer north tucks it into the driveway.
 * Final trailer heading is +90° (pointing north, +y).
 */
export const STREET_TO_DRIVEWAY_90: Scenario = {
  id: "street-to-driveway-90",
  label: "Driveway (90°)",
  // Pulled up on the south side of the street, angled toward the driveway: the
  // canonical 90deg back-in setup. This start is solvable REVERSE-ONLY (see the
  // baked solution in game/solutions.ts and test/solvable.test.ts).
  start: { x: 3.565, y: -2.386, carHeading: -0.842, trailerHeading: -1.028 },
  // Back-in: the trailer ends deep in the driveway pointing OUT toward the street
  // (heading south, -90deg), with the tow vehicle nearer the street.
  target: { x: 0, y: 9, heading: -Math.PI / 2, halfWidth: 1.4, halfLength: 2.2 },
  obstacles: [
    // South curb of the street (street is ~8 m wide: y in [-5, 3]).
    { kind: "curb", shape: seg(-18, -5, 18, -5), penalty: 50 },
    // North frontage flanking the driveway opening (lawn/house edge at y=3).
    { kind: "curb", shape: seg(-18, 3, -3, 3), penalty: 50 },
    { kind: "curb", shape: seg(3, 3, 18, 3), penalty: 50 },
    // Driveway side walls.
    { kind: "wall", shape: seg(-3, 3, -3, 15), penalty: 120 },
    { kind: "wall", shape: seg(3, 3, 3, 15), penalty: 120 },
    // House wall at the back of the driveway.
    { kind: "wall", shape: seg(-3, 15, 3, 15), penalty: 200 },
  ],
  surface: "asphalt",
  slope: 0,
  mirrorsAvailable: true,
  cameraAvailable: true,
  worldBounds: { minX: -18, minY: -8, maxX: 18, maxY: 17 },
};

/**
 * Loading dock: a wide asphalt apron with a recessed dock bay on the north side
 * (between x∈[-1.7, 1.7], walls back to y=6.5). The rig starts on the apron facing
 * the bay nearly straight, so it is a gentler straight-ish back-in than the 90°
 * driveway. Solvable REVERSE-ONLY (see game/solutions.ts). Geometry + maneuver were
 * search-found and re-simulated through the real physics before being trusted.
 */
export const APRON_TO_LOADING_DOCK: Scenario = {
  id: "apron-to-loading-dock",
  label: "Loading dock",
  start: { x: 0.7446, y: -6.8085, carHeading: -1.3453, trailerHeading: -1.45 },
  target: { x: 0, y: 4.5, heading: -Math.PI / 2, halfWidth: 1.4, halfLength: 2.2 },
  obstacles: [
    // Dock bay side walls (the bay opening is x in [-1.7, 1.7]).
    { kind: "wall", shape: seg(-1.7, 0, -1.7, 6.5), penalty: 120 },
    { kind: "wall", shape: seg(1.7, 0, 1.7, 6.5), penalty: 120 },
    // Dock face at the back of the bay.
    { kind: "wall", shape: seg(-1.7, 6.5, 1.7, 6.5), penalty: 200 },
    // Building frontage flanking the bay opening (y=0), and an apron back edge.
    { kind: "curb", shape: seg(-22, 0, -1.7, 0), penalty: 50 },
    { kind: "curb", shape: seg(1.7, 0, 22, 0), penalty: 50 },
    { kind: "curb", shape: seg(-22, -9, 22, -9), penalty: 40 },
  ],
  surface: "asphalt",
  slope: 0,
  mirrorsAvailable: true,
  cameraAvailable: true,
  worldBounds: { minX: -22, minY: -11, maxX: 22, maxY: 9 },
  environment: "dock",
};

/**
 * The realistic version of the driveway back-in: the rig starts STRAIGHT in the
 * street (like you just drove down it), facing along the road with the trailer
 * straight behind, and must back into the same perpendicular driveway. Harder than
 * the pre-angled start. The reverse-only maneuver was found by a kinodynamic-RRT
 * motion planner and verified to park (see game/solutions.ts).
 */
export const DRIVEWAY_STRAIGHT_START: Scenario = {
  id: "driveway-straight-start",
  label: "Driveway (straight start)",
  start: { x: 9, y: -2.5, carHeading: 0, trailerHeading: 0 },
  target: STREET_TO_DRIVEWAY_90.target,
  obstacles: STREET_TO_DRIVEWAY_90.obstacles,
  surface: "asphalt",
  slope: 0,
  mirrorsAvailable: true,
  cameraAvailable: true,
  worldBounds: STREET_TO_DRIVEWAY_90.worldBounds,
};

/** Back through a narrow (2.6 m) gate into a fenced yard. Search-found, verified. */
export const STREET_TO_GATE_NARROW: Scenario = {
  id: "street-to-gate-narrow",
  label: "Narrow gate",
  start: { x: -2.8970202145599178, y: -2.0933448157706254, carHeading: -2.2923608569786573, trailerHeading: -2.0701465259569325 },
  target: { x: 0, y: 8, heading: -1.5707963267948966, halfWidth: 1.2, halfLength: 2.2 },
  obstacles: [
    { kind: "curb", shape: seg(-18, -5, 18, -5), penalty: 50 },
    { kind: "wall", shape: seg(-18, 3, -1.3, 3), penalty: 120 },
    { kind: "wall", shape: seg(1.3, 3, 18, 3), penalty: 120 },
    { kind: "wall", shape: seg(-1.3, 3, -1.3, 4.2), penalty: 150 },
    { kind: "wall", shape: seg(1.3, 3, 1.3, 4.2), penalty: 150 },
    { kind: "wall", shape: seg(-4.5, 3, -4.5, 12), penalty: 120 },
    { kind: "wall", shape: seg(4.5, 3, 4.5, 12), penalty: 120 },
    { kind: "wall", shape: seg(-4.5, 12, 4.5, 12), penalty: 200 },
  ],
  surface: "asphalt",
  slope: 0,
  mirrorsAvailable: true,
  cameraAvailable: true,
  worldBounds: { minX: -18, minY: -8, maxX: 18, maxY: 14 },
  environment: "generic",
};

/** Loading dock with two parked trailers flanking the bay mouth. Verified. */
export const FLANKED_LOADING_DOCK: Scenario = {
  id: "flanked-loading-dock",
  label: "Dock (flanked by trailers)",
  start: { x: 0.7446, y: -6.8085, carHeading: -1.3453, trailerHeading: -1.45 },
  target: { x: 0, y: 4.5, heading: -1.5707963267948966, halfWidth: 1.4, halfLength: 2.2 },
  obstacles: [
    { kind: "wall", shape: seg(-1.7, 0, -1.7, 6.5), penalty: 120 },
    { kind: "wall", shape: seg(1.7, 0, 1.7, 6.5), penalty: 120 },
    { kind: "wall", shape: seg(-1.7, 6.5, 1.7, 6.5), penalty: 200 },
    { kind: "curb", shape: seg(-22, 0, -1.7, 0), penalty: 50 },
    { kind: "curb", shape: seg(1.7, 0, 22, 0), penalty: 50 },
    { kind: "curb", shape: seg(-22, -9, 22, -9), penalty: 40 },
    { kind: "wall", shape: seg(-4.2, -7.5, -2.2, -7.5), penalty: 120 },
    { kind: "wall", shape: seg(-2.2, -7.5, -2.2, -1), penalty: 120 },
    { kind: "wall", shape: seg(-2.2, -1, -4.2, -1), penalty: 120 },
    { kind: "wall", shape: seg(-4.2, -1, -4.2, -7.5), penalty: 120 },
    { kind: "wall", shape: seg(2.2, -7.5, 4.2, -7.5), penalty: 120 },
    { kind: "wall", shape: seg(4.2, -7.5, 4.2, -1), penalty: 120 },
    { kind: "wall", shape: seg(4.2, -1, 2.2, -1), penalty: 120 },
    { kind: "wall", shape: seg(2.2, -1, 2.2, -7.5), penalty: 120 },
  ],
  surface: "asphalt",
  slope: 0,
  mirrorsAvailable: true,
  cameraAvailable: true,
  worldBounds: { minX: -22, minY: -11, maxX: 22, maxY: 9 },
  environment: "dock",
};

/** Parallel-park the trailer into a curbside gap between two parked cars. Verified. */
export const PARALLEL_PARK_CURB: Scenario = {
  id: "parallel-park-curb",
  label: "Parallel park (curbside)",
  start: { x: 9.5, y: 3.8, carHeading: 0, trailerHeading: 0 },
  target: { x: -1.45, y: 1.05, heading: 0, halfWidth: 1, halfLength: 2.2 },
  obstacles: [
    { kind: "curb", shape: seg(-16, 0, 16, 0), penalty: 50 },
    { kind: "curb", shape: seg(-16, 7.5, 16, 7.5), penalty: 50 },
    { kind: "wall", shape: seg(-7.6, 0.1, -2.9, 0.1), penalty: 120 },
    { kind: "wall", shape: seg(-2.9, 0.1, -2.9, 2), penalty: 120 },
    { kind: "wall", shape: seg(-2.9, 2, -7.6, 2), penalty: 120 },
    { kind: "wall", shape: seg(-7.6, 2, -7.6, 0.1), penalty: 120 },
    { kind: "wall", shape: seg(3.3, 0.1, 8, 0.1), penalty: 120 },
    { kind: "wall", shape: seg(8, 0.1, 8, 2), penalty: 120 },
    { kind: "wall", shape: seg(8, 2, 3.3, 2), penalty: 120 },
    { kind: "wall", shape: seg(3.3, 2, 3.3, 0.1), penalty: 120 },
  ],
  surface: "asphalt",
  slope: 0,
  mirrorsAvailable: true,
  cameraAvailable: true,
  worldBounds: { minX: -16, minY: -2, maxX: 16, maxY: 10 },
  environment: "generic",
};

/** Back the trailer around a 90-degree corner (L-shaped alley). Verified. */
export const LCORNER_BACKIN_90: Scenario = {
  id: "lcorner-backin-90",
  label: "L-corner back-in",
  start: { x: 12.44, y: 0, carHeading: 0, trailerHeading: 0 },
  target: { x: 0, y: 7.2, heading: -1.5707963267948966, halfWidth: 1.4, halfLength: 2.2 },
  obstacles: [
    { kind: "wall", shape: seg(13.5, -3.8, -3.8, -3.8), penalty: 120 },
    { kind: "wall", shape: seg(-3.8, -3.8, -3.8, 12), penalty: 120 },
    { kind: "wall", shape: seg(13.5, 3.8, 3.8, 3.8), penalty: 120 },
    { kind: "wall", shape: seg(3.8, 3.8, 3.8, 12), penalty: 120 },
    { kind: "wall", shape: seg(-3.8, 12, 3.8, 12), penalty: 200 },
  ],
  surface: "asphalt",
  slope: 0,
  mirrorsAvailable: true,
  cameraAvailable: true,
  worldBounds: { minX: -6, minY: -6, maxX: 16.5, maxY: 15 },
  environment: "generic",
};

export const SCENARIOS: Record<string, Scenario> = {
  [STREET_TO_DRIVEWAY_90.id]: STREET_TO_DRIVEWAY_90,
  [DRIVEWAY_STRAIGHT_START.id]: DRIVEWAY_STRAIGHT_START,
  [APRON_TO_LOADING_DOCK.id]: APRON_TO_LOADING_DOCK,
  [STREET_TO_GATE_NARROW.id]: STREET_TO_GATE_NARROW,
  [FLANKED_LOADING_DOCK.id]: FLANKED_LOADING_DOCK,
  [PARALLEL_PARK_CURB.id]: PARALLEL_PARK_CURB,
  [LCORNER_BACKIN_90.id]: LCORNER_BACKIN_90,
};

export const DEFAULT_SCENARIO = STREET_TO_DRIVEWAY_90;
