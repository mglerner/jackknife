import * as THREE from "three";
import type { PhysicsDerived } from "../core/types";
import type { GameState } from "../game/state";
import { placeObject } from "./coords";

// =============================================================================
// 3D rig view: a Honda Odyssey-style minivan towing a low open utility trailer.
//
// Both child groups are modeled with LOCAL +X = forward, matching the
// placeObject convention in coords.ts (heading h -> rotation.y = h, and the
// mesh's local +X maps to the world forward direction).
//
//   CAR origin     = rear axle (placed at gs.physics, heading gs.physics.carHeading)
//   TRAILER origin = trailer axle (placed at derived.trailerAxle, derived.trailerHeading)
//
// All wheels are short Cylinders. A Cylinder's axis is local +Y; we want the
// wheel to roll about the LATERAL (local Z) axis, so we rotate it +90 deg about
// local X to lay the cylinder axis along Z.
//
// To stay performant we share a small palette of materials and reuse a few
// geometries (wheels, tools) across instances rather than allocating per part.
// =============================================================================

export interface RigView {
  group: THREE.Group;
  update(gs: GameState, derived: PhysicsDerived): void;
}

const WHEEL_LATERAL = Math.PI / 2; // rotate cylinder axis from +Y to +Z (lateral)

function box(
  length: number,
  height: number,
  width: number,
  mat: THREE.Material,
  cast = true,
): THREE.Mesh {
  // length = local X span, height = local Y, width = local Z (lateral).
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), mat);
  mesh.castShadow = cast;
  return mesh;
}

// -----------------------------------------------------------------------------
// CAR: a believable minivan from layered boxes.
// -----------------------------------------------------------------------------

