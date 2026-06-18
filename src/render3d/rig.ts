import * as THREE from "three";
import type { PhysicsDerived } from "../core/types";
import type { GameState } from "../game/state";
import { placeObject } from "./coords";

// =============================================================================
// 3D rig view: a tow van plus a low open utility trailer.
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
// =============================================================================

export interface RigView {
  group: THREE.Group;
  update(gs: GameState, derived: PhysicsDerived): void;
}

const WHEEL_LATERAL = Math.PI / 2; // rotate cylinder axis from +Y to +Z (lateral)

/** A short rolling wheel centered at (x, 0-ish, z) in the parent's local frame. */
function makeWheel(radius: number, width: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1d,
    roughness: 0.85,
    metalness: 0.05,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = WHEEL_LATERAL;
  mesh.castShadow = true;
  return mesh;
}

function box(
  length: number,
  height: number,
  width: number,
  mat: THREE.Material,
): THREE.Mesh {
  // length = local X span, height = local Y, width = local Z (lateral).
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, height, width), mat);
  mesh.castShadow = true;
  return mesh;
}

function buildCar(gs: GameState): THREE.Group {
  const { carLength, carWidth, carFrontOverhang, W } = gs.rig;
  const g = new THREE.Group();

  // Local X: origin at rear axle. Front bumper at +carFrontOverhang, rear bumper
  // at -(carLength - carFrontOverhang). Body center sits between them.
  const rearBumper = -(carLength - carFrontOverhang);
  const bodyCenterX = (carFrontOverhang + rearBumper) / 2;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x9aa6b2, // pleasant metallic silver-blue
    roughness: 0.4,
    metalness: 0.6,
  });
  const bodyHeight = 1.0;
  const wheelRadius = 0.34;
  const bodyY = wheelRadius + bodyHeight / 2; // body sits above the ground on wheels
  const body = box(carLength, bodyHeight, carWidth, bodyMat);
  body.position.set(bodyCenterX, bodyY, 0);
  g.add(body);

  // Cabin: slightly inset, darker glassy block on top, shifted a touch rearward
  // (van cabin sits over the wheelbase).
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x202530,
    roughness: 0.1,
    metalness: 0.3,
  });
  const cabinLength = carLength * 0.66;
  const cabinHeight = 0.78;
  const cabin = box(cabinLength, cabinHeight, carWidth * 0.9, glassMat);
  cabin.position.set(bodyCenterX - carLength * 0.04, bodyY + bodyHeight / 2 + cabinHeight / 2, 0);
  g.add(cabin);

  // Wheels: front axle at +W (local X), rear axle at 0, both at +/- carWidth/2.
  const wheelWidth = 0.22;
  const halfTrack = carWidth / 2 - wheelWidth / 2;
  for (const axleX of [W, 0]) {
    for (const side of [halfTrack, -halfTrack]) {
      const wheel = makeWheel(wheelRadius, wheelWidth);
      wheel.position.set(axleX, wheelRadius, side);
      g.add(wheel);
    }
  }

  // Lights: small emissive boxes at the front (head) and rear (tail) bumpers.
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff3cf,
    emissive: 0xffe9a8,
    emissiveIntensity: 0.9,
    roughness: 0.5,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff3b30,
    emissive: 0xcc1a12,
    emissiveIntensity: 0.9,
    roughness: 0.5,
  });
  const lightSize = 0.16;
  const lightY = wheelRadius + 0.35;
  const lightInset = carWidth / 2 - 0.22;
  for (const side of [lightInset, -lightInset]) {
    const head = box(0.08, lightSize, lightSize, headMat);
    head.position.set(carFrontOverhang - 0.04, lightY, side);
    g.add(head);
    const tail = box(0.08, lightSize, lightSize, tailMat);
    tail.position.set(rearBumper + 0.04, lightY, side);
    g.add(tail);
  }

  return g;
}

