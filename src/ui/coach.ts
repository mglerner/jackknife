import type { PhysicsDerived } from "../core/types";
import type { GameState } from "../game/state";

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
  if (Math.abs(gs.delta) < 0.02) {
    return "Push the bottom of the wheel toward where you want the trailer to go.";
  }
  return "Small inputs. The trailer follows the bottom of the wheel.";
}
