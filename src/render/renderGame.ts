import { derive } from "../core/physics";
import { commandedSpeed } from "../game/loop";
import type { GameState } from "../game/state";
import { fitBounds } from "./camera";
import { drawTopDown } from "./viewTopDown";
import { drawBackupCam } from "./viewBackupCam";
import { drawMirrorStrip } from "./viewMirrors";
import { drawOverlays } from "./overlays";

export type ViewMode = "topdown" | "backupcam";

export interface RenderOptions {
  mirrors: boolean;
  showGhost: boolean;
  showGuides: boolean;
}

const BG = "#1b1f24";
const MIRROR_STRIP_H = 110;
const MIRROR_MARGIN = 8;

/**
 * SINGLE per-frame entry point. The caller has sized the canvas backing store to
 * wCss*dpr x hCss*dpr; we set the transform so all drawing is in CSS px and crisp.
 */
export function renderGame(
  ctx: CanvasRenderingContext2D,
  wCss: number,
  hCss: number,
  dpr: number,
  gs: GameState,
  view: ViewMode,
  opts: RenderOptions,
): void {
  // Crispness: map 1 CSS px -> dpr device px, no sub-pixel smear.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Clear.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, wCss, hCss);

  const derived = derive(gs.physics, gs.rig, { v: commandedSpeed(gs), delta: gs.delta });

  const cam = fitBounds(gs.scenario.worldBounds, wCss, hCss, dpr);

  if (view === "topdown") {
    drawTopDown(ctx, cam, gs, derived);
    drawOverlays(ctx, cam, gs, derived, { showGhost: opts.showGhost, showGuides: opts.showGuides });
  } else {
    // Backup-cam view fills the canvas (minus the mirror strip if shown).
    const top = opts.mirrors ? MIRROR_STRIP_H + MIRROR_MARGIN * 2 : 0;
    drawBackupCam(ctx, gs, derived, {
      x: 0,
      y: top,
      w: wCss,
      h: hCss - top,
      dpr,
      showGuides: opts.showGuides,
    });
    // Jackknife glow still framed on the full canvas via overlays (no ghost in cam).
    drawOverlays(ctx, cam, gs, derived, { showGhost: false, showGuides: false });
  }

  if (opts.mirrors) {
    drawMirrorStrip(ctx, gs, derived, {
      wCss,
      hCss,
      dpr,
      paneHeight: MIRROR_STRIP_H,
      margin: MIRROR_MARGIN,
    });
  }
}
