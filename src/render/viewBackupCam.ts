import type { PhysicsDerived } from "../core/types";
import type { Vec2 } from "../core/vec";
import type { GameState } from "../game/state";

export interface BackupCamLayout {
  x: number; // pane top-left (CSS px)
  y: number;
  w: number;
  h: number;
  dpr: number;
  showGuides?: boolean;
}

const COL = {
  sky: "#0a0d11",
  groundNear: "#23282f",
  groundFar: "#161b21",
  grid: "rgba(255,255,255,0.06)",
  border: "#3a4250",
  label: "#9aa6b2",
  placeholder: "#ef6f6c",
  wall: "#39424f",
  wallTop: "#4a5663",
  curb: "rgba(154,166,178,0.5)",
  target: "#5ad17a",
  trailer: "#4cc2ff",
  guideNear: "#5ad17a",
  guideMid: "#f2c14e",
  guideFar: "#ef6f6c",
};

const NEAR = 0.35; // nearest visible depth behind the bumper (m)
const CAM_H = 1.05; // camera height above ground (m)
const WALL_H = 1.2;
const TRAILER_H = 1.3;

/** A projected screen point plus its depth behind the camera. */
interface PP {
  x: number;
  y: number;
  behind: number;
}

/**
 * A real rear-bumper backup camera: a perspective projection of the ground plane
 * behind the vehicle. The ground recedes to a horizon, walls and the trailer have
 * height, and the image is mirrored (vehicle-left shows on the left) like a real
 * reversing camera. Only usable when the scenario has a camera and the load does
 * not block it; otherwise a placeholder is shown.
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

  if (!gs.scenario.cameraAvailable || gs.rig.loadBlocksCamera) {
    ctx.fillStyle = COL.sky;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    drawPlaceholder(ctx, gs, layout);
    return;
  }

  const H = gs.physics.carHeading;
  const cosH = Math.cos(H);
  const sinH = Math.sin(H);
  const rearDist = gs.rig.carLength - gs.rig.carFrontOverhang; // rear axle -> bumper
  const eye: Vec2 = {
    x: gs.physics.x - rearDist * cosH,
    y: gs.physics.y - rearDist * sinH,
  };

  const horizonY = y + h * 0.3;
  const cx = x + w / 2;
  const focalH = w * 0.66;
  const focalV = h * 1.05;

  // World point -> screen (mirrored). Returns null if at/behind the camera plane.
  const project = (p: Vec2, z = 0): PP | null => {
    const dx = p.x - eye.x;
    const dy = p.y - eye.y;
    const behind = -(dx * cosH + dy * sinH); // distance rearward
    if (behind <= NEAR) return null;
    const left = dx * -sinH + dy * cosH; // vehicle-left offset
    return {
      x: cx - focalH * (left / behind), // mirrored: left -> screen-left
      y: horizonY + focalV * ((CAM_H - z) / behind),
      behind,
    };
  };
  // Camera-frame point (depth behind, vehicle-left offset, height) -> screen.
  const camPt = (behind: number, left: number, z = 0): PP | null => {
    if (behind <= NEAR) return null;
    return {
      x: cx - focalH * (left / behind),
      y: horizonY + focalV * ((CAM_H - z) / behind),
      behind,
    };
  };

  drawBackground(ctx, x, y, w, h, horizonY);
  drawGroundGrid(ctx, camPt);
  drawTargetBox(ctx, project, gs);
  drawObstacles(ctx, project, gs);
  drawTrailer(ctx, project, gs, derived);
  if (layout.showGuides !== false) drawGuides(ctx, camPt, gs);

  ctx.restore();

  drawVignette(ctx, x, y, w, h);
  frameAndLabel(ctx, layout, "Backup camera");
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  horizonY: number,
): void {
  ctx.fillStyle = COL.sky;
  ctx.fillRect(x, y, w, horizonY - y);
  const g = ctx.createLinearGradient(0, horizonY, 0, y + h);
  g.addColorStop(0, COL.groundFar);
  g.addColorStop(1, COL.groundNear);
  ctx.fillStyle = g;
  ctx.fillRect(x, horizonY, w, y + h - horizonY);
}

function polyline(ctx: CanvasRenderingContext2D, pts: Array<PP | null>): void {
  let started = false;
  ctx.beginPath();
  for (const p of pts) {
    if (!p) {
      started = false;
      continue;
    }
    if (!started) {
      ctx.moveTo(p.x, p.y);
      started = true;
    } else {
      ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
}

function drawGroundGrid(
  ctx: CanvasRenderingContext2D,
  camPt: (b: number, l: number, z?: number) => PP | null,
): void {
  ctx.strokeStyle = COL.grid;
  ctx.lineWidth = 1;
  // Depth lines (constant distance behind).
  for (const d of [1, 2, 3, 4, 6, 8, 11, 15]) {
    const pts: Array<PP | null> = [];
    for (let lat = -8; lat <= 8; lat += 0.8) pts.push(camPt(d, lat));
    polyline(ctx, pts);
  }
  // Lateral lines (constant vehicle-left offset).
  for (let lat = -8; lat <= 8; lat += 2) {
    const pts: Array<PP | null> = [];
    for (let d = NEAR + 0.05; d <= 15; d += 0.6) pts.push(camPt(d, lat));
    polyline(ctx, pts);
  }
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: PP[], fill: string, stroke?: string): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawTargetBox(
  ctx: CanvasRenderingContext2D,
  project: (p: Vec2, z?: number) => PP | null,
  gs: GameState,
): void {
  const t = gs.scenario.target;
  const al: Vec2 = { x: Math.cos(t.heading), y: Math.sin(t.heading) };
  const lf: Vec2 = { x: -Math.sin(t.heading), y: Math.cos(t.heading) };
  const corner = (s: number, u: number): Vec2 => ({
    x: t.x + s * t.halfLength * al.x + u * t.halfWidth * lf.x,
    y: t.y + s * t.halfLength * al.y + u * t.halfWidth * lf.y,
  });
  const ring = [corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)].map((p) => project(p));
  if (ring.some((p) => p === null)) return;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = COL.target;
  ctx.lineWidth = 2;
  polyline(ctx, [...ring, ring[0]]);
  ctx.restore();
}

function drawObstacles(
  ctx: CanvasRenderingContext2D,
  project: (p: Vec2, z?: number) => PP | null,
  gs: GameState,
): void {
  // Draw farthest first so nearer walls overlap correctly.
  const walls = gs.scenario.obstacles
    .filter((o) => o.shape.type === "segment")
    .map((o) => o.shape as { type: "segment"; a: Vec2; b: Vec2 } & { kind?: string });
  for (const o of gs.scenario.obstacles) {
    if (o.shape.type !== "segment") continue;
    const a = o.shape.a;
    const b = o.shape.b;
    if (o.kind === "curb") {
      const a0 = project(a);
      const b0 = project(b);
      if (a0 && b0) {
        ctx.strokeStyle = COL.curb;
        ctx.lineWidth = 2;
        polyline(ctx, [a0, b0]);
      }
      continue;
    }
    // Wall: vertical quad from ground to WALL_H.
    const a0 = project(a, 0);
    const b0 = project(b, 0);
    const a1 = project(a, WALL_H);
    const b1 = project(b, WALL_H);
    if (a0 && b0 && a1 && b1) {
      fillPoly(ctx, [a0, b0, b1, a1], COL.wall, "#222831");
      ctx.strokeStyle = COL.wallTop;
      ctx.lineWidth = 2;
      polyline(ctx, [a1, b1]);
    }
  }
  void walls;
}

function drawTrailer(
  ctx: CanvasRenderingContext2D,
  project: (p: Vec2, z?: number) => PP | null,
  gs: GameState,
  d: PhysicsDerived,
): void {
  const th = d.trailerHeading;
  const lf: Vec2 = { x: -Math.sin(th), y: Math.cos(th) };
  const hw = gs.rig.trailerWidth / 2;
  const front = d.hitch; // coupler end (closest to camera)
  const back = d.trailerTail;
  const off = (p: Vec2, s: number): Vec2 => ({ x: p.x + s * hw * lf.x, y: p.y + s * hw * lf.y });

  const fL = off(front, 1);
  const fR = off(front, -1);
  const bL = off(back, 1);
  const bR = off(back, -1);

  // Top face (always try) then back + sides, drawing far-to-near.
  const top = [project(fL, TRAILER_H), project(fR, TRAILER_H), project(bR, TRAILER_H), project(bL, TRAILER_H)];
  const back0 = [project(bL, 0), project(bR, 0), project(bR, TRAILER_H), project(bL, TRAILER_H)];
  const leftSide = [project(fL, 0), project(bL, 0), project(bL, TRAILER_H), project(fL, TRAILER_H)];
  const rightSide = [project(fR, 0), project(bR, 0), project(bR, TRAILER_H), project(fR, TRAILER_H)];

  if (leftSide.every(Boolean)) fillPoly(ctx, leftSide as PP[], shade(COL.trailer, 0.7), "#0b2734");
  if (rightSide.every(Boolean)) fillPoly(ctx, rightSide as PP[], shade(COL.trailer, 0.55), "#0b2734");
  if (back0.every(Boolean)) fillPoly(ctx, back0 as PP[], shade(COL.trailer, 0.85), "#0b2734");
  if (top.every(Boolean)) fillPoly(ctx, top as PP[], shade(COL.trailer, 1), "#0b2734");
}

function drawGuides(
  ctx: CanvasRenderingContext2D,
  camPt: (b: number, l: number, z?: number) => PP | null,
  gs: GameState,
): void {
  const halfTrack = gs.rig.carWidth / 2;
  const invR = Math.tan(gs.delta) / gs.rig.W;
  // In reverse, delta>0 (left) curves the rear toward the vehicle's RIGHT, i.e.
  // toward negative vehicle-left. Quadratic small-angle approximation.
  const leftAt = (d: number): number => -0.5 * d * d * invR;

  const bands = [
    { dist: 1.5, color: COL.guideNear },
    { dist: 3.0, color: COL.guideMid },
    { dist: 5.0, color: COL.guideFar },
  ];

  ctx.lineWidth = 3;
  for (const band of bands) {
    ctx.strokeStyle = band.color;
    for (const side of [-1, 1]) {
      const pts: Array<PP | null> = [];
      for (let i = 0; i <= 14; i++) {
        const d = (band.dist * i) / 14;
        pts.push(camPt(Math.max(NEAR + 0.02, d), leftAt(d) + side * halfTrack));
      }
      polyline(ctx, pts);
    }
    // Cross tick at the band distance.
    const lTick = camPt(band.dist, leftAt(band.dist) + halfTrack);
    const rTick = camPt(band.dist, leftAt(band.dist) - halfTrack);
    if (lTick && rTick) polyline(ctx, [lTick, rTick]);
  }
}

function drawVignette(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const g = ctx.createRadialGradient(
    x + w / 2,
    y + h / 2,
    Math.min(w, h) * 0.35,
    x + w / 2,
    y + h / 2,
    Math.max(w, h) * 0.75,
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
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
  ctx.fillStyle = COL.sky;
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

function frameAndLabel(ctx: CanvasRenderingContext2D, layout: BackupCamLayout, label: string): void {
  const { x, y, w, h } = layout;
  ctx.save();
  ctx.strokeStyle = COL.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = COL.label;
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillText(label, x + 6, y + h - 5);
  ctx.restore();
}

/** Multiply a hex color toward black by factor k (0..1). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
