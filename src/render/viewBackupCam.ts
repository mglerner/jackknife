import type { PhysicsDerived } from "../core/types";
import type { Vec2 } from "../core/vec";
import type { GameState } from "../game/state";
import { type CamPose, drawPerspectiveScene, frameLabel } from "./perspective";

export interface BackupCamLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  dpr: number;
  showGuides?: boolean;
}

/**
 * Rear-bumper backup camera: a perspective view of the ground behind the vehicle.
 * Only usable when the scenario has a camera and the rig's load does not block it;
 * otherwise a placeholder is shown.
 */
export function drawBackupCam(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  derived: PhysicsDerived,
  layout: BackupCamLayout,
): void {
  const { x, y, w, h } = layout;
  if (!gs.scenario.cameraAvailable || gs.rig.loadBlocksCamera) {
    drawPlaceholder(ctx, gs, layout);
    return;
  }

  const H = gs.physics.carHeading;
  const rearDist = gs.rig.carLength - gs.rig.carFrontOverhang; // rear axle -> bumper
  const eye: Vec2 = {
    x: gs.physics.x - rearDist * Math.cos(H),
    y: gs.physics.y - rearDist * Math.sin(H),
  };
  const pose: CamPose = {
    eye,
    lookH: H + Math.PI,
    height: 1.05,
    focalH: w * 0.66,
    focalV: h * 1.05,
    pane: { x, y, w, h },
    horizonY: y + h * 0.3,
    mirrored: true,
  };
  drawPerspectiveScene(ctx, pose, gs, derived, { guides: layout.showGuides !== false, grid: true });
  frameLabel(ctx, { x, y, w, h }, "Backup camera");
}

function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  layout: BackupCamLayout,
): void {
  const { x, y, w, h } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#0a0d11";
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#ef6f6c";
  ctx.font = "16px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const msg = gs.rig.loadBlocksCamera ? "Camera blocked by load" : "No camera on this scenario";
  ctx.fillText(msg, x + w / 2, y + h / 2);
  ctx.textAlign = "left";
  ctx.restore();
  frameLabel(ctx, { x, y, w, h }, "Backup camera");
}
