import type { PhysicsDerived } from "../core/types";
import type { Vec2 } from "../core/vec";
import type { GameState } from "../game/state";
import type { Obstacle } from "../scenarios/types";
import { type Camera, worldToScreen } from "./camera";

// Dark-theme palette (mirrors styles.css :root vars).
const COL = {
  ground: "#1b1f24",
  grid: "rgba(255,255,255,0.05)",
  wall: "#3a4250",
  curb: "#5a6472",
  cone: "#f2a14e",
  target: "#5ad17a",
  car: "#4cc2ff",
  carRoof: "#2c84b3",
  trailer: "#cdd6e0",
  trailerEdge: "#8b95a3",
  hitch: "#f2c14e",
  ink: "#e8eef5",
};

export interface DrawWorldOpts {
  grid?: boolean;
}

/** Polygon in world coords -> filled/stroked screen polygon. */
function polyWorld(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  pts: Vec2[],
  fill?: string,
  stroke?: string,
  lineWidth = 1.5,
): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = worldToScreen(cam, p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** Oriented rectangle from its CENTER, a heading, and half extents (m). */
function orientedRect(center: Vec2, heading: number, halfLen: number, halfWid: number): Vec2[] {
  const fx = Math.cos(heading);
  const fy = Math.sin(heading);
  const lx = -Math.sin(heading); // +y world (LEFT) unit
  const ly = Math.cos(heading);
  const corner = (sl: number, sw: number): Vec2 => ({
    x: center.x + sl * halfLen * fx + sw * halfWid * lx,
    y: center.y + sl * halfLen * fy + sw * halfWid * ly,
  });
  return [corner(1, 1), corner(1, -1), corner(-1, -1), corner(-1, 1)];
}

function drawObstacle(ctx: CanvasRenderingContext2D, cam: Camera, o: Obstacle): void {
  const fill = o.kind === "cone" ? COL.cone : o.kind === "curb" ? COL.curb : COL.wall;
  const sh = o.shape;
  if (sh.type === "rect") {
    polyWorld(ctx, cam, orientedRect({ x: sh.x, y: sh.y }, sh.rot, sh.w / 2, sh.h / 2), fill, fill, 1);
  } else if (sh.type === "circle") {
    const c = worldToScreen(cam, { x: sh.x, y: sh.y });
    ctx.beginPath();
    ctx.arc(c.x, c.y, sh.r * cam.pxPerMeter, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  } else {
    const a = worldToScreen(cam, sh.a);
    const b = worldToScreen(cam, sh.b);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = fill;
    ctx.lineWidth = Math.max(2, 0.25 * cam.pxPerMeter);
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.lineCap = "butt";
  }
}

/**
 * Draw the full world (obstacles, target, car, trailer, hitch link) into `ctx`
 * using camera `cam`. Reused by both god's-eye and the mirror/backup panes.
 */
export function drawWorldInto(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  gs: GameState,
  derived: PhysicsDerived,
  opts: DrawWorldOpts = {},
): void {
  const { rig, scenario, physics } = gs;

  if (opts.grid) drawGrid(ctx, cam, scenario.worldBounds);

  // Obstacles.
  for (const o of scenario.obstacles) drawObstacle(ctx, cam, o);

  // Target box: dashed outline + desired-heading tick.
  drawTarget(ctx, cam, scenario.target);

  // Car body: rear axle at physics (x,y). Front bumper carFrontOverhang ahead;
  // rear bumper (carLength - carFrontOverhang) behind. Center is the midpoint.
  const ch = physics.carHeading;
  const frontDist = rig.carFrontOverhang;
  const rearDist = rig.carLength - rig.carFrontOverhang;
  const carCenter: Vec2 = {
    x: physics.x + ((frontDist - rearDist) / 2) * Math.cos(ch),
    y: physics.y + ((frontDist - rearDist) / 2) * Math.sin(ch),
  };
  const carRect = orientedRect(carCenter, ch, rig.carLength / 2, rig.carWidth / 2);
  polyWorld(ctx, cam, carRect, COL.car, COL.carRoof, 2);
  drawHeadingNotch(ctx, cam, carRect);

  // Trailer body: spans hitch -> tail along trailerHeading.
  const th = derived.trailerHeading;
  const trailerCenter: Vec2 = {
    x: (derived.hitch.x + derived.trailerTail.x) / 2,
    y: (derived.hitch.y + derived.trailerTail.y) / 2,
  };
  const trailerHalfLen =
    Math.hypot(
      derived.trailerTail.x - derived.hitch.x,
      derived.trailerTail.y - derived.hitch.y,
    ) / 2;
  const trailerRect = orientedRect(trailerCenter, th, trailerHalfLen, rig.trailerWidth / 2);
  polyWorld(ctx, cam, trailerRect, COL.trailer, COL.trailerEdge, 2);

  // Hitch link: car rear-axle -> hitch ball -> trailer (trailerAxle direction).
  const rear = worldToScreen(cam, { x: physics.x, y: physics.y });
  const ball = worldToScreen(cam, derived.hitch);
  const tAxle = worldToScreen(cam, derived.trailerAxle);
  ctx.beginPath();
  ctx.moveTo(rear.x, rear.y);
  ctx.lineTo(ball.x, ball.y);
  ctx.lineTo(tAxle.x, tAxle.y);
  ctx.strokeStyle = COL.hitch;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Ball marker.
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, Math.max(2.5, 0.12 * cam.pxPerMeter), 0, Math.PI * 2);
  ctx.fillStyle = COL.hitch;
  ctx.fill();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  b: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  ctx.strokeStyle = COL.grid;
  ctx.lineWidth = 1;
  const step = 1; // 1 m grid
  for (let x = Math.ceil(b.minX); x <= b.maxX; x += step) {
    const a = worldToScreen(cam, { x, y: b.minY });
    const c = worldToScreen(cam, { x, y: b.maxY });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
  for (let y = Math.ceil(b.minY); y <= b.maxY; y += step) {
    const a = worldToScreen(cam, { x: b.minX, y });
    const c = worldToScreen(cam, { x: b.maxX, y });
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(c.x, c.y);
    ctx.stroke();
  }
}

function drawTarget(
  ctx: CanvasRenderingContext2D,
  cam: Camera,
  t: { x: number; y: number; heading: number; halfWidth: number; halfLength: number },
): void {
  const rect = orientedRect({ x: t.x, y: t.y }, t.heading, t.halfLength, t.halfWidth);
  ctx.save();
  ctx.setLineDash([8, 6]);
  polyWorld(ctx, cam, rect, undefined, COL.target, 2);
  ctx.setLineDash([]);
  // Desired-heading tick: from center forward along heading.
  const c = worldToScreen(cam, { x: t.x, y: t.y });
  const tip = worldToScreen(cam, {
    x: t.x + t.halfLength * Math.cos(t.heading),
    y: t.y + t.halfLength * Math.sin(t.heading),
  });
  ctx.beginPath();
  ctx.moveTo(c.x, c.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.strokeStyle = COL.target;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

/** Small triangle on the car's front edge to show which way is forward. */
function drawHeadingNotch(ctx: CanvasRenderingContext2D, cam: Camera, rect: Vec2[]): void {
  // rect[0],rect[1] are the two FRONT corners; their midpoint is front-center.
  const f0 = worldToScreen(cam, rect[0]);
  const f1 = worldToScreen(cam, rect[1]);
  const mid = { x: (f0.x + f1.x) / 2, y: (f0.y + f1.y) / 2 };
  ctx.beginPath();
  ctx.arc(mid.x, mid.y, 3, 0, Math.PI * 2);
  ctx.fillStyle = COL.ink;
  ctx.fill();
}