function buildTrailer(gs: GameState): THREE.Group {
  const { D, trailerWidth, trailerRearOverhang } = gs.rig;
  const g = new THREE.Group();

  // Local X: origin at the trailer axle. Deck spans from +D (forward, toward the
  // hitch) to -trailerRearOverhang (the tail). Drawbar runs from the deck front
  // forward to the coupler at about +D... we extend it a bit past D for the ball.
  const deckFront = D;
  const deckBack = -trailerRearOverhang;
  const deckLength = deckFront - deckBack; // ~ D + trailerRearOverhang
  const deckCenterX = (deckFront + deckBack) / 2;

  const wheelRadius = 0.3;
  const deckHeight = 0.35;
  const deckY = wheelRadius + deckHeight / 2;

  const deckMat = new THREE.MeshStandardMaterial({
    color: 0x6e7378,
    roughness: 0.7,
    metalness: 0.5,
  });
  const deck = box(deckLength, deckHeight, trailerWidth, deckMat);
  deck.position.set(deckCenterX, deckY, 0);
  g.add(deck);

  // Thin side rails along both long edges of the deck.
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x4a4d50,
    roughness: 0.6,
    metalness: 0.6,
  });
  const railHeight = 0.18;
  const railThick = 0.06;
  const railY = deckY + deckHeight / 2 + railHeight / 2;
  const railSide = trailerWidth / 2 - railThick / 2;
  for (const side of [railSide, -railSide]) {
    const rail = box(deckLength, railHeight, railThick, railMat);
    rail.position.set(deckCenterX, railY, side);
    g.add(rail);
  }

  // Drawbar: thin box from the deck front forward to the coupler (~+D, plus a
  // little for the coupler nose).
  const drawbarMat = new THREE.MeshStandardMaterial({
    color: 0x3c3f42,
    roughness: 0.6,
    metalness: 0.7,
  });
  const couplerX = D + 0.18;
  const drawbarBack = deckFront;
  const drawbarLength = couplerX - drawbarBack;
  const drawbarY = deckY - deckHeight / 2 + 0.07;
  const drawbar = box(drawbarLength, 0.1, 0.12, drawbarMat);
  drawbar.position.set((couplerX + drawbarBack) / 2, drawbarY, 0);
  g.add(drawbar);

  // Coupler nose at the very front of the drawbar.
  const coupler = box(0.16, 0.16, 0.16, drawbarMat);
  coupler.position.set(couplerX, drawbarY, 0);
  g.add(coupler);

  // Wheels: 2 at the trailer axle (local X = 0), at +/- trailerWidth/2.
  const wheelWidth = 0.2;
  const halfTrack = trailerWidth / 2 + wheelWidth / 2 - 0.02;
  for (const side of [halfTrack, -halfTrack]) {
    const wheel = makeWheel(wheelRadius, wheelWidth);
    wheel.position.set(0, wheelRadius, side);
    g.add(wheel);
  }

  // Cargo sits on top of the deck.
  const deckTopY = deckY + deckHeight / 2;

  // Mulch / soil bag: brown box ~0.5 high, toward the rear of the deck.
  const bagMat = new THREE.MeshStandardMaterial({
    color: 0x5a4632,
    roughness: 0.95,
    metalness: 0.0,
  });
  const bagH = 0.5;
  const bag = box(0.7, bagH, trailerWidth * 0.7, bagMat);
  bag.position.set(deckBack + 0.55, deckTopY + bagH / 2, -trailerWidth * 0.1);
  g.add(bag);

  // Tool box: grey box ~0.42, mid deck.
  const toolMat = new THREE.MeshStandardMaterial({
    color: 0x8a8f94,
    roughness: 0.5,
    metalness: 0.4,
  });
  const toolH = 0.42;
  const tool = box(0.6, toolH, 0.4, toolMat);
  tool.position.set(deckCenterX + 0.1, deckTopY + toolH / 2, trailerWidth * 0.22);
  g.add(tool);

  // Bin: green box ~0.34, toward the front of the deck.
  const binMat = new THREE.MeshStandardMaterial({
    color: 0x2e7d3a,
    roughness: 0.6,
    metalness: 0.1,
  });
  const binH = 0.34;
  const bin = box(0.45, binH, 0.45, binMat);
  bin.position.set(deckFront - 0.45, deckTopY + binH / 2, -trailerWidth * 0.18);
  g.add(bin);

  // Long-handled tool: thin Cylinder leaning across the deck (diagonally).
  const handleMat = new THREE.MeshStandardMaterial({
    color: 0x9c5b2a,
    roughness: 0.8,
    metalness: 0.1,
  });
  const handleLen = deckLength * 0.8;
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.035, handleLen, 10),
    handleMat,
  );
  handle.castShadow = true;
  // Lay the cylinder (local +Y axis) along the deck's long (X) axis, then tip it
  // up a little so it leans across the load.
  handle.rotation.z = Math.PI / 2; // axis now along X
  handle.rotation.y = 0.5; // skew across the deck
  handle.position.set(deckCenterX, deckTopY + 0.28, 0);
  g.add(handle);

  return g;
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
