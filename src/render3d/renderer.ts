import * as THREE from "three";
import { derive } from "../core/physics";
import { predictTailPath } from "../core/predict";
import { commandedSpeed } from "../game/loop";
import type { GameState } from "../game/state";
import { worldToThree } from "./coords";
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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#0e1217");
  // No scene fog: it ruins the top-down (camera is ~40 m up). The backup-cam reads
  // fine without it. A subtle ground-level haze can come back per-camera later.

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


  const topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 500);
  const backCam = new THREE.PerspectiveCamera(86, 1, 0.05, 220);
  const mirrorCams = [0, 1, 2].map(() => new THREE.PerspectiveCamera(72, 1, 0.05, 220));

  let W = 1;
  let Hc = 1;

  function resize(wCss: number, hCss: number, dpr: number): void {
    W = wCss;
    Hc = hCss;
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

  // Meters shown along the screen's LONG axis. Follows the action rather than
  // trying to frame the entire (wide) street, so it fills a portrait screen.
  const TOP_VIEW_M = 34;
  // A gentle tilt off straight-down so the 3D depth reads, while the maneuver
  // geometry stays clear (looking slightly from the south toward the driveway).
  const TILT = 0.42; // rad (~24 deg from vertical)

  function aimTopCam(g: GameState): void {
    const t = g.scenario.target;
    const fx = (g.physics.x + t.x) / 2; // focus between the rig and the target
    const fy = (g.physics.y + t.y) / 2;
    const aspect = W / Hc;
    let hw: number;
    let hh: number;
    if (aspect >= 1) {
      hw = TOP_VIEW_M / 2;
      hh = hw / aspect;
    } else {
      hh = TOP_VIEW_M / 2;
      hw = hh * aspect;
    }
    // Tilt foreshortens the ground vertically; widen the frustum to compensate.
    hh /= Math.cos(TILT);
    topCam.left = -hw;
    topCam.right = hw;
    topCam.top = hh;
    topCam.bottom = -hh;
    const H = 70;
    const south = H * Math.tan(TILT); // pull the eye toward the south (world -y)
    topCam.position.set(fx, H, -fy + south);
    topCam.up.set(0, 1, 0);
    topCam.lookAt(fx, 0, -fy);
    topCam.updateProjectionMatrix();
  }

  function aimBackCam(g: GameState): void {
    const H = g.physics.carHeading;
    const rearDist = g.rig.carLength - g.rig.carFrontOverhang;
    const ex = g.physics.x - rearDist * Math.cos(H);
    const ey = g.physics.y - rearDist * Math.sin(H);
    backCam.aspect = W / Hc;
    // Mounted high (like a tailgate/roof cam) and angled down to see OVER the low
    // load to the ground and guide path behind.
    backCam.position.set(ex, 1.75, -ey);
    backCam.up.set(0, 1, 0);
    const look = 4; // meters back, at ground level
    backCam.lookAt(ex - look * Math.cos(H), 0.0, -(ey - look * Math.sin(H)));
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
      // CSS px (Three multiplies by pixelRatio internally). WebGL y is bottom-up.
      const vx = px;
      const vy = Hc - (MIRROR_MARGIN + MIRROR_H);
      renderer.setViewport(vx, vy, paneW, MIRROR_H);
      renderer.setScissor(vx, vy, paneW, MIRROR_H);
      aimMirrorCam(mirrorCams[i], g, s, paneW / MIRROR_H);
      renderer.render(scene, mirrorCams[i]);
    });
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, Hc);
  }

  function render(g: GameState, view: ViewMode, opts: RenderOptions): void {
    rig.update(g, derive(g.physics, g.rig, { v: commandedSpeed(g), delta: g.delta }));
    updateGhost(g, opts);

    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, W, Hc);
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
