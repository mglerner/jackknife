import type { PhysicsDerived } from "../core/types";
import type { Vec2 } from "../core/vec";
import type { GameState } from "../game/state";

/** A camera looking out over the ground plane (rear bumper, mirrors, etc.). */
export interface CamPose {
  eye: Vec2;
  lookH: number; // world heading the optical axis points along
  height: number; // camera height above the ground (m)
  focalH: number;
  focalV: number;
  pane: { x: number; y: number; w: number; h: number };
  horizonY: number;
  mirrored: boolean; // flip horizontally (real reversing camera / mirror)
}

export interface SceneOpts {
  guides?: boolean; // draw the car's rear-path guide lines
  grid?: boolean; // draw the ground grid (default true)
}

interface PP {
  x: number;
  y: number;
}

const NEAR = 0.35;
const WALL_H = 1.2;
const DECK_H = 0.35; // low open utility-trailer deck height

/** Yard-tool cargo, placed along the trailer centerline (local along/lateral, m). */
const CARGO = [
  { along: 0.45, lat: 0.12, hl: 0.28, hw: 0.3, h: 0.5, col: "#7a5a2e" }, // mulch/soil bag
  { along: -0.25, lat: -0.22, hl: 0.22, hw: 0.18, h: 0.42, col: "#8a9098" }, // tool box
  { along: -0.6, lat: 0.24, hl: 0.18, hw: 0.16, h: 0.34, col: "#3f7a45" }, // bin
];

const COL = {
  sky: "#0a0d11",
  groundNear: "#23282f",
  groundFar: "#161b21",
  grid: "rgba(255,255,255,0.06)",
  border: "#3a4250",
  label: "#9aa6b2",
  wall: "#39424f",
  wallTop: "#4a5663",
  curb: "rgba(154,166,178,0.5)",
  target: "#5ad17a",
  trailer: "#4cc2ff",
  guideNear: "#5ad17a",
  guideMid: "#f2c14e",
  guideFar: "#ef6f6c",
};

/** Project a world ground point (optionally at height z) into the pane. */
export function projectGround(pose: CamPose, p: Vec2, z = 0): PP | null {
  const dx = p.x - pose.eye.x;
  const dy = p.y - pose.eye.y;
  const cosL = Math.cos(pose.lookH);
  const sinL = Math.sin(pose.lookH);
  const forward = dx * cosL + dy * sinL;
  if (forward <= NEAR) return null;
  const right = dx * sinL - dy * cosL; // component along (sinL, -cosL)
  const m = pose.mirrored ? -1 : 1;
  return {
    x: pose.pane.x + pose.pane.w / 2 + m * pose.focalH * (right / forward),
    y: pose.horizonY + pose.focalV * ((pose.height - z) / forward),
  };
}

/** Render the world from a camera pose: ground, grid, target, walls, trailer. */
export function drawPerspectiveScene(
  ctx: CanvasRenderingContext2D,
  pose: CamPose,
  gs: GameState,
  derived: PhysicsDerived,
  opts: SceneOpts = {},
): void {
  const { x, y, w, h } = pose.pane;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();

  drawBackground(ctx, pose);
  if (opts.grid !== false) drawWorldGrid(ctx, pose, gs);
  drawTargetBox(ctx, pose, gs);
  drawObstacles(ctx, pose, gs);
  drawTrailer(ctx, pose, gs, derived);
  if (opts.guides) drawGuides(ctx, pose, gs);
  drawVignette(ctx, pose);

  ctx.restore();
}

/** Frame + corner label for a pane. */
export function frameLabel(
  ctx: CanvasRenderingContext2D,
  pane: { x: number; y: number; w: number; h: number },
  label: string,
): void {
  ctx.save();
  ctx.strokeStyle = COL.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pane.x + 0.5, pane.y + 0.5, pane.w - 1, pane.h - 1);
  ctx.fillStyle = COL.label;
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  ctx.fillText(label, pane.x + 6, pane.y + pane.h - 5);
  ctx.restore();
}

// --- internals ---------------------------------------------------------------

