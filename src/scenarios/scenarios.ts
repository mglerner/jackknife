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
  label: "Street → perpendicular driveway (90° back-in)",
  start: { x: 8, y: 0, carHeading: 0, trailerHeading: 0 },
  target: { x: 0, y: 9, heading: Math.PI / 2, halfWidth: 1.4, halfLength: 2.2 },
  obstacles: [
    // South curb of the street.
    { kind: "curb", shape: seg(-18, -3, 18, -3), penalty: 50 },
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
  worldBounds: { minX: -18, minY: -6, maxX: 18, maxY: 17 },
};

export const SCENARIOS: Record<string, Scenario> = {
  [STREET_TO_DRIVEWAY_90.id]: STREET_TO_DRIVEWAY_90,
};

export const DEFAULT_SCENARIO = STREET_TO_DRIVEWAY_90;
