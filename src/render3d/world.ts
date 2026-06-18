import * as THREE from "three";
import type { GameState } from "../game/state";
import type { WorldBounds } from "../scenarios/types";
import { worldToThree, placeObject } from "./coords";

// =============================================================================
// world.ts -- builds the static 3D environment for the current scenario.
//
//   export function buildWorld(gs: GameState): THREE.Group
//
//   renderer.ts usage:
//       import { buildWorld } from "./world";
//       const world = buildWorld(gs);
//       scene.add(world);
//
//   The returned group holds lighting, textured ground regions, walls/curbs
//   from gs.scenario.obstacles, and the target outline. It does NOT contain
//   the car/trailer (those are dynamic and built elsewhere).
//
//   All world placement goes through worldToThree / placeObject from coords.ts.
// =============================================================================

// -----------------------------------------------------------------------------
// Procedural canvas textures (no asset files). Each makes a small tileable
// 2D noise pattern, wrapped + repeated across the ground meshes.
// -----------------------------------------------------------------------------

/** Build a CanvasTexture of value-noise speckle around a base color. */
function noiseTexture(
  base: [number, number, number],
  jitter: number,
  repeat: number,
): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const [br, bg, bb] = base;
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // Symmetric jitter so the average stays on the base color.
    const n = (Math.random() - 0.5) * 2 * jitter;
    img.data[i * 4 + 0] = clamp255(br + n);
    img.data[i * 4 + 1] = clamp255(bg + n);
    img.data[i * 4 + 2] = clamp255(bb + n);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  return tex;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// -----------------------------------------------------------------------------
// Ground region helper: a thin Box on the XZ plane covering a world rectangle.
// -----------------------------------------------------------------------------

/**
 * Add a thin slab spanning the world rectangle [x0,x1] x [y0,y1] at height `y`.
 * The texture repeat is scaled to the rectangle so tiles stay roughly square.
 */
function addGroundRegion(
  group: THREE.Group,
  material: THREE.MeshStandardMaterial,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  y: number,
): void {
  const w = Math.abs(x1 - x0);
  const d = Math.abs(y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  const geo = new THREE.BoxGeometry(w, 0.04, d);
  const mesh = new THREE.Mesh(geo, material);
  // Center on the world rectangle; worldToThree maps (cx,cy) -> (cx, y, -cy).
  const c = worldToThree({ x: cx, y: cy }, y);
  mesh.position.copy(c);
  mesh.receiveShadow = true;
  group.add(mesh);
}

// -----------------------------------------------------------------------------
// Main builder.
// -----------------------------------------------------------------------------

export function buildWorld(gs: GameState): THREE.Group {
  const group = new THREE.Group();
  const bounds = gs.scenario.worldBounds;

  addLighting(group, bounds);
  addGround(group, bounds);
  addObstacles(group, gs);
  addTarget(group, gs);

  return group;
}

// -----------------------------------------------------------------------------
// 1. Lighting: soft ambient + a high directional sun casting shadows that cover
//    the whole worldBounds.
// -----------------------------------------------------------------------------

function addLighting(group: THREE.Group, bounds: WorldBounds): void {
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  group.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(12, 20, 8);
  sun.castShadow = true;

  // Size the orthographic shadow camera to cover the world bounds (Three's XZ
  // span = world X span and world Y span). Add a margin so edge shadows are not
  // clipped.
  const halfX = (bounds.maxX - bounds.minX) / 2 + 4;
  const halfZ = (bounds.maxY - bounds.minY) / 2 + 4;
  const half = Math.max(halfX, halfZ);

  const cam = sun.shadow.camera;
  cam.left = -half;
  cam.right = half;
  cam.top = half;
  cam.bottom = -half;
  cam.near = 0.5;
  cam.far = 80;
  cam.updateProjectionMatrix();

  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;

  // Aim the sun at the world center so the shadow frustum is centered.
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const target = new THREE.Object3D();
  target.position.copy(worldToThree({ x: cx, y: cy }, 0));
  group.add(target);
  sun.target = target;

  group.add(sun);
}

// -----------------------------------------------------------------------------
// 2. Ground regions. Grass base layer over the whole bounds, an asphalt street
//    corridor, and a concrete driveway.
//
//    NOTE: the street/driveway rectangles are HARDCODED for this scenario. This
//    region data should later move into Scenario (e.g. scenario.regions[]).
// -----------------------------------------------------------------------------

function addGround(group: THREE.Group, bounds: WorldBounds): void {
  const grassMat = new THREE.MeshStandardMaterial({
    map: noiseTexture([74, 124, 56], 22, 24),
    roughness: 0.95,
    metalness: 0.0,
  });
  const asphaltMat = new THREE.MeshStandardMaterial({
    map: noiseTexture([60, 62, 66], 14, 12),
    roughness: 0.9,
    metalness: 0.0,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    map: noiseTexture([176, 174, 168], 16, 8),
    roughness: 0.85,
    metalness: 0.0,
  });

  // Grass base layer covering the whole worldBounds, slightly recessed.
  addGroundRegion(
    group,
    grassMat,
    bounds.minX,
    bounds.maxX,
    bounds.minY,
    bounds.maxY,
    -0.02,
  );

  // Street corridor: x across the bounds, y in [-3, 3].
  addGroundRegion(group, asphaltMat, bounds.minX, bounds.maxX, -3, 3, 0.0);

  // Driveway: x in [-3, 3], y in [3, 15].
  addGroundRegion(group, concreteMat, -3, 3, 3, 15, 0.0);
}

// -----------------------------------------------------------------------------
// 3 + 4. Walls and curbs built from segment obstacles.
// -----------------------------------------------------------------------------

function addObstacles(group: THREE.Group, gs: GameState): void {
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xb8b4ac,
    roughness: 0.9,
    metalness: 0.0,
  });
  const curbMat = new THREE.MeshStandardMaterial({
    color: 0xcaccce,
    roughness: 0.85,
    metalness: 0.0,
  });

  for (const ob of gs.scenario.obstacles) {
    if (ob.shape.type !== "segment") continue;
    const a = ob.shape.a;
    const b = ob.shape.b;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) continue;

    // World midpoint and heading of the segment.
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const heading = Math.atan2(dy, dx);

    if (ob.kind === "wall") {
      const height = 1.2;
      const thickness = 0.2;
      // Box: local +X is along the segment (length), +Z is thickness.
      const geo = new THREE.BoxGeometry(length, height, thickness);
      const mesh = new THREE.Mesh(geo, wallMat);
      // Raise so the wall sits on the ground (center at height/2).
      placeObject(mesh, mid, heading, height / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    } else if (ob.kind === "curb") {
      const height = 0.12;
      const thickness = 0.16;
      const geo = new THREE.BoxGeometry(length, height, thickness);
      const mesh = new THREE.Mesh(geo, curbMat);
      placeObject(mesh, mid, heading, height / 2);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    // 'cone' obstacles are not drawn here.
  }
}

