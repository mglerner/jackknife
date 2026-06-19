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

export const SCENARIOS: Record<string, Scenario> = {
  [STREET_TO_DRIVEWAY_90.id]: STREET_TO_DRIVEWAY_90,
  [APRON_TO_LOADING_DOCK.id]: APRON_TO_LOADING_DOCK,
};

export const DEFAULT_SCENARIO = STREET_TO_DRIVEWAY_90;
