import type { PhysicsDerived } from "../core/types";
import type { Vec2 } from "../core/vec";
import type { GameState } from "../game/state";
import type { Camera } from "./camera";
import { drawWorldInto } from "./drawWorld";

export interface BackupCamLayout {
  x: number; // pane top-left (CSS px)
  y: number;
  w: number;
  h: number;
  dpr: number;
  showGuides?: boolean;
}

const COL = {
  bg: "#0c0f13",
  border: "#3a4250",
  label: "#9aa6b2",
  placeholder: "#ef6f6c",
  guideNear: "#5ad17a",
  guideMid: "#f2c14e",
  guideFar: "#ef6f6c",
};

/**
 * Wide rear-facing pane. ONLY usable when scenario.cameraAvailable and the rig's
 * load does not block the camera; otherwise renders a "Camera blocked by load"
 * (or "No camera on this scenario") placeholder. Optionally draws colored distance
 * guide lines that curve with the current steer.
 */
export function drawBackupCam(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  derived: PhysicsDerived,
  layout: BackupCamLayout,
): void {
  const { x, y, w, h } = layout;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = COL.bg;
  ctx.fillRect(x, y, w, h);

  const blocked = !gs.scenario.cameraAvailable || gs.rig.loadBlocksCamera;
  if (blocked) {
    ctx.restore();
    drawPlaceholder(ctx, gs, layout);
    return;
  }

  const { physics } = gs;
  const lookHeading = physics.carHeading + Math.PI; // straight rearward

  // Eyepoint sits at the rear bumper, a touch high (faked by depth only).
  const rearDist = gs.rig.carLength - gs.rig.carFrontOverhang;
  const eye: Vec2 = {
    x: physics.x - rearDist * Math.cos(physics.carHeading),
    y: physics.y - rearDist * Math.sin(physics.carHeading),
  };

  const viewDepth = 11; // meters of rearward world shown (wide field)
  const center: Vec2 = {
    x: eye.x + (viewDepth / 2) * Math.cos(lookHeading),
    y: eye.y + (viewDepth / 2) * Math.sin(lookHeading),
  };
  const pxPerMeter = h / viewDepth;

  const cam: Camera = {
    centerX: center.x,
    centerY: center.y,
    pxPerMeter,
    wCss: w,
    hCss: h,
    dpr: layout.dpr,
  };

  // Same transform as the mirrors but WITHOUT the horizontal flip: a backup
  // camera image is presented un-mirrored (the screen shows the scene as a
  // forward-looking camera pointed backward, conventionally un-flipped).
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(-(lookHeading - Math.PI / 2));
  ctx.translate(-w / 2, -h / 2);

  drawWorldInto(ctx, cam, gs, derived, { grid: false });

  if (layout.showGuides) drawGuides(ctx, gs, derived, cam, eye, lookHeading, viewDepth);

  ctx.restore();

  // Depth gradient + frame + label.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, "rgba(12,15,19,0.5)");
  grad.addColorStop(1, "rgba(12,15,19,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();

  frameAndLabel(ctx, layout, "Backup camera");
}

/** Without the flip, world look dir -> pane up needs rotation -(lookHeading-pi/2). */
function drawGuides(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  _derived: PhysicsDerived,
  cam: Camera,
  eye: Vec2,
  lookHeading: number,
  viewDepth: number,
): void {
  // Distance bands at ~1.5, 4, 7 m behind the bumper, curved by current steer.
  // In reverse, steering delta bends the rear path; positive delta (LEFT) curves
  // the car's rear to the RIGHT of travel. We approximate the rear path as a
  // circular arc of radius R = W / tan(delta).
  const bands = [
    { dist: 1.5, color: COL.guideNear },
    { dist: 4.0, color: COL.guideMid },
    { dist: 7.0, color: COL.guideFar },
  ];
  const delta = gs.delta;
  const W = gs.rig.W;
  const halfTrack = gs.rig.carWidth / 2;

  // Lateral curvature offset as a function of distance d behind: for small angles,
  // offset ~ d^2 / (2R) with R = W/tan(delta). Sign: delta>0 (left turn) reversing
  // pushes the rear toward the driver's right, i.e. -lateral(world LEFT).
  const invR = Math.tan(delta) / W;
  const lateralAt = (d: number): number => -0.5 * d * d * invR;

  for (const band of bands) {
    if (band.dist > viewDepth) continue;
    drawGuideLine(ctx, cam, eye, lookHeading, band.dist, halfTrack, lateralAt, band.color);
  }
}

function drawGuideLine(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  eye: Vec2,
  lookHeading: number,
  maxDist: number,
  halfTrack: number,
  lateralAt: (d: number) => number,
  color: string,
): void {
  // Two rails (left/right of the rear axle track) drawn as polylines in world.
  const fwd: Vec2 = { x: Math.cos(lookHeading), y: Math.sin(lookHeading) };
  const left: Vec2 = { x: -Math.sin(lookHeading), y: Math.cos(lookHeading) };
  const rail = (side: number): Vec2[] => {
    const pts: Vec2[] = [];
    const N = 12;
    for (let i = 0; i <= N; i++) {
      const d = (maxDist * i) / N;
      const lat = lateralAt(d) + side * halfTrack;
      pts.push({
        x: eye.x + d * fwd.x + lat * left.x,
        y: eye.y + d * fwd.y + lat * left.y,
      });
    }
    return pts;
  };
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  for (const side of [-1, 1]) {
    const pts = rail(side);
    ctx.beginPath();
    pts.forEach((p, i) => {
      const s = worldPt(cam, p);
      if (i === 0) ctx.moveTo(s.x, s.y);
      else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
  }
  // Cross tick at the far end of this band.
  const lA = worldPt(cam, rail(-1)[rail(-1).length - 1]);
  const rB = worldPt(cam, rail(1)[rail(1).length - 1]);
  ctx.beginPath();
  ctx.moveTo(lA.x, lA.y);
  ctx.lineTo(rB.x, rB.y);
  ctx.stroke();
}

// Local copy of worldToScreen to avoid an import cycle of style; identical math.
function worldPt(cam: Camera, p: Vec2): Vec2 {
  return {
    x: cam.wCss / 2 + (p.x - cam.centerX) * cam.pxPerMeter,
    y: cam.hCss / 2 - (p.y - cam.centerY) * cam.pxPerMeter,
  };
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
  ctx.fillStyle = COL.bg;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COL.placeholder;
  ctx.font = "16px -apple-system, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const msg = gs.rig.loadBlocksCamera ? "Camera blocked by load" : "No camera on this scenario";
  ctx.fillText(msg, x + w / 2, y + h / 2);
  ctx.textAlign = "left";
  ctx.restore();
  frameAndLabel(ctx, layout, "Backup camera");
}

function frameAndLabel(
  ctx: CanvasRenderingContext2D,
  layout: BackupCamLayout,
  label: string,
): void {
  const { x, y, w, h } = layout;
  ctx.save();
  ctx.strokeStyle = COL.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = COL.label;
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  ctx.textBaseline = "bottom";
  ctx.fillText(label, x + 6, y + h - 5);
  ctx.restore();
}
