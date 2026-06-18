import type { PhysicsDerived } from "../core/types";
import type { GameState } from "../game/state";
import type { Camera } from "./camera";
import { drawWorldInto, type DrawWorldOpts } from "./drawWorld";

/** Full-canvas god's-eye view. Thin wrapper over drawWorldInto with the grid on. */
export function drawTopDown(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  gs: GameState,
  derived: PhysicsDerived,
  opts: DrawWorldOpts = {},
): void {
  drawWorldInto(ctx, cam, gs, derived, { grid: true, ...opts });
}
