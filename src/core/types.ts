import type { Vec2 } from "./vec";

/**
 * Physics state. The integration anchor is the tow vehicle's REAR AXLE midpoint.
 * `gamma` (articulation angle) is intentionally NOT stored — it is derived as
 * `trailerHeading - carHeading` so both bodies + the hitch draw trivially.
 */
export interface State {
  x: number; // car rear-axle x (m)
  y: number; // car rear-axle y (m)
  carHeading: number; // absolute heading (rad, CCW)
  trailerHeading: number; // absolute heading (rad, CCW)
}

/** A rig is pure data: three physics constants + drawing/collision dimensions. */
export interface Rig {
  id: string;
  label: string;
  // The three constants that define the dynamics:
  W: number; // tow wheelbase, front axle -> rear axle (m)
  L: number; // hitch offset, rear axle -> hitch ball (m)
  D: number; // trailer wheelbase, hitch -> trailer axle (m); D_eff for dual-axle
  maxSteer: number; // |delta| physical limit (rad)
  // Dimensions (for rendering + collision):
  carLength: number;
  carWidth: number;
  carFrontOverhang: number; // distance rear axle -> front bumper (m); rear bumper sits carLength - this behind the axle
  trailerLength: number;
  trailerWidth: number;
  trailerRearOverhang: number; // trailer axle -> tail (m)
  // Jackknife + camera:
  hardLimitGamma: number; // physical contact angle (rad, ~75°)
  loadBlocksCamera: boolean; // tall/enclosed load => backup cam unusable
  axleConfig: "single" | "dual";
  // Optional taxonomy (for UI / scenario filtering); legacy + inline test rigs omit these:
  vehicleType?: "minivan" | "suv" | "tractor";
  trailerType?: "utility-single" | "utility-dual" | "ag";
}

/** Per-substep command. */
export interface Input {
  delta: number; // commanded front-wheel steer (rad); + = left/CCW
  v: number; // car rear-axle speed (m/s); reverse => v < 0
  dt: number; // seconds
}

export type JackknifeState = "ok" | "warn" | "recoverable" | "contact";

/** Everything rendering / coaching needs, derived from `State` + current command. */
export interface PhysicsDerived {
  gamma: number; // trailerHeading - carHeading
  gammaDot: number; // current articulation rate (for coaching cues)
  trailerHeading: number;
  hitch: Vec2; // ball position
  trailerAxle: Vec2;
  trailerTail: Vec2; // center of trailer rear (what the ghost predicts)
  criticalGamma: number; // beyond this, reverse recovery impossible
  hardLimitGamma: number;
  jackknifeState: JackknifeState;
}
