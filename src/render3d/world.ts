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
  addEnvironment(group, bounds);
  addObstacles(group, gs);
  addTarget(group, gs);

  return group;
}

// -----------------------------------------------------------------------------
// 1. Lighting: soft ambient + a high directional sun casting shadows that cover
//    the whole worldBounds.
// -----------------------------------------------------------------------------

function addLighting(group: THREE.Group, bounds: WorldBounds): void {
  // Sky/ground hemisphere fill: warm bluish sky, soft green-tinted ground bounce.
  const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x6b7a52, 0.7);
  hemi.position.set(0, 30, 0);
  group.add(hemi);

  // A touch of flat ambient so deep shadows do not go fully black.
  const ambient = new THREE.AmbientLight(0xffffff, 0.22);
  group.add(ambient);

  // Slightly warm late-afternoon sun.
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.1);
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

  // Sidewalk: light concrete strip along y in [3, 3.6], across the bounds, but
  // split around the driveway opening (x in [-3, 3]) so the opening stays clear.
  const sidewalkMat = new THREE.MeshStandardMaterial({
    map: noiseTexture([198, 196, 190], 12, 10),
    roughness: 0.85,
    metalness: 0.0,
  });
  addGroundRegion(group, sidewalkMat, bounds.minX, -3, 3.0, 3.6, 0.01);
  addGroundRegion(group, sidewalkMat, 3, bounds.maxX, 3.0, 3.6, 0.01);
}

// -----------------------------------------------------------------------------
// 2b. Suburban environment: house, fence/hedge, trees, shrubs, mailbox.
//     Everything here is decorative and must NOT block the driveway opening
//     (x in [-3, 3]) or the maneuver path on the street/driveway.
// -----------------------------------------------------------------------------

function addEnvironment(group: THREE.Group, bounds: WorldBounds): void {
  addHouse(group);
  addFrontFence(group, bounds);
  addTrees(group);
  addShrubs(group);
  addMailbox(group);
}

// --- House --------------------------------------------------------------------
// Sits behind the driveway (north): x in [-7, 7], y in [15.5, 22]. The garage
// door faces the driveway (south wall, near the driveway opening).

