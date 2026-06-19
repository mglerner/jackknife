import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { derive } from "../core/physics";
import { predictTailPath } from "../core/predict";
import { commandedSpeed } from "../game/loop";
import type { GameState } from "../game/state";
import { worldToThree, placeObject } from "./coords";
import { buildWorld } from "./world";
import { createParticles } from "./particles";
import { buildRig, type RigView, type CarStyle } from "./rig";

export type ViewMode = "topdown" | "backupcam";

export interface RenderOptions {
  mirrors: boolean;
  showGhost: boolean;
  showGuides: boolean;
}

export interface Renderer3D {
  render(gs: GameState, view: ViewMode, opts: RenderOptions): void;
  resize(wCss: number, hCss: number, dpr: number): void;
  setCarStyle(style: CarStyle): void;
  /** Multiply the top-down zoom (pinch). Clamped to a sensible range. */
  nudgeTopZoom(factor: number): void;
  /** Swap the world + rig for a new game (rig or scenario change). */
  rebuild(gs: GameState): void;
}

interface MirrorSpec {
  forward: number;
  lateral: number;
  yaw: number;
  height: number;
  lookDist: number; // meters back the camera aims
  lookY: number; // height of the aim point (low = pitched down)
}

const MIRROR_H = 110; // CSS px
const MIRROR_MARGIN = 8;

/**
 * Reversing guide lines (distance bands) projected on the ground behind the
 * trailer, like a real backup camera. Built in the trailer's local frame: local
 * -X runs backward (the way the tail goes in reverse).
 */
function buildBackupGuides(gs: GameState): THREE.Group {
  const grp = new THREE.Group();
  const hw = gs.rig.trailerWidth / 2 + 0.08;
  const rail = (z: number): THREE.Mesh => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.03, 0.07),
      new THREE.MeshBasicMaterial({ color: 0xeaeef2 }),
    );
    m.position.set(-2.6, 0, z);
    return m;
  };
  grp.add(rail(hw), rail(-hw));
  const band = (x: number, color: number): THREE.Mesh => {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.03, hw * 2),
      new THREE.MeshBasicMaterial({ color }),
    );
    m.position.set(x, 0, 0);
    return m;
  };
  grp.add(band(-1.2, 0xff4d4d), band(-2.8, 0xffd23f), band(-4.4, 0x57d977));
  return grp;
}