function buildCar(gs: GameState): THREE.Group {
  const { carLength, carWidth, carFrontOverhang, W } = gs.rig;
  const g = new THREE.Group();

  // Local X: origin at rear axle. Front bumper at +carFrontOverhang, rear bumper
  // at -(carLength - carFrontOverhang).
  const front = carFrontOverhang;
  const rearBumper = -(carLength - carFrontOverhang);
  const bodyCenterX = (front + rearBumper) / 2;
  const halfW = carWidth / 2;

  // --- Materials (shared across this car) ---
  const bodyColor = 0x8c97a3; // metallic silver-blue
  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.38,
    metalness: 0.7,
  });
  const lowerTrimMat = new THREE.MeshStandardMaterial({
    color: 0x2a2d31, // dark rocker/cladding
    roughness: 0.7,
    metalness: 0.2,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x161b22,
    roughness: 0.08,
    metalness: 0.2,
    transparent: true,
    opacity: 0.85,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x14171a, // black pillars / glass surround
    roughness: 0.5,
    metalness: 0.3,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xc9ced3,
    roughness: 0.25,
    metalness: 0.9,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x121214,
    roughness: 0.9,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xb8bdc2,
    roughness: 0.35,
    metalness: 0.85,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6da,
    emissive: 0xffe7a0,
    emissiveIntensity: 1.0,
    roughness: 0.3,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff342a,
    emissive: 0xd11409,
    emissiveIntensity: 1.0,
    roughness: 0.35,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2ea,
    roughness: 0.6,
    metalness: 0.0,
  });

  const wheelRadius = 0.34;
  const wheelWidth = 0.24;

  // Ride geometry. The lower body is the main mass; the greenhouse (cabin)
  // sits on top, and a thin roof caps it.
  const lowerH = 0.62; // main body box height
  const lowerY = wheelRadius + 0.12 + lowerH / 2; // floor sits a touch above wheel bottom
  const greenhouseLen = carLength * 0.6;
  const greenhouseH = 0.62;
  const greenhouseY = lowerY + lowerH / 2 + greenhouseH / 2;
  const greenhouseCenterX = bodyCenterX - carLength * 0.02; // bias slightly rearward

  // --- Lower body ---
  const body = box(carLength * 0.985, lowerH, carWidth, bodyMat);
  body.position.set(bodyCenterX, lowerY, 0);
  g.add(body);

  // Sloped hood: a wedge in front of the windshield, lower than the main body top.
  const hoodLen = carLength * 0.2;
  const hood = box(hoodLen, 0.16, carWidth * 0.96, bodyMat);
  hood.position.set(front - hoodLen / 2 - 0.05, lowerY + lowerH / 2 - 0.02, 0);
  hood.rotation.z = -0.07; // nose dips down toward the bumper
  g.add(hood);

  // Dark lower cladding / rocker panels along the sills.
  const rockerH = 0.16;
  const rocker = box(carLength * 0.86, rockerH, carWidth + 0.02, lowerTrimMat);
  rocker.position.set(bodyCenterX, lowerY - lowerH / 2 + rockerH / 2 + 0.02, 0);
  g.add(rocker);

  // --- Greenhouse (window box), inset and dark-glass ---
  const greenhouse = box(greenhouseLen, greenhouseH, carWidth * 0.9, glassMat, false);
  greenhouse.position.set(greenhouseCenterX, greenhouseY, 0);
  g.add(greenhouse);

  // Pillar/trim band wrapping the base of the greenhouse so the glass reads as
  // inset rather than floating.
  const beltline = box(greenhouseLen + 0.04, 0.1, carWidth * 0.92, trimMat);
  beltline.position.set(greenhouseCenterX, greenhouseY - greenhouseH / 2 + 0.05, 0);
  g.add(beltline);

  // A-pillars: thin slanted posts at the front of the greenhouse (windshield rake).
  const windshield = box(0.06, greenhouseH * 1.02, carWidth * 0.86, trimMat);
  windshield.position.set(
    greenhouseCenterX + greenhouseLen / 2,
    greenhouseY + 0.02,
    0,
  );
  windshield.rotation.z = 0.28; // rake forward
  g.add(windshield);

  // --- Rounded roof (slightly narrower than the greenhouse, gentle crown) ---
  const roofLen = greenhouseLen * 0.98;
  const roofMat = bodyMat;
  const roof = box(roofLen, 0.12, carWidth * 0.84, roofMat);
  roof.position.set(greenhouseCenterX, greenhouseY + greenhouseH / 2 + 0.04, 0);
  g.add(roof);
  // A thin crown cylinder gives the roof a rounded ridge.
  const crownGeo = new THREE.CylinderGeometry(0.1, 0.1, roofLen, 12);
  const crown = new THREE.Mesh(crownGeo, roofMat);
  crown.rotation.z = Math.PI / 2; // axis along X
  crown.position.set(greenhouseCenterX, greenhouseY + greenhouseH / 2 + 0.08, 0);
  crown.castShadow = true;
  g.add(crown);

  // --- Bumpers (body color), front and rear ---
  const bumperH = 0.3;
  const bumperY = wheelRadius + 0.02 + bumperH / 2;
  const frontBumper = box(0.18, bumperH, carWidth * 0.98, bodyMat);
  frontBumper.position.set(front - 0.05, bumperY, 0);
  g.add(frontBumper);
  const rearBumperMesh = box(0.18, bumperH, carWidth * 0.98, bodyMat);
  rearBumperMesh.position.set(rearBumper + 0.05, bumperY, 0);
  g.add(rearBumperMesh);

  // --- Front grille (dark, with a chrome bar) ---
  const grille = box(0.06, 0.22, carWidth * 0.55, trimMat);
  grille.position.set(front - 0.02, bumperY + bumperH / 2 + 0.12, 0);
  g.add(grille);
  const grilleBar = box(0.07, 0.05, carWidth * 0.55, chromeMat);
  grilleBar.position.set(front - 0.015, bumperY + bumperH / 2 + 0.12, 0);
  g.add(grilleBar);

  // --- Wheels: tire + rim, front axle at +W, rear at 0 ---
  const halfTrack = halfW - wheelWidth / 2 + 0.02;
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 18);
  const rimGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.55,
    wheelRadius * 0.55,
    wheelWidth + 0.02,
    14,
  );
  const wellMat = lowerTrimMat;
  for (const axleX of [W, 0]) {
    for (const side of [halfTrack, -halfTrack]) {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.x = WHEEL_LATERAL;
      tire.position.set(axleX, wheelRadius, side);
      tire.castShadow = true;
      g.add(tire);

      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = WHEEL_LATERAL;
      rim.position.set(axleX, wheelRadius, side);
      g.add(rim);

      // Black wheel well arch over each tire.
      const well = box(wheelRadius * 2.3, 0.1, wheelWidth + 0.08, wellMat);
      well.position.set(axleX, wheelRadius + wheelRadius + 0.02, side);
      g.add(well);
    }
  }

  // --- Side mirrors on stalks ---
  const mirrorStalkGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8);
  const mirrorX = greenhouseCenterX + greenhouseLen / 2 - 0.1;
  const mirrorY = greenhouseY - greenhouseH / 2 + 0.1;
  for (const side of [halfW, -halfW]) {
    const stalk = new THREE.Mesh(mirrorStalkGeo, trimMat);
    stalk.rotation.x = WHEEL_LATERAL;
    stalk.position.set(mirrorX, mirrorY, side + Math.sign(side) * 0.07);
    g.add(stalk);
    const housing = box(0.1, 0.12, 0.06, trimMat);
    housing.position.set(mirrorX, mirrorY, side + Math.sign(side) * 0.16);
    g.add(housing);
  }

  // --- Lights: head (front, warm) and tail (rear, red) ---
  const lightH = 0.14;
  const lightY = bumperY + bumperH / 2 + 0.06;
  const lightInset = halfW - 0.18;
  for (const side of [lightInset, -lightInset]) {
    const head = box(0.06, lightH, 0.26, headMat);
    head.position.set(front + 0.005, lightY, side);
    g.add(head);
    const tail = box(0.06, lightH * 1.3, 0.2, tailMat);
    tail.position.set(rearBumper - 0.005, lightY + 0.06, side);
    g.add(tail);
  }

  // --- License plates ---
  const plateGeo = new THREE.BoxGeometry(0.04, 0.16, 0.34);
  const frontPlate = new THREE.Mesh(plateGeo, plateMat);
  frontPlate.position.set(front + 0.01, bumperY, 0);
  g.add(frontPlate);
  const rearPlate = new THREE.Mesh(plateGeo, plateMat);
  rearPlate.position.set(rearBumper - 0.01, bumperY, 0);
  g.add(rearPlate);

  return g;
}