function drawBackground(ctx: CanvasRenderingContext2D, pose: CamPose): void {
  const { x, y, w, h } = pose.pane;
  ctx.fillStyle = COL.sky;
  ctx.fillRect(x, y, w, pose.horizonY - y);
  const g = ctx.createLinearGradient(0, pose.horizonY, 0, y + h);
  g.addColorStop(0, COL.groundFar);
  g.addColorStop(1, COL.groundNear);
  ctx.fillStyle = g;
  ctx.fillRect(x, pose.horizonY, w, y + h - pose.horizonY);
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

function drawWorldGrid(ctx: CanvasRenderingContext2D, pose: CamPose, gs: GameState): void {
  const b = gs.scenario.worldBounds;
  ctx.strokeStyle = COL.grid;
  ctx.lineWidth = 1;
  const step = 3;
  for (let gx = Math.ceil(b.minX / step) * step; gx <= b.maxX; gx += step) {
    const pts: Array<PP | null> = [];
    for (let gy = b.minY; gy <= b.maxY; gy += 0.8) pts.push(projectGround(pose, { x: gx, y: gy }));
    polyline(ctx, pts);
  }
  for (let gy = Math.ceil(b.minY / step) * step; gy <= b.maxY; gy += step) {
    const pts: Array<PP | null> = [];
    for (let gx = b.minX; gx <= b.maxX; gx += 0.8) pts.push(projectGround(pose, { x: gx, y: gy }));
    polyline(ctx, pts);
  }
}

function drawTargetBox(ctx: CanvasRenderingContext2D, pose: CamPose, gs: GameState): void {
  const t = gs.scenario.target;
  const al: Vec2 = { x: Math.cos(t.heading), y: Math.sin(t.heading) };
  const lf: Vec2 = { x: -Math.sin(t.heading), y: Math.cos(t.heading) };
  const corner = (s: number, u: number): Vec2 => ({
    x: t.x + s * t.halfLength * al.x + u * t.halfWidth * lf.x,
    y: t.y + s * t.halfLength * al.y + u * t.halfWidth * lf.y,
  });
  const ring = [corner(1, -1), corner(1, 1), corner(-1, 1), corner(-1, -1)].map((p) =>
    projectGround(pose, p),
  );
  if (ring.some((p) => p === null)) return;
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = COL.target;
  ctx.lineWidth = 2;
  polyline(ctx, [...ring, ring[0]]);
  ctx.restore();
}

function drawObstacles(ctx: CanvasRenderingContext2D, pose: CamPose, gs: GameState): void {
  for (const o of gs.scenario.obstacles) {
    if (o.shape.type !== "segment") continue;
    const a = o.shape.a;
    const bb = o.shape.b;
    if (o.kind === "curb") {
      const a0 = projectGround(pose, a);
      const b0 = projectGround(pose, bb);
      if (a0 && b0) {
        ctx.strokeStyle = COL.curb;
        ctx.lineWidth = 2;
        polyline(ctx, [a0, b0]);
      }
      continue;
    }
    const a0 = projectGround(pose, a, 0);
    const b0 = projectGround(pose, bb, 0);
    const a1 = projectGround(pose, a, WALL_H);
    const b1 = projectGround(pose, bb, WALL_H);
    if (a0 && b0 && a1 && b1) {
      fillPoly(ctx, [a0, b0, b1, a1], COL.wall, "#222831");
      ctx.strokeStyle = COL.wallTop;
      ctx.lineWidth = 2;
      polyline(ctx, [a1, b1]);
    }
  }
}

function drawBox(
  ctx: CanvasRenderingContext2D,
  pose: CamPose,
  foot: Vec2[],
  zBottom: number,
  zTop: number,
  col: string,
): void {
  const sides = [
    [foot[0], foot[1]],
    [foot[1], foot[2]],
    [foot[2], foot[3]],
    [foot[3], foot[0]],
  ];
  sides.forEach((s, i) => {
    const q = [
      projectGround(pose, s[0], zBottom),
      projectGround(pose, s[1], zBottom),
      projectGround(pose, s[1], zTop),
      projectGround(pose, s[0], zTop),
    ];
    if (q.every(Boolean)) fillPoly(ctx, q as PP[], shade(col, 0.55 + 0.12 * (i % 2)), "rgba(0,0,0,0.45)");
  });
  const top = foot.map((p) => projectGround(pose, p, zTop));
  if (top.every(Boolean)) fillPoly(ctx, top as PP[], shade(col, 1), "rgba(0,0,0,0.45)");
}

function drawTrailer(
  ctx: CanvasRenderingContext2D,
  pose: CamPose,
  gs: GameState,
  d: PhysicsDerived,
): void {
  const th = d.trailerHeading;
  const al: Vec2 = { x: Math.cos(th), y: Math.sin(th) };
  const lf: Vec2 = { x: -Math.sin(th), y: Math.cos(th) };
  const hw = gs.rig.trailerWidth / 2;
  const off = (p: Vec2, s: number): Vec2 => ({ x: p.x + s * hw * lf.x, y: p.y + s * hw * lf.y });

  // Low open flatbed deck.
  const deck = [off(d.hitch, 1), off(d.hitch, -1), off(d.trailerTail, -1), off(d.trailerTail, 1)];
  drawBox(ctx, pose, deck, 0, DECK_H, COL.trailer);

  // Yard-tool cargo sitting on the deck.
  const center: Vec2 = {
    x: (d.hitch.x + d.trailerTail.x) / 2,
    y: (d.hitch.y + d.trailerTail.y) / 2,
  };
  for (const c of CARGO) {
    const cc: Vec2 = {
      x: center.x + c.along * al.x + c.lat * lf.x,
      y: center.y + c.along * al.y + c.lat * lf.y,
    };
    const foot = [
      { x: cc.x + c.hl * al.x + c.hw * lf.x, y: cc.y + c.hl * al.y + c.hw * lf.y },
      { x: cc.x + c.hl * al.x - c.hw * lf.x, y: cc.y + c.hl * al.y - c.hw * lf.y },
      { x: cc.x - c.hl * al.x - c.hw * lf.x, y: cc.y - c.hl * al.y - c.hw * lf.y },
      { x: cc.x - c.hl * al.x + c.hw * lf.x, y: cc.y - c.hl * al.y + c.hw * lf.y },
    ];
    drawBox(ctx, pose, foot, DECK_H, DECK_H + c.h, c.col);
  }

  // A long-handled tool (rake/shovel) leaning across the deck.
  const a: Vec2 = { x: center.x - 0.5 * al.x + 0.2 * lf.x, y: center.y - 0.5 * al.y + 0.2 * lf.y };
  const b: Vec2 = { x: center.x + 0.4 * al.x - 0.1 * lf.x, y: center.y + 0.4 * al.y - 0.1 * lf.y };
  const a0 = projectGround(pose, a, DECK_H);
  const b1 = projectGround(pose, b, DECK_H + 0.85);
  if (a0 && b1) {
    ctx.strokeStyle = "#caa46a";
    ctx.lineWidth = 3;
    polyline(ctx, [a0, b1]);
  }
}

function drawGuides(ctx: CanvasRenderingContext2D, pose: CamPose, gs: GameState): void {
  const H = gs.physics.carHeading;
  const fwd: Vec2 = { x: Math.cos(H), y: Math.sin(H) };
  const left: Vec2 = { x: -Math.sin(H), y: Math.cos(H) };
  const rearDist = gs.rig.carLength - gs.rig.carFrontOverhang;
  const bumper: Vec2 = { x: gs.physics.x - rearDist * fwd.x, y: gs.physics.y - rearDist * fwd.y };
  const halfTrack = gs.rig.carWidth / 2;
  const invR = Math.tan(gs.delta) / gs.rig.W;
  const leftAt = (dd: number): number => -0.5 * dd * dd * invR;

  const railPt = (dd: number, side: number): Vec2 => {
    const lat = leftAt(dd) + side * halfTrack;
    return {
      x: bumper.x - dd * fwd.x + lat * left.x,
      y: bumper.y - dd * fwd.y + lat * left.y,
    };
  };

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
      for (let i = 0; i <= 14; i++) pts.push(projectGround(pose, railPt((band.dist * i) / 14, side)));
      polyline(ctx, pts);
    }
    const lTick = projectGround(pose, railPt(band.dist, 1));
    const rTick = projectGround(pose, railPt(band.dist, -1));
    if (lTick && rTick) polyline(ctx, [lTick, rTick]);
  }
}

function drawVignette(ctx: CanvasRenderingContext2D, pose: CamPose): void {
  const { x, y, w, h } = pose.pane;
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
}

/** Multiply a hex color toward black by factor k (0..1). */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}