function addHouse(group: THREE.Group): void {
  const house = new THREE.Group();

  const wallMat = new THREE.MeshStandardMaterial({
    color: 0xd8cdb6, // warm beige siding
    roughness: 0.9,
    metalness: 0.0,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xf2ede2,
    roughness: 0.7,
    metalness: 0.0,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x6e4a37, // brown shingle
    roughness: 0.85,
    metalness: 0.0,
  });
  const garageMat = new THREE.MeshStandardMaterial({
    color: 0xbfc4c9, // light gray garage door
    roughness: 0.7,
    metalness: 0.05,
  });
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x3f5d4a, // muted green front door
    roughness: 0.6,
    metalness: 0.0,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x9fc6d8,
    emissive: 0x21303a,
    emissiveIntensity: 0.25,
    roughness: 0.25,
    metalness: 0.1,
  });

  // House footprint and body. World x -> X, world y span -> depth (Z).
  const houseX0 = -7;
  const houseX1 = 7;
  const houseY0 = 15.5;
  const houseY1 = 22;
  const wallW = houseX1 - houseX0; // along X
  const wallD = houseY1 - houseY0; // along world Y (depth)
  const wallH = 3.4;
  const cx = (houseX0 + houseX1) / 2;
  const cyW = (houseY0 + houseY1) / 2;

  const bodyGeo = new THREE.BoxGeometry(wallW, wallH, wallD);
  const body = new THREE.Mesh(bodyGeo, wallMat);
  body.position.copy(worldToThree({ x: cx, y: cyW }, wallH / 2));
  body.castShadow = true;
  body.receiveShadow = true;
  house.add(body);

  // Pitched gable roof: two slanted slabs meeting at a ridge that runs along X.
  // The ridge sits over the center depth (world y = cyW); each slab tilts down
  // toward a side eave at world y = houseY0 / houseY1 (plus overhang).
  const roofH = 1.7;
  const roofOverhang = 0.5;
  const roofLen = wallW + roofOverhang * 2; // along X (the ridge length)
  const halfSpan = wallD / 2 + roofOverhang; // eave half-depth
  const slope = Math.hypot(halfSpan, roofH); // slab length along the slope
  const tilt = Math.atan2(roofH, halfSpan); // pitch angle
  const slabGeo = new THREE.BoxGeometry(roofLen, 0.12, slope);

  for (const dir of [-1, 1]) {
    const slab = new THREE.Mesh(slabGeo, roofMat);
    // Each slab spans from the ridge (center) out to one eave; its midpoint is
    // halfway between ridge and eave in both height and depth.
    const midY = wallH + roofH / 2; // mid height between eave and ridge
    const midDepthOffset = (halfSpan / 2) * dir; // toward +/- world y
    slab.position.copy(
      worldToThree({ x: cx, y: cyW + midDepthOffset }, midY),
    );
    // Tilt about the X axis (Three X) so the slab follows the pitch.
    slab.rotation.x = dir * tilt;
    slab.castShadow = true;
    house.add(slab);
  }

  // South wall (facing the driveway) is at world y = houseY0; its outward
  // normal is -Z in three space increasing... we place features just in front
  // of the wall plane (slightly toward the driveway, smaller world y).
  const faceY = houseY0 - 0.06; // just proud of the wall
  const faceZ = 0.06; // depth of attached panels

  // Garage door: aligned with the driveway, width ~ 5 (clear of opening edges),
  // placed on the left half of the facade so the front door fits beside it.
  const garageW = 5.0;
  const garageH = 2.4;
  const garageGeo = new THREE.BoxGeometry(garageW, garageH, faceZ);
  const garage = new THREE.Mesh(garageGeo, garageMat);
  garage.position.copy(worldToThree({ x: -2.0, y: faceY }, garageH / 2));
  garage.castShadow = true;
  house.add(garage);
  // Garage door panel lines (subtle horizontal trim).
  const panelGeo = new THREE.BoxGeometry(garageW, 0.04, faceZ + 0.02);
  for (let i = 1; i <= 3; i++) {
    const line = new THREE.Mesh(panelGeo, trimMat);
    line.position.copy(
      worldToThree({ x: -2.0, y: faceY }, (garageH * i) / 4),
    );
    house.add(line);
  }

  // Front door on the right half.
  const doorW = 1.1;
  const doorH = 2.1;
  const doorGeo = new THREE.BoxGeometry(doorW, doorH, faceZ);
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.copy(worldToThree({ x: 3.3, y: faceY }, doorH / 2));
  door.castShadow = true;
  house.add(door);

  // Windows: two on the facade (reuse one geometry).
  const winGeo = new THREE.BoxGeometry(1.3, 1.1, faceZ);
  for (const wx of [1.5, 5.4]) {
    const win = new THREE.Mesh(winGeo, glassMat);
    win.position.copy(worldToThree({ x: wx, y: faceY }, 2.3));
    house.add(win);
    // Simple light trim frame behind the glass.
    const frameGeo = new THREE.BoxGeometry(1.5, 1.3, faceZ - 0.02);
    const frame = new THREE.Mesh(frameGeo, trimMat);
    frame.position.copy(worldToThree({ x: wx, y: faceY + 0.005 }, 2.3));
    house.add(frame);
    win.position.z += 0.02;
  }

  group.add(house);
}

// --- Front fence / hedge ------------------------------------------------------
// A low picket fence along the front property line at world y ~ 3.9, flanking
// the driveway opening (x in [-3, 3]) but never closing it.

function addFrontFence(group: THREE.Group, bounds: WorldBounds): void {
  const railMat = new THREE.MeshStandardMaterial({
    color: 0xeceae3,
    roughness: 0.8,
    metalness: 0.0,
  });

  const fenceY = 3.9;
  const postH = 0.7;
  const postGeo = new THREE.BoxGeometry(0.08, postH, 0.08);
  const railGeo = new THREE.BoxGeometry(1, 0.06, 0.05);

  // Two runs: left of the driveway and right of the driveway.
  const runs: Array<[number, number]> = [
    [bounds.minX + 1, -3.2],
    [3.2, bounds.maxX - 1],
  ];

  for (const [x0, x1] of runs) {
    const len = x1 - x0;
    if (len <= 0) continue;
    const mid = (x0 + x1) / 2;

    // Two horizontal rails.
    for (const h of [0.32, 0.58]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.scale.x = len;
      rail.position.copy(worldToThree({ x: mid, y: fenceY }, h));
      rail.castShadow = true;
      group.add(rail);
    }

    // Pickets spaced ~0.5 m.
    const n = Math.max(2, Math.round(len / 0.5));
    for (let i = 0; i <= n; i++) {
      const px = x0 + (len * i) / n;
      const post = new THREE.Mesh(postGeo, railMat);
      post.position.copy(worldToThree({ x: px, y: fenceY }, postH / 2));
      post.castShadow = true;
      group.add(post);
    }
  }
}

