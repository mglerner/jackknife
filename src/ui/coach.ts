import type { PhysicsDerived } from "../core/types";
import type { GameState } from "../game/state";
import { commandedSpeed } from "../game/loop";
import { isTrailerInTarget, trailerTargetError } from "../scoring/types";

/** A short coaching line driven by the live physics, adapted to what you are doing
 *  wrong and to the scenario (downhill, blind side). No em/en dashes. */
export function coachingMessage(gs: GameState, d: PhysicsDerived): string {
  switch (d.jackknifeState) {
    case "contact":
      return "Jackknifed. Pull forward to straighten the trailer.";
    case "recoverable":
      return "Too sharp to recover in reverse. Pull forward to reset.";
    case "warn":
      // Call out over-steering specifically when you are near full lock.
      return Math.abs(gs.delta) > gs.rig.maxSteer * 0.75
        ? "Too much wheel. Straighten out before it folds."
        : "Heading toward a jackknife. Straighten the wheel a little.";
    default:
      break;
  }

  if (isTrailerInTarget(gs)) {
    return "In the box. Ease off and come to a stop.";
  }

  // Downhill scenarios: the gravity roll adds to your reverse, so it runs away.
  if (gs.scenario.slope > 0 && commandedSpeed(gs) < -0.05) {
    return "Downhill: gravity adds to your reverse. Short, gentle pushes, let it stop.";
  }

  if (Math.abs(gs.delta) < 0.02) {
    return "Turn the wheel toward where you want the trailer to go. The bottom of the wheel leads.";
  }

  const e = trailerTargetError(gs);
  const linedUp = Math.abs(e.heading) < 0.12;
  const close = Math.abs(e.lateral) < 1.0 && Math.abs(e.longitudinal) < 2.5;
  if (close && linedUp) {
    return "Almost lined up. Tiny corrections now, ease it back.";
  }
  if (!linedUp) {
    // Blind-side scenarios: the trailer swings where you cannot see it directly.
    return gs.scenario.id.includes("blind")
      ? "Blind side: watch your right mirror as the trailer swings toward the opening."
      : "Let the trailer swing toward the opening, then straighten as it lines up.";
  }
  return "Good line. Small inputs, the trailer follows the bottom of the wheel.";
}
