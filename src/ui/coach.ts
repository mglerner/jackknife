import type { PhysicsDerived } from "../core/types";
import type { GameState } from "../game/state";
import { isTrailerInTarget, trailerTargetError } from "../scoring/types";

/** A short coaching line driven by the live physics. No em/en dashes. */
export function coachingMessage(gs: GameState, d: PhysicsDerived): string {
  switch (d.jackknifeState) {
    case "contact":
      return "Jackknifed. Pull forward to straighten the trailer.";
    case "recoverable":
      return "Too sharp to recover in reverse. Pull forward to reset.";
    case "warn":
      return "Heading toward a jackknife. Straighten the wheel a little.";
    default:
      break;
  }

  if (isTrailerInTarget(gs)) {
    return "In the box. Ease off and come to a stop.";
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
    return "Let the trailer swing toward the opening, then straighten as it lines up.";
  }
  return "Good line. Small inputs, the trailer follows the bottom of the wheel.";
}