// -----------------------------------------------------------------------------
// TRAILER: a low open utility trailer with planked deck, rails, fenders, tongue,
// jack, tail lights, and a low garden-cargo load.
// -----------------------------------------------------------------------------

function buildTrailer(gs: GameState): THREE.Group {
  const { D, trailerWidth, trailerRearOverhang } = gs.rig;
  const g = new THREE.Group();

  // Local X: origin at the trailer axle. Deck spans from +D (forward, toward the
  // hitch) to -trailerRearOverhang (the tail). Tongue runs from the deck front
  // forward to the coupler past +D.
  const deckFront = D;
  const deckBack = -trailerRearOverhang;
  const deckLength = deckFront - deckBack;
  const deckCenterX = (deckFront + deckBack) / 2;
  const halfW = trailerWidth / 2;

  const wheelRadius = 0.3;
  const frameH = 0.14; // structural frame beam height
  const deckTopOffset = 0.04; // planks above frame
  const frameY = wheelRadius + 0.1 + frameH / 2;
  const deckTopY = frameY + frameH / 2 + deckTopOffset;

  // --- Materials ---
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x3a3d40,
    roughness: 0.55,
    metalness: 0.75,
  });
  const plankMat = new THREE.MeshStandardMaterial({
    color: 0x7a6a52, // weathered wood
    roughness: 0.85,
    metalness: 0.05,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x2f3133,
    roughness: 0.5,
    metalness: 0.7,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x121214,
    roughness: 0.9,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xa9aeb3,
    roughness: 0.4,
    metalness: 0.8,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff342a,
    emissive: 0xd11409,
    emissiveIntensity: 1.0,
    roughness: 0.35,
  });

  // --- Frame perimeter (two long side beams + cross at axle and tail) ---
  const beamW = 0.1;
  for (const side of [halfW - beamW / 2, -(halfW - beamW / 2)]) {
    const beam = box(deckLength, frameH, beamW, frameMat);
    beam.position.set(deckCenterX, frameY, side);
    g.add(beam);
  }
  for (const cx of [deckFront - beamW / 2, deckBack + beamW / 2, 0]) {
    const cross = box(beamW, frameH, trailerWidth - beamW, frameMat);
    cross.position.set(cx, frameY, 0);
    g.add(cross);
  }

  // --- Planked deck (several boards with thin gaps -> mesh/planked look) ---
  const nPlanks = 6;
  const plankH = 0.05;
  const gap = 0.025;
  const plankW = (trailerWidth - (nPlanks - 1) * gap) / nPlanks;
  const plankGeo = new THREE.BoxGeometry(deckLength - 0.04, plankH, plankW);
  for (let i = 0; i < nPlanks; i++) {
    const plank = new THREE.Mesh(plankGeo, plankMat);
    const z = -halfW + plankW / 2 + i * (plankW + gap);
    plank.position.set(deckCenterX, deckTopY, z);
    plank.castShadow = true;
    g.add(plank);
  }

  // --- Low side rails along both long edges ---
  const railH = 0.16;
  const railThick = 0.05;
  const railY = deckTopY + plankH / 2 + railH / 2;
  const railSide = halfW - railThick / 2;
  for (const side of [railSide, -railSide]) {
    const rail = box(deckLength, railH, railThick, railMat);
    rail.position.set(deckCenterX, railY, side);
    g.add(rail);
  }
  // A front and rear rail to close the box edges.
  for (const cx of [deckFront - railThick / 2, deckBack + railThick / 2]) {
    const rail = box(railThick, railH, trailerWidth, railMat);
    rail.position.set(cx, railY, 0);
    g.add(rail);
  }

  // --- A-frame tongue: two angled beams meeting at the coupler ---
  const couplerX = deckFront + 0.95;
  const tongueY = frameY;
  const tongueGeo = new THREE.BoxGeometry(1.0, frameH * 0.9, 0.08);
  const apexZ = 0.0;
  for (const sideZ of [halfW - 0.12, -(halfW - 0.12)]) {
    const arm = new THREE.Mesh(tongueGeo, frameMat);
    // Each arm runs from a front frame corner forward+inward to the coupler.
    const startX = deckFront;
    const midX = (startX + couplerX) / 2;
    const midZ = (sideZ + apexZ) / 2;
    arm.position.set(midX, tongueY, midZ);
    const dx = couplerX - startX;
    const dz = apexZ - sideZ;
    const len = Math.hypot(dx, dz);
    arm.scale.x = len / 1.0;
    arm.rotation.y = Math.atan2(-dz, dx); // local +X along the arm (world->three: angle about Y)
    arm.castShadow = true;
    g.add(arm);
  }

  // --- Coupler nose at the tongue apex ---
  const coupler = box(0.18, 0.16, 0.16, frameMat);
  coupler.position.set(couplerX, tongueY, 0);
  g.add(coupler);

  // --- Tongue jack: a vertical post with a small wheel, ahead of the deck ---
  const jackPostGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.42, 10);
  const jackPost = new THREE.Mesh(jackPostGeo, frameMat);
  jackPost.position.set(deckFront + 0.35, frameY - 0.16, halfW - 0.15);
  jackPost.castShadow = true;
  g.add(jackPost);
  const jackWheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 0.06, 12),
    tireMat,
  );
  jackWheel.rotation.x = WHEEL_LATERAL;
  jackWheel.position.set(deckFront + 0.35, wheelRadius - 0.15, halfW - 0.15);
  g.add(jackWheel);

  // --- Wheels: 2 at the axle (X = 0), with fenders arching over them ---
  const wheelWidth = 0.22;
  const halfTrack = halfW + wheelWidth / 2 - 0.02;
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 18);
  const rimGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.5,
    wheelRadius * 0.5,
    wheelWidth + 0.02,
    12,
  );
  const fenderMat = railMat;
  for (const side of [halfTrack, -halfTrack]) {
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.x = WHEEL_LATERAL;
    tire.position.set(0, wheelRadius, side);
    tire.castShadow = true;
    g.add(tire);

    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = WHEEL_LATERAL;
    rim.position.set(0, wheelRadius, side);
    g.add(rim);

    // Fender: an arched cover built from a few short angled segments.
    const fender = makeFender(wheelRadius, wheelWidth, fenderMat);
    fender.position.set(0, wheelRadius, side);
    g.add(fender);
  }

  // --- Tail lights at the rear corners ---
  const tlH = 0.12;
  for (const side of [halfW - 0.1, -(halfW - 0.1)]) {
    const tl = box(0.05, tlH, 0.14, tailMat);
    tl.position.set(deckBack - 0.02, railY, side);
    g.add(tl);
  }

  // --- Low cargo (kept low so the backup camera sees past it) ---
  addCargo(g, deckCenterX, deckBack, deckFront, trailerWidth, deckTopY + plankH / 2);

  return g;
}

