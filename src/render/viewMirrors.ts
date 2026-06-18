import type { PhysicsDerived } from "../core/types";
import type { Vec2 } from "../core/vec";
import type { GameState } from "../game/state";
import type { Camera } from "./camera";
import { drawWorldInto } from "./drawWorld";

export interface MirrorLayout {
  wCss: number;
  hCss: number;
  dpr: number;
  paneHeight?: number; // CSS px height of the strip (default 110)
  margin?: number; // CSS px gap between/around panes (default 8)
}

const COL = {
  paneBg: "#10141a",
  border: "#3a4250",
  label: "#9aa6b2",
};

interface Pane {
  label: string;
  // World offset of the mirror eyepoint relative to the car rear axle, in the
  // car frame (forward, left). Mirrors look REARWARD so we yaw the camera 180deg.
  yaw: number; // additional yaw applied to the rearward look (rad)
  lateral: number; // meters left(+)/right(-) the eye sits, for L/R mirrors
}

/**
 * A strip of three small mirror panes (rear, left, right) along the TOP of the
 * canvas. Each pane is a clipped, horizontally FLIPPED camera looking rearward
 * from the car with a simple linear depth shrink (no perspective, no fisheye).
 */
export function drawMirrorStrip(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  derived: PhysicsDerived,
  layout: MirrorLayout,
): void {
  const paneH = layout.paneHeight ?? 110;
  const margin = layout.margin ?? 8;
  const panes: Pane[] = [
    { label: "Left mirror", yaw: 0.5, lateral: gs.rig.carWidth / 2 },
    { label: "Rear", yaw: 0, lateral: 0 },
    { label: "Right mirror", yaw: -0.5, lateral: -gs.rig.carWidth / 2 },
  ];
  const paneW = (layout.wCss - margin * (panes.length + 1)) / panes.length;

  panes.forEach((pane, i) => {
    const px = margin + i * (paneW + margin);
    const py = margin;
    drawPane(ctx, gs, derived, pane, px, py, paneW, paneH, layout.dpr);
  });
}

function drawPane(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  derived: PhysicsDerived,
  pane: Pane,
  px: number,
  py: number,
  pw: number,
  ph: number,
  dpr: number,
): void {
  const { physics } = gs;
  ctx.save();

  // Clip + background + border.
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  ctx.fillStyle = COL.paneBg;
  ctx.fillRect(px, py, pw, ph);

  // The mirror looks rearward: camera forward axis = car rear (carHeading+pi),
  // plus the small per-mirror yaw. We render the world in a rotated/flipped frame.
  const lookHeading = physics.carHeading + Math.PI + pane.yaw;

  // Eyepoint: at the car rear axle, offset laterally for the side mirrors.
  const lx = -Math.sin(physics.carHeading); // car LEFT unit (+y world)
  const ly = Math.cos(physics.carHeading);
  const eye: Vec2 = {
    x: physics.x + pane.lateral * lx,
    y: physics.y + pane.lateral * ly,
  };

  // Build a flat camera centered on a point a few meters down the look direction,
  // so the visible chunk of world is "behind" the car. Mirrors reverse L/R, hence
  // the horizontal flip below. Linear depth shrink: things farther down-view get
  // smaller, faked by a mild vertical compression toward the top of the pane.
  const viewDepth = 9; // meters of rearward world shown
  const center: Vec2 = {
    x: eye.x + (viewDepth / 2) * Math.cos(lookHeading),
    y: eye.y + (viewDepth / 2) * Math.sin(lookHeading),
  };
  const pxPerMeter = ph / viewDepth;

  // Transform the context so that, in pane-local space, +x(world rotated) runs
  // right and the look direction runs UP the pane. We rotate world by -lookHeading
  // (so look dir -> +x), then map that +x to screen "up", and FLIP horizontally.
  // Implement via a camera whose own y-flip + a manual rotation matrix.
  const cam: Camera = {
    centerX: 0,
    centerY: 0,
    pxPerMeter,
    wCss: pw,
    hCss: ph,
    dpr,
  };

  // Compose: translate to pane center, flip X (mirror), then rotate world so the
  // look direction points up the pane, then translate world to the eye-relative
  // frame. We pre-rotate points into the camera frame ourselves by feeding a
  // transformed ctx and letting drawWorldInto use an axis-aligned camera at the
  // rotated center.
  // Transform chain: center the pane, FLIP horizontally (mirrors reverse L/R),
  // then rotate so the world look direction points UP the pane. With the flip
  // applied first, the required rotation is exactly (lookHeading - pi/2) (solved
  // numerically against the camera's own y-flip). Finally shift the camera-local
  // origin to the pane's top-left so worldToScreen's pw/2,ph/2 centering lands right.
  ctx.translate(px + pw / 2, py + ph / 2);
  ctx.scale(-1, 1); // horizontal flip: mirrors reverse left/right
  ctx.rotate(lookHeading - Math.PI / 2);
  ctx.translate(-pw / 2, -ph / 2);

  // Now draw the world with a camera centered on `center`; the ctx rotation makes
  // the look direction point up the pane and the flip mirrors L/R.
  drawWorldInto(ctx, { ...cam, centerX: center.x, centerY: center.y }, gs, derived, {
    grid: false,
  });

  ctx.restore();

  // Mild linear depth shrink: fade a gradient toward the far (top) edge so depth
  // reads without faking perspective geometry.
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, pw, ph);
  ctx.clip();
  const grad = ctx.createLinearGradient(0, py, 0, py + ph);
  grad.addColorStop(0, "rgba(16,20,26,0.55)");
  grad.addColorStop(1, "rgba(16,20,26,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(px, py, pw, ph);
  ctx.restore();

  // Border + label (drawn unclipped, on top).
  ctx.save();
  ctx.strokeStyle = COL.border;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  ctx.fillStyle = COL.label;
  ctx.font = "11px -apple-system, system-ui, sans-serif";
  ctx.textBaseline = "bottom";
  ctx.fillText(pane.label, px + 6, py + ph - 5);
  ctx.restore();
}