export function createRenderer3d(canvas: HTMLCanvasElement, gs: GameState): Renderer3D {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#aebfce");
  // Environment map: real reflections for metallic paint and glass. Without it,
  // metal reflects the (near-black) background and looks dark; this is what makes
  // the silver read as actual car paint in-game, not a grey box.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  // Dial the env contribution so it adds reflections without washing out every
  // (mostly matte) world material.
  scene.environmentIntensity = 0.5;
  // No scene fog: it ruins the top-down (camera is ~40 m up). The backup-cam reads
  // fine without it. A subtle ground-level haze can come back per-camera later.

  let world = buildWorld(gs);
  scene.add(world);
  let rig: RigView = buildRig(gs);
  scene.add(rig.group);
  let guides = buildBackupGuides(gs);
  guides.visible = false;
  scene.add(guides);

  // Swap the world + rig for a new game (rig / scenario change). Old groups are
  // disposed to free GPU memory.
  function disposeGroup(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
  function rebuild(g: GameState): void {
    scene.remove(world);
    disposeGroup(world);
    world = buildWorld(g);
    scene.add(world);
    scene.remove(rig.group);
    disposeGroup(rig.group);
    rig = buildRig(g);
    scene.add(rig.group);
    scene.remove(guides);
    disposeGroup(guides);
    guides = buildBackupGuides(g);
    scene.add(guides);
  }

  // Particle juice: dust at the wheels when moving, exhaust at the tailpipe.
  const particles = createParticles(scene);
  let lastT = performance.now();
  let exhaustAcc = 0;
  let shake = 0; // brief camera shake on a new wall contact
  let prevContacts = 0;

  // Mirrored cameras flip winding; make every material double-sided so nothing
  // disappears in the backup-cam / mirror views.
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => (m.side = THREE.DoubleSide));
  });

  // Ghost path: a translucent ribbon on the ground (the trailer's predicted route),
  // so it reads as an intentional guide corridor rather than a stray thin line.
  const ghostGeom = new THREE.BufferGeometry();
  const ghost = new THREE.Mesh(
    ghostGeom,
    new THREE.MeshBasicMaterial({
      color: 0x5fd0ff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
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
    if (pts.length < 2) {
      ghost.visible = false;
      return;
    }
    // Build a ribbon of the trailer's width following the predicted path.
    const hw = g.rig.trailerWidth / 2;
    const n = pts.length;
    const verts = new Float32Array(n * 2 * 3);
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const c = pts[Math.min(n - 1, i + 1)];
      let dx = c.x - a.x;
      let dy = c.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const px = -dy * hw; // perpendicular offset by half the trailer width
      const py = dx * hw;
      const left = worldToThree({ x: pts[i].x + px, y: pts[i].y + py }, 0.08);
      const right = worldToThree({ x: pts[i].x - px, y: pts[i].y - py }, 0.08);
      verts[i * 6] = left.x;
      verts[i * 6 + 1] = left.y;
      verts[i * 6 + 2] = left.z;
      verts[i * 6 + 3] = right.x;
      verts[i * 6 + 4] = right.y;
      verts[i * 6 + 5] = right.z;
    }
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const l0 = i * 2;
      const r0 = i * 2 + 1;
      const l1 = (i + 1) * 2;
      const r1 = (i + 1) * 2 + 1;
      idx.push(l0, r0, l1, r0, r1, l1);
    }
    ghostGeom.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    ghostGeom.setIndex(idx);
    ghost.visible = true;
  }

  // Meters shown along the screen's LONG axis. Follows the action rather than
  // trying to frame the entire (wide) street, so it fills a portrait screen.
  const TOP_VIEW_M = 34;
  let topZoom = 1; // 1 = default framing; >1 zooms in, <1 out (pinch-controlled)
  let focusX = NaN; // smoothed top-down focus point (eased follow)
  let focusY = NaN;
  // A gentle tilt off straight-down so the 3D depth reads, while the maneuver
  // geometry stays clear (looking slightly from the south toward the driveway).
  const TILT = 0.42; // rad (~24 deg from vertical)

  function aimTopCam(g: GameState): void {
    const t = g.scenario.target;
    const mx = (g.physics.x + t.x) / 2; // midpoint of the rig and the target
    const my = (g.physics.y + t.y) / 2;
    if (Number.isNaN(focusX)) {
      focusX = mx;
      focusY = my;
    }
    focusX += (mx - focusX) * 0.12; // eased follow so the view glides, not snaps
    focusY += (my - focusY) * 0.12;
    const fx = focusX;
    const fy = focusY;
    const aspect = W / Hc;
    const viewM = TOP_VIEW_M / topZoom;
    let hw: number;
    let hh: number;
    if (aspect >= 1) {
      hw = viewM / 2;
      hh = hw / aspect;
    } else {
      hh = viewM / 2;
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
    if (shake > 0) {
      topCam.position.x += (Math.random() - 0.5) * shake;
      topCam.position.z += (Math.random() - 0.5) * shake;
    }
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
    const tx = ex + s.lookDist * Math.cos(look);
    const ty = ey + s.lookDist * Math.sin(look);
    cam.lookAt(tx, s.lookY, -ty);
    mirror(cam);
  }

  function renderMirrors(g: GameState): void {
    const halfW = g.rig.carWidth / 2;
    const specs: MirrorSpec[] = [
      { forward: 1.2, lateral: halfW + 0.15, yaw: -0.4, height: 1.1, lookDist: 1, lookY: 0.7 },
      // High "look back over the trailer" view: clears the van body and sees the lit path.
      { forward: -1.4, lateral: 0, yaw: 0, height: 2.7, lookDist: 6, lookY: 0.15 },
      { forward: 1.2, lateral: -(halfW + 0.15), yaw: 0.4, height: 1.1, lookDist: 1, lookY: 0.7 },
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
    const der = derive(g.physics, g.rig, { v: commandedSpeed(g), delta: g.delta });
    rig.update(g, der);
    placeObject(guides, der.trailerAxle, der.trailerHeading, 0.03);
    guides.visible = view === "backupcam";
    updateGhost(g, opts);

    // Particles: kick up dust at the trailer and tow-vehicle wheels while moving,
    // and puff exhaust from the tailpipe.
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    if (g.session.wallContacts > prevContacts) shake = 0.3;
    prevContacts = g.session.wallContacts;
    shake = Math.max(0, shake - dt * 1.6);
    const worldTick = world.userData.tick as ((t: number) => void) | undefined;
    if (worldTick) worldTick(now / 1000);
    const asp = Math.abs(commandedSpeed(g));
    if (asp > 0.12) {
      const inten = Math.min(1, asp / 1.5);
      const ta = worldToThree(der.trailerAxle, 0);
      particles.wheelDust(ta.x, ta.z, inten * 0.7);
      const ca = worldToThree(g.physics, 0);
      particles.wheelDust(ca.x, ca.z, inten);
      exhaustAcc += dt;
      if (exhaustAcc > 0.22) {
        exhaustAcc = 0;
        const rx = g.physics.x - Math.cos(g.physics.carHeading);
        const ry = g.physics.y - Math.sin(g.physics.carHeading);
        const ex = worldToThree({ x: rx, y: ry }, 0);
        particles.exhaust(ex.x, ex.z, 0.45);
      }
    }
    particles.update(dt);

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

  return {
    render,
    resize,
    setCarStyle: (style: CarStyle) => rig.setCarStyle(style),
    nudgeTopZoom: (f: number) => {
      topZoom = Math.max(0.5, Math.min(2.6, topZoom * f));
    },
    rebuild,
  };
}