/** An arched fender over a wheel, made of short angled box segments. */
function makeFender(
  wheelRadius: number,
  wheelWidth: number,
  mat: THREE.Material,
): THREE.Group {
  const f = new THREE.Group();
  const segs = 5;
  const arcR = wheelRadius + 0.1;
  const segLen = (arcR * Math.PI) / segs * 1.05; // slight overlap
  const w = wheelWidth + 0.12;
  const geo = new THREE.BoxGeometry(segLen, 0.04, w);
  for (let i = 0; i < segs; i++) {
    const a = Math.PI * ((i + 0.5) / segs); // 0..PI over the top
    const seg = new THREE.Mesh(geo, mat);
    seg.position.set(arcR * Math.cos(a), arcR * Math.sin(a), 0);
    seg.rotation.z = a - Math.PI / 2; // tangent to the arc
    seg.castShadow = true;
    f.add(seg);
  }
  return f;
}

/** Garden-store cargo: soil bags, a wheelbarrow, and leaning hand tools. */
function addCargo(
  g: THREE.Group,
  deckCenterX: number,
  deckBack: number,
  deckFront: number,
  trailerWidth: number,
  deckSurfaceY: number,
): void {
  const halfW = trailerWidth / 2;

  // --- Two soil / mulch bags, lying flat and low, toward the rear ---
  const bagMat = new THREE.MeshStandardMaterial({
    color: 0x4a3a28,
    roughness: 0.95,
    metalness: 0.0,
  });
  const bagMat2 = new THREE.MeshStandardMaterial({
    color: 0x6b5235,
    roughness: 0.95,
    metalness: 0.0,
  });
  const bagH = 0.22;
  const bagGeo = new THREE.BoxGeometry(0.78, bagH, 0.42);
  const bag1 = new THREE.Mesh(bagGeo, bagMat);
  bag1.position.set(deckBack + 0.55, deckSurfaceY + bagH / 2, -halfW * 0.45);
  bag1.rotation.y = 0.1;
  bag1.castShadow = true;
  g.add(bag1);
  const bag2 = new THREE.Mesh(bagGeo, bagMat2);
  bag2.position.set(deckBack + 0.6, deckSurfaceY + bagH / 2, halfW * 0.0);
  bag2.rotation.y = -0.05;
  bag2.castShadow = true;
  g.add(bag2);

  // --- Wheelbarrow: a tub + a wheel + two handles, mid deck ---
  const wbX = deckCenterX + 0.1;
  const wbZ = halfW * 0.35;
  const tubMat = new THREE.MeshStandardMaterial({
    color: 0x2f6f3a, // garden green
    roughness: 0.5,
    metalness: 0.2,
  });
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.26, 0.5), tubMat);
  tub.position.set(wbX, deckSurfaceY + 0.13 + 0.18, wbZ);
  tub.rotation.z = 0.06;
  tub.castShadow = true;
  g.add(tub);

  const wbMetalMat = new THREE.MeshStandardMaterial({
    color: 0x55585c,
    roughness: 0.5,
    metalness: 0.7,
  });
  const wbWheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.07, 12),
    new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9, metalness: 0.05 }),
  );
  wbWheel.rotation.x = WHEEL_LATERAL;
  wbWheel.position.set(wbX + 0.36, deckSurfaceY + 0.14, wbZ);
  wbWheel.castShadow = true;
  g.add(wbWheel);

  const handleGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.8, 8);
  for (const dz of [0.18, -0.18]) {
    const h = new THREE.Mesh(handleGeo, wbMetalMat);
    h.rotation.z = Math.PI / 2; // along X
    h.rotation.y = 0.0;
    h.position.set(wbX - 0.25, deckSurfaceY + 0.3, wbZ + dz);
    h.rotation.x = 0;
    h.castShadow = true;
    g.add(h);
  }

  // --- Hand tools: a rake and a shovel leaning against the front rail ---
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0xa9722f,
    roughness: 0.8,
    metalness: 0.05,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x6b6e72,
    roughness: 0.4,
    metalness: 0.8,
  });
  const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.5, 8);

  // Shovel: shaft leaning, with a flat blade head at the low end.
  const shovel = new THREE.Group();
  const shovelShaft = new THREE.Mesh(shaftGeo, woodMat);
  shovelShaft.castShadow = true;
  shovel.add(shovelShaft);
  const shovelHead = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.18), metalMat);
  shovelHead.position.set(0, -0.82, 0); // below the shaft along its local axis
  shovel.add(shovelHead);
  // Lean it: tip the shaft (local +Y) so the head rests near the front rail.
  shovel.rotation.z = -0.6;
  shovel.rotation.y = 0.4;
  shovel.position.set(deckFront - 0.5, deckSurfaceY + 0.6, -halfW * 0.5);
  g.add(shovel);

  // Rake: shaft + a head bar with short tines.
  const rake = new THREE.Group();
  const rakeShaft = new THREE.Mesh(shaftGeo, woodMat);
  rakeShaft.castShadow = true;
  rake.add(rakeShaft);
  const rakeHead = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.36), metalMat);
  rakeHead.position.set(0, -0.78, 0);
  rake.add(rakeHead);
  const tineGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.12, 6);
  for (let i = 0; i < 5; i++) {
    const tine = new THREE.Mesh(tineGeo, metalMat);
    tine.position.set(0, -0.84, -0.15 + i * 0.075);
    rake.add(tine);
  }
  rake.rotation.z = -0.55;
  rake.rotation.y = -0.5;
  rake.position.set(deckFront - 0.55, deckSurfaceY + 0.6, halfW * 0.45);
  g.add(rake);
}

export function buildRig(gs: GameState): RigView {
  const group = new THREE.Group();
  const carGroup = buildCar(gs);
  const trailerGroup = buildTrailer(gs);
  group.add(carGroup);
  group.add(trailerGroup);

  return {
    group,
    update(gs2: GameState, derived: PhysicsDerived): void {
      placeObject(carGroup, gs2.physics, gs2.physics.carHeading);
      placeObject(trailerGroup, derived.trailerAxle, derived.trailerHeading);
    },
  };
}
