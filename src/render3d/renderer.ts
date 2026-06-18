import * as THREE from "three";
import { derive } from "../core/physics";
import { predictTailPath } from "../core/predict";
import { commandedSpeed } from "../game/loop";
import type { GameState } from "../game/state";
import { TOPDOWN_UP, worldToThree } from "./coords";
import { buildWorld } from "./world";
import { buildRig, type RigView } from "./rig";

export type ViewMode = "topdown" | "backupcam";

export interface RenderOptions {
  mirrors: boolean;
  showGhost: boolean;
  showGuides: boolean;
}

export interface Renderer3D {
  render(gs: GameState, view: ViewMode, opts: RenderOptions): void;
  resize(wCss: number, hCss: number, dpr: number): void;
}

interface MirrorSpec {
  forward: number;
  lateral: number;
  yaw: number;
  height: number;
}

const MIRROR_H = 110; // CSS px
const MIRROR_MARGIN = 8;

export function createRenderer3d(canvas: HTMLCanvasElement, gs: GameState): Renderer3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0e1217");
  scene.fog = new THREE.Fog("#0e1217", 24, 70);

  scene.add(buildWorld(gs));
  const rig: RigView = buildRig(gs);
  scene.add(rig.group);

  // Mirrored cameras flip winding; make every material double-sided so nothing
  // disappears in the backup-cam / mirror views.
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => (m.side = THREE.DoubleSide));
  });

  // Ghost path (trailer-tail prediction) as a line just above the ground.
  const ghostGeom = new THREE.BufferGeometry();
  const ghost = new THREE.Line(ghostGeom, new THREE.LineBasicMaterial({ color: 0x4cc2ff }));
  ghost.frustumCulled = false;
  scene.add(ghost);

  const topCam = new THREE.PerspectiveCamera(50, 1, 0.1, 220);
  const backCam = new THREE.PerspectiveCamera(86, 1, 0.05, 220);
  const mirrorCams = [0, 1, 2].map(() => new THREE.PerspectiveCamera(72, 1, 0.05, 220));

  let W = 1;
  let Hc = 1;
  let DPR = 1;

  function resize(wCss: number, hCss: number, dpr: number): void {
    W = wCss;
    Hc = hCss;
    DPR = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(wCss, hCss, false);
  }

  function mirror(cam: THREE.PerspectiveCamera): void {
    cam.updateProjectionMatrix();
    cam.projectionMatrix.elements[0] *= -1; // horizontal flip => mirror image
  }

  function updateGhost(g: GameState, opts: RenderOptions): void {
    if (!opts.showGhost) {
      ghost.visible = false;
      return;
    }
    const live = commandedSpeed(g);
    const moving = Math.abs(live) > 1e-3;
    const cmd = moving
      ? { v: live, delta: g.delta }
      : { v: -g.difficulty.maxReverseSpeed, delta: g.targetDelta };
    const pts = predictTailPath(g.physics, g.rig, cmd, g.difficulty.ghostHorizon);
    const arr = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => {
      const v = worldToThree(p, 0.08);
      arr[i * 3] = v.x;
      arr[i * 3 + 1] = v.y;
      arr[i * 3 + 2] = v.z;
    });
    ghostGeom.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    ghost.visible = pts.length > 1;
  }

  function aimTopCam(g: GameState): void {
    const b = g.scenario.worldBounds;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const span = Math.max(b.maxX - b.minX, b.maxY - b.minY);
    topCam.aspect = W / Hc;
    topCam.position.set(cx, span * 1.1, -cy);
    topCam.up.copy(TOPDOWN_UP);
    topCam.lookAt(cx, 0, -cy);
    topCam.updateProjectionMatrix();
  }

  function aimBackCam(g: GameState): void {
    const H = g.physics.carHeading;
    const rearDist = g.rig.carLength - g.rig.carFrontOverhang;
    const ex = g.physics.x - rearDist * Math.cos(H);
    const ey = g.physics.y - rearDist * Math.sin(H);
    backCam.aspect = W / Hc;
    backCam.position.set(ex, 1.05, -ey);
    backCam.up.set(0, 1, 0);
    backCam.lookAt(ex - Math.cos(H), 0.55, -(ey - Math.sin(H)));
    mirror(backCam);
  }

  function aimMirrorCam(
    cam: THREE.PerspectiveCamera,
    g: GameState,
    s: MirrorSpec,
    aspect: number,
  ): void {
    const H = g.physics.carHeading;
    const fwd = { x: Math.cos(H), y: Math.sin(H) };
    const left = { x: -Math.sin(H), y: Math.cos(H) };
    const ex = g.physics.x + s.forward * fwd.x + s.lateral * left.x;
    const ey = g.physics.y + s.forward * fwd.y + s.lateral * left.y;
    const look = H + Math.PI + s.yaw;
    cam.aspect = aspect;
    cam.position.set(ex, s.height, -ey);
    cam.up.set(0, 1, 0);
    cam.lookAt(ex + Math.cos(look), s.height - 0.4, -(ey + Math.sin(look)));
    mirror(cam);
  }

  function renderMirrors(g: GameState): void {
    const halfW = g.rig.carWidth / 2;
    const specs: MirrorSpec[] = [
      { forward: 1.2, lateral: halfW + 0.15, yaw: -0.4, height: 1.1 },
      { forward: 0.3, lateral: 0, yaw: 0, height: 1.4 },
      { forward: 1.2, lateral: -(halfW + 0.15), yaw: 0.4, height: 1.1 },
    ];
    const paneW = (W - MIRROR_MARGIN * 4) / 3;
    renderer.setScissorTest(true);
    specs.forEach((s, i) => {
      const px = MIRROR_MARGIN + i * (paneW + MIRROR_MARGIN);
      const vx = px * DPR;
      const vy = (Hc - (MIRROR_MARGIN + MIRROR_H)) * DPR;
      const vw = paneW * DPR;
      const vh = MIRROR_H * DPR;
      renderer.setViewport(vx, vy, vw, vh);
      renderer.setScissor(vx, vy, vw, vh);
      aimMirrorCam(mirrorCams[i], g, s, paneW / MIRROR_H);
      renderer.render(scene, mirrorCams[i]);
    });
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W * DPR, Hc * DPR);
  }

  function render(g: GameState, view: ViewMode, opts: RenderOptions): void {
    rig.update(g, derive(g.physics, g.rig, { v: commandedSpeed(g), delta: g.delta }));
    updateGhost(g, opts);

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W * DPR, Hc * DPR);
    if (view === "topdown") {
      aimTopCam(g);
      renderer.render(scene, topCam);
    } else {
      aimBackCam(g);
      renderer.render(scene, backCam);
    }
    if (opts.mirrors) renderMirrors(g);
  }

  return { render, resize };
}