// --- Trees --------------------------------------------------------------------
// Trunk cylinder + a couple of foliage spheres, placed on the lawn clear of the
// rig path (street y in [-3,3]) and the driveway (x in [-3,3]).

function addTrees(group: THREE.Group): void {
  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x6b4a2f,
    roughness: 0.95,
    metalness: 0.0,
  });
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x3f7d3a,
    roughness: 0.9,
    metalness: 0.0,
  });

  // Reused geometries.
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.24, 2.2, 8);
  const foliageGeo = new THREE.SphereGeometry(1.3, 12, 10);

  // World positions on the lawn, well clear of street and driveway.
  const spots: Array<[number, number]> = [
    [-11, 9],
    [12, 8],
    [-14, 14],
  ];

  for (const [x, y] of spots) {
    const tree = new THREE.Group();

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.1;
    trunk.castShadow = true;
    tree.add(trunk);

    // A cluster of foliage spheres for an irregular canopy.
    const offsets: Array<[number, number, number, number]> = [
      [0, 2.7, 0, 1.0],
      [0.7, 2.4, 0.4, 0.75],
      [-0.6, 2.5, -0.3, 0.8],
      [0.2, 3.2, -0.2, 0.7],
    ];
    for (const [ox, oy, oz, s] of offsets) {
      const blob = new THREE.Mesh(foliageGeo, foliageMat);
      blob.position.set(ox, oy, oz);
      blob.scale.setScalar(s);
      blob.castShadow = true;
      tree.add(blob);
    }

    tree.position.copy(worldToThree({ x, y }, 0));
    group.add(tree);
  }
}

// --- Shrubs -------------------------------------------------------------------
// Low rounded bushes along the house front and on the lawn.

function addShrubs(group: THREE.Group): void {
  const shrubMat = new THREE.MeshStandardMaterial({
    color: 0x4f8a45,
    roughness: 0.95,
    metalness: 0.0,
  });
  const shrubGeo = new THREE.SphereGeometry(0.6, 10, 8);

  const spots: Array<[number, number]> = [
    [5.5, 14.6], // by the front door
    [-5.5, 14.6], // by the garage
    [9, 5],
    [-9, 5],
  ];

  for (const [x, y] of spots) {
    const shrub = new THREE.Mesh(shrubGeo, shrubMat);
    shrub.scale.set(1, 0.7, 1);
    shrub.position.copy(worldToThree({ x, y }, 0.42));
    shrub.castShadow = true;
    group.add(shrub);
  }
}

// --- Mailbox ------------------------------------------------------------------
// A small post + box near the street, beside the driveway opening.

function addMailbox(group: THREE.Group): void {
  const postMat = new THREE.MeshStandardMaterial({
    color: 0x5a4632,
    roughness: 0.9,
    metalness: 0.0,
  });
  const boxMat = new THREE.MeshStandardMaterial({
    color: 0x9a3b32, // barn red
    roughness: 0.6,
    metalness: 0.1,
  });

  const mailbox = new THREE.Group();

  const post = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 1.1, 0.1),
    postMat,
  );
  post.position.y = 0.55;
  post.castShadow = true;
  mailbox.add(post);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.32, 0.24),
    boxMat,
  );
  box.position.y = 1.15;
  box.castShadow = true;
  mailbox.add(box);

  // Beside the driveway opening, just behind the sidewalk.
  mailbox.position.copy(worldToThree({ x: 4.0, y: 4.0 }, 0));
  group.add(mailbox);
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