// -----------------------------------------------------------------------------
// 5. Target outline: a flat bright-green emissive border on the ground at the
//    target box (center x,y, heading, halfWidth, halfLength).
// -----------------------------------------------------------------------------

function addTarget(group: THREE.Group, gs: GameState): void {
  const t = gs.scenario.target;

  const borderMat = new THREE.MeshStandardMaterial({
    color: 0x18ff5a,
    emissive: 0x12d94a,
    emissiveIntensity: 0.9,
    roughness: 0.6,
    metalness: 0.0,
  });

  // Build the rectangular outline from four thin bars in the target's LOCAL
  // frame: local +X spans the length (2*halfLength), local +Z spans the width
  // (2*halfWidth). A parent group is placed/oriented with placeObject so the
  // whole outline inherits the target heading.
  const outline = new THREE.Group();
  const barT = 0.18; // bar thickness (m)
  const barH = 0.06; // bar height (m)
  const fullLen = t.halfLength * 2;
  const fullWid = t.halfWidth * 2;

  // Two bars along the length (front/back edges), offset in local Z.
  const lengthGeo = new THREE.BoxGeometry(fullLen + barT, barH, barT);
  for (const sz of [-1, 1]) {
    const bar = new THREE.Mesh(lengthGeo, borderMat);
    bar.position.set(0, 0, sz * t.halfWidth);
    outline.add(bar);
  }
  // Two bars along the width (side edges), offset in local X.
  const widthGeo = new THREE.BoxGeometry(barT, barH, fullWid + barT);
  for (const sx of [-1, 1]) {
    const bar = new THREE.Mesh(widthGeo, borderMat);
    bar.position.set(sx * t.halfLength, 0, 0);
    outline.add(bar);
  }

  // Place + orient the outline group at the target, slightly above ground.
  placeObject(outline, { x: t.x, y: t.y }, t.heading, 0.02);
  group.add(outline);
}
