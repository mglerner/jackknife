import type { JackknifeState, PhysicsDerived } from "../core/types";
import { predictTailPath } from "../core/predict";
import type { GameState } from "../game/state";
import { commandedSpeed } from "../game/loop";
import { type Camera, worldToScreen } from "./camera";

export interface OverlayOpts {
  showGhost: boolean;
  showGuides: boolean;
}

const STATE_COLOR: Record<JackknifeState, string> = {
  ok: "#5ad17a",
  warn: "#f2c14e",
  recoverable: "#f2a14e",
  contact: "#ef6f6c",
};

/**
 * Draw the predicted trailer-tail ghost path, a jackknife-state border glow, and
 * (optionally) steering guide lines. Drawn in screen space over the chosen view.
 */
export function drawOverlays(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  gs: GameState,
  derived: PhysicsDerived,
  opts: OverlayOpts,
): void {
  if (opts.showGuides) drawAlignmentGuide(ctx, cam, gs, derived);
  if (opts.showGhost) drawGhost(ctx, cam, gs);
  drawJackknifeGlow(ctx, cam, derived.jackknifeState);
}

/** Faint line from the trailer tail toward the target center: a docking aid. */
function drawAlignmentGuide(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  gs: GameState,
  derived: PhysicsDerived,
): void {
  const tail = worldToScreen(cam, derived.trailerTail);
  const tgt = worldToScreen(cam, { x: gs.scenario.target.x, y: gs.scenario.target.y });
  ctx.save();
  ctx.strokeStyle = "rgba(154,166,178,0.4)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(tgt.x, tgt.y);
  ctx.stroke();
  ctx.restore();
}

function drawGhost(ctx: CanvasRenderingContext2D, cam: Camera, gs: GameState): void {
  const cmd = { v: commandedSpeed(gs), delta: gs.delta };
  if (cmd.v === 0) return; // nothing moves -> no useful prediction
  const pts = predictTailPath(gs.physics, gs.rig, cmd, gs.difficulty.ghostHorizon);
  if (pts.length < 2) return;

  ctx.save();
  ctx.strokeStyle = "rgba(76,194,255,0.55)";
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = worldToScreen(cam, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.stroke();
  // End marker where the tail lands at the horizon.
  const end = worldToScreen(cam, pts[pts.length - 1]);
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(76,194,255,0.85)";
  ctx.fill();
  ctx.restore();
}

/** Inset border glow whose color encodes the live jackknife state. */
function drawJackknifeGlow(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  state: JackknifeState,
): void {
  const color = STATE_COLOR[state];
  const thickness = state === "ok" ? 4 : state === "warn" ? 6 : state === "recoverable" ? 9 : 14;
  ctx.save();
  ctx.lineWidth = thickness;
  ctx.strokeStyle = color;
  ctx.globalAlpha = state === "ok" ? 0.35 : 0.65;
  ctx.strokeRect(
    thickness / 2,
    thickness / 2,
    cam.wCss - thickness,
    cam.hCss - thickness,
  );
  ctx.restore();
}
