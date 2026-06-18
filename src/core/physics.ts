// =============================================================================
// CANONICAL CONVENTION BLOCK — the single source of truth. Do not re-derive the
// equations of motion anywhere else; input/render reference these only.
//
//   World frame:   +x = car forward, +y = car LEFT, angles CCW (right-handed).
//   Headings:      carHeading, trailerHeading are ABSOLUTE (rad, CCW).
//   Articulation:  gamma = trailerHeading - carHeading   (derived, never stored).
//   Steering:      delta > 0 = LEFT turn (CCW). Clamped to ±rig.maxSteer.
//   Speed:         v = car rear-axle speed (m/s). REVERSE => v < 0.
//
//   Equations of motion (off-axle one-trailer kinematic model):
//     carHeadingDot     = (v / W) * tan(delta)
//     trailerHeadingDot = -(v / D) * sin(gamma) - (L / D) * cos(gamma) * carHeadingDot
//     gammaDot          = trailerHeadingDot - carHeadingDot
//                       = -(v/D)*sin(gamma) - (v/W)*(1 + (L/D)*cos(gamma))*tan(delta)
//
//   The MINUS sign on the sin(gamma) term is load-bearing: with delta = 0,
//   forward motion (v>0) makes gamma decay (trailer self-centers — stable) and
//   reverse (v<0) makes gamma grow (jackknife — unstable). A '+' here would make
//   the trailer diverge while driving FORWARD, which is physically impossible.
//   The forward-self-centering unit test pins this.
// =============================================================================

import { clamp } from "./vec";
import type { Input, PhysicsDerived, Rig, State } from "./types";
import { classify, computeCriticalGamma } from "./jackknife";

/** Articulation rate from the canonical EOM. */
function gammaDotOf(rig: Rig, gamma: number, v: number, delta: number): number {
  const carHeadingDot = (v / rig.W) * Math.tan(delta);
  return -(v / rig.D) * Math.sin(gamma) - carHeadingDot * (1 + (rig.L / rig.D) * Math.cos(gamma));
}

/**
 * Advance one physics substep. Pure: returns a NEW state, never mutates.
 * Semi-implicit Euler — update headings from start-of-step rates, then advance
 * the position along the UPDATED car heading. At ~120 Hz this is provably
 * adequate (dynamics timescale D/|v| ≈ 2–4 s ≫ dt); RK4 is unjustified.
 */
export function step(s: State, rig: Rig, input: Input): State {
  const delta = clamp(input.delta, -rig.maxSteer, rig.maxSteer);
  const { v, dt } = input;
  const gamma = s.trailerHeading - s.carHeading;

  const carHeadingDot = (v / rig.W) * Math.tan(delta);
  const trailerHeadingDot =
    -(v / rig.D) * Math.sin(gamma) - (rig.L / rig.D) * Math.cos(gamma) * carHeadingDot;

  const carHeading = s.carHeading + carHeadingDot * dt;
  let trailerHeading = s.trailerHeading + trailerHeadingDot * dt;

  // Hard contact: the trailer physically cannot fold past hardLimitGamma.
  const newGamma = trailerHeading - carHeading;
  const hard = rig.hardLimitGamma;
  if (newGamma > hard) trailerHeading = carHeading + hard;
  else if (newGamma < -hard) trailerHeading = carHeading - hard;

  const x = s.x + v * Math.cos(carHeading) * dt;
  const y = s.y + v * Math.sin(carHeading) * dt;

  return { x, y, carHeading, trailerHeading };
}

/**
 * Derive everything rendering/coaching needs from the state plus the current
 * command (the command only affects `gammaDot`, used for live cues).
 */
export function derive(s: State, rig: Rig, cmd: { v: number; delta: number }): PhysicsDerived {
  const gamma = s.trailerHeading - s.carHeading;
  const delta = clamp(cmd.delta, -rig.maxSteer, rig.maxSteer);
  const gammaDot = gammaDotOf(rig, gamma, cmd.v, delta);

  const ch = s.carHeading;
  const th = s.trailerHeading;
  const hitch = { x: s.x - rig.L * Math.cos(ch), y: s.y - rig.L * Math.sin(ch) };
  const trailerAxle = { x: hitch.x - rig.D * Math.cos(th), y: hitch.y - rig.D * Math.sin(th) };
  const trailerTail = {
    x: trailerAxle.x - rig.trailerRearOverhang * Math.cos(th),
    y: trailerAxle.y - rig.trailerRearOverhang * Math.sin(th),
  };

  const criticalGamma = computeCriticalGamma(rig);
  return {
    gamma,
    gammaDot,
    trailerHeading: th,
    hitch,
    trailerAxle,
    trailerTail,
    criticalGamma,
    hardLimitGamma: rig.hardLimitGamma,
    jackknifeState: classify(gamma, criticalGamma, rig.hardLimitGamma),
  };
}
