import type { PhysicsDerived } from "../core/types";
import type { Vec2 } from "../core/vec";
import type { GameState } from "../game/state";
import { type CamPose, drawPerspectiveScene, frameLabel } from "./perspective";

export interface MirrorLayout {
  wCss: number;
  hCss: number;
  dpr: number;
  paneHeight?: number; // CSS px height of the strip (default 110)
  margin?: number; // CSS px gap between/around panes (default 8)
}

interface PaneSpec {
  label: string;
  forward: number; // m ahead of the rear axle for the eye
  lateral: number; // m to the vehicle-left for the eye (negative = right)
  yaw: number; // added to the rearward look (rad); - looks toward the left
  height: number;
}

/**
 * Three small mirror panes across the top: left, rear, right. Each is a perspective
 * camera from that mirror's vantage, looking rearward (and outward for the side
 * mirrors), horizontally mirrored like a real reflection.
 */
export function drawMirrorStrip(
  ctx: CanvasRenderingContext2D,
  gs: GameState,
  derived: PhysicsDerived,
  layout: MirrorLayout,
): void {
  const paneH = layout.paneHeight ?? 110;
  const margin = layout.margin ?? 8;
  const halfW = gs.rig.carWidth / 2;

  const specs: PaneSpec[] = [
    { label: "Left mirror", forward: 1.2, lateral: halfW + 0.15, yaw: -0.4, height: 1.1 },
    { label: "Rear", forward: 0.3, lateral: 0, yaw: 0, height: 1.4 },
    { label: "Right mirror", forward: 1.2, lateral: -(halfW + 0.15), yaw: 0.4, height: 1.1 },
  ];
  const paneW = (layout.wCss - margin * (specs.length + 1)) / specs.length;

  const H = gs.physics.carHeading;
  const fwd: Vec2 = { x: Math.cos(H), y: Math.sin(H) };
  const left: Vec2 = { x: -Math.sin(H), y: Math.cos(H) };

  specs.forEach((s, i) => {
    const px = margin + i * (paneW + margin);
    const py = margin;
    const eye: Vec2 = {
      x: gs.physics.x + s.forward * fwd.x + s.lateral * left.x,
      y: gs.physics.y + s.forward * fwd.y + s.lateral * left.y,
    };
    const pose: CamPose = {
      eye,
      lookH: H + Math.PI + s.yaw,
      height: s.height,
      focalH: paneW * 0.72,
      focalV: paneH * 1.15,
      pane: { x: px, y: py, w: paneW, h: paneH },
      horizonY: py + paneH * 0.36,
      mirrored: true,
    };
    drawPerspectiveScene(ctx, pose, gs, derived, { guides: false, grid: true });
    frameLabel(ctx, pose.pane, s.label);
  });
}
