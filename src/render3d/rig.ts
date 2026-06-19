import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
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

export type CarStyle = "procedural" | "gltf";

export interface RigView {
  group: THREE.Group;
  update(gs: GameState, derived: PhysicsDerived): void;
  /** Switch the tow vehicle between the hand-built model and the loaded glTF. */
  setCarStyle(style: CarStyle): void;
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
// CAR: a Honda Odyssey-style minivan.
//
// The look we are after: a LONG, fairly LOW minivan (not a tall boxy SUV). A
// short low hood, a steeply raked windshield, then a long low-slung greenhouse
// with lots of glass running most of the length, a roofline that gently tapers
// down toward the rear, and a near-vertical tailgate. Soft rounded corners with
// a little tumblehome (the glass tilts inward at the top). Light silver paint.
// -----------------------------------------------------------------------------

/** A smooth-shaded rounded box helper used for the main body masses. */
function roundedBox(
  length: number,
  height: number,
  width: number,
  radius: number,
  mat: THREE.Material,
  cast = true,
  segments = 4,
): THREE.Mesh {
  const r = Math.min(radius, length / 2, height / 2, width / 2) * 0.999;
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(length, height, width, segments, r), mat);
  mesh.castShadow = cast;
  return mesh;
}

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
  // Light silver (Honda Polished Metal Metallic). Lighter than nominal so it
  // reads as light silver paint rather than charcoal under this lighting.
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xb4babf, // Honda "Polished Metal Metallic": a light cool grey-silver
    roughness: 0.12,
    // Lower metalness so the light base color shows from EVERY angle (at 0.9 it
    // went mirror-dark from the side); the clearcoat still gives a glossy glint.
    metalness: 0.62,
    envMapIntensity: 1.35,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  const lowerTrimMat = new THREE.MeshStandardMaterial({
    color: 0x35383c, // dark rocker / cladding (lighter than before so it isn't a black void)
    roughness: 0.7,
    metalness: 0.2,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1c232b, // tinted glass: dark but not pure black
    roughness: 0.1,
    metalness: 0.4,
    transparent: true,
    opacity: 0.82,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x14171b, // black pillar trim / glass surround / mirror
    roughness: 0.45,
    metalness: 0.35,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xd6dade,
    roughness: 0.18,
    metalness: 0.95,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x16161a,
    roughness: 0.92,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xb6bbc0,
    roughness: 0.3,
    metalness: 0.9,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xeef4ff,
    emissive: 0xbcd2ff,
    emissiveIntensity: 0.6,
    roughness: 0.15,
    metalness: 0.2,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xd9261c,
    emissive: 0xb01007,
    emissiveIntensity: 0.8,
    roughness: 0.3,
  });
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2ea,
    roughness: 0.6,
    metalness: 0.0,
  });

  const wheelRadius = 0.42;
  const wheelWidth = 0.27;

  // Ride geometry. A minivan is LONG and fairly low. The lower body is a single
  // rounded slab; the greenhouse (cabin) is a long glassy mass on top that runs
  // most of the length and tapers down toward the rear; capped by a roof.
  // Total height ~1.73 m.
  const lowerH = 0.62; // main body height (beltline sits fairly low on a van)
  const lowerY = wheelRadius + 0.04 + lowerH / 2;
  const lowerTopY = lowerY + lowerH / 2;

  // --- Lower body (main rounded slab), nearly full length ---
  const bodyLen = carLength - 0.18;
  const body = roundedBox(bodyLen, lowerH, carWidth, 0.3, bodyMat, true, 5);
  body.position.set(bodyCenterX, lowerY, 0);
  g.add(body);

  // Short, low hood ahead of the windshield; the nose dips toward the bumper.
  const hoodFrontX = front - 0.14;
  const ghFrontX = front - carLength * 0.13; // base of A-pillar (very short van hood)
  const hoodLen = hoodFrontX - ghFrontX;
  const hood = roundedBox(hoodLen + 0.22, 0.15, carWidth * 0.82, 0.06, bodyMat);
  hood.position.set((hoodFrontX + ghFrontX) / 2, lowerTopY - 0.07, 0);
  hood.rotation.z = -0.06; // a gentle forward slope (the Odyssey hood is fairly flat)
  g.add(hood);

  // Rounded front fascia (nose): the hood is too thin to round its own corners, so
  // a tall rounded box just behind the grille/headlights wraps the front-top
  // corners that otherwise read square by the headlights.
  const noseTopY = lowerTopY - 0.05;
  const noseBotY = wheelRadius + 0.16;
  // Deep and narrower than the body so its big top-view corner radius rounds the
  // FRONT OUTLINE seen from overhead (the body's rounded corners then show beside it).
  const noseCap = roundedBox(0.64, noseTopY - noseBotY, carWidth * 0.82, 0.31, bodyMat, true, 7);
  noseCap.position.set(front - 0.34, (noseTopY + noseBotY) / 2, 0);
  g.add(noseCap);

  // Dark lower cladding / rocker panels along the sills.
  const rockerH = 0.16;
  const rocker = roundedBox(carLength * 0.88, rockerH, carWidth + 0.02, 0.06, lowerTrimMat);
  rocker.position.set(bodyCenterX, lowerY - lowerH / 2 + rockerH / 2 + 0.02, 0);
  g.add(rocker);

  // ===========================================================================
  // GREENHOUSE: a long low-slung cabin. We build it as a trapezoidal glass mass
  // that runs most of the length and tapers DOWN toward the rear, with a little
  // tumblehome (top narrower than the base). Body-colored pillars break the
  // glass into panes: windshield, front door, sliding-door, rear quarter.
  // ===========================================================================
  const ghBackX = rearBumper + carLength * 0.05; // base of the near-vertical tailgate
  const greenhouseLen = ghFrontX - ghBackX;
  const greenhouseCenterX = (ghFrontX + ghBackX) / 2;
  const ghBaseY = lowerTopY - 0.06; // glass starts a touch into the body (belt line)
  const ghHalfBaseW = carWidth * 0.46;
  const ghHalfTopW = carWidth * 0.37; // narrower at the top -> more tumblehome

  // Roofline: highest just behind the windshield, tapering down to the rear.
  const ghFrontH = 0.56; // cabin height at the front (over the A-pillar base)
  const ghRearH = 0.47; // lower at the rear quarter
  const roofFrontY = ghBaseY + ghFrontH;
  const roofRearY = ghBaseY + ghRearH;

  // Glass core: a tapered hexahedral mass. Build via a BufferGeometry box whose
  // top edge slopes down to the rear and whose top is inset (tumblehome). We
  // approximate with two stacked tapered boxes by using a custom shape: easiest
  // is a thin tilted slab per side plus end glass. Keep it simple and readable.

  // Side glass: one tilted slab per side spanning the door/quarter glass.
  const sideGlassLen = greenhouseLen - 0.26;
  for (const sign of [1, -1]) {
    const glass = box(sideGlassLen, (ghFrontH + ghRearH) / 2 - 0.06, 0.05, glassMat, false);
    glass.position.set(
      greenhouseCenterX,
      ghBaseY + (ghFrontH + ghRearH) / 4 + 0.05,
      sign * (ghHalfBaseW + ghHalfTopW) / 2,
    );
    glass.rotation.x = sign * 0.13; // tumblehome: lean the top inward
    g.add(glass);
  }

  // A central body-colored "core" between the two glass sides fills the cabin so
  // we don't see through to the far windows. Body-colored so the cabin reads as
  // a painted van rather than a black box; the glass sits just outboard of it.
  // Kept short and low enough to stay hidden behind the windshield and under the
  // roof (its rounded front used to poke out above the cowl as a silver canister).
  const coreLen = greenhouseLen - 0.7;
  const coreH = (ghFrontH + ghRearH) / 2 - 0.02;
  const core = box(coreLen, coreH, ghHalfTopW * 2 - 0.02, bodyMat, false);
  core.position.set(greenhouseCenterX - 0.27, ghBaseY + coreH / 2 + 0.02, 0);
  g.add(core);

  // Belt-line trim wrapping the base of the glass (so windows read as inset).
  const beltline = box(greenhouseLen, 0.07, carWidth * 0.95, trimMat);
  beltline.position.set(greenhouseCenterX, ghBaseY + 0.02, 0);
  g.add(beltline);
  // A thin bright belt strip along the base of the side windows (chrome cue).
  for (const sign of [1, -1]) {
    const strip = box(greenhouseLen - 0.2, 0.035, 0.03, chromeMat);
    strip.position.set(greenhouseCenterX, ghBaseY + 0.07, sign * (ghHalfBaseW + 0.02));
    g.add(strip);
  }

  // --- Raked windshield: a panel built from its two real endpoints, the cowl
  // (base) and the roof front edge (top), so it always aligns with the A-pillars.
  // The top sits well behind the base for a steep, cab-forward rake.
  const wsTopX = ghFrontX - 0.62;
  const wsDx = wsTopX - ghFrontX;
  const wsDy = roofFrontY - ghBaseY;
  const wsLen = Math.hypot(wsDx, wsDy);
  const windshield = box(0.06, wsLen, carWidth * 0.86, glassMat, false);
  windshield.position.set(ghFrontX + wsDx / 2, ghBaseY + wsDy / 2, 0);
  windshield.rotation.z = Math.atan2(-wsDx, wsDy); // local +Y runs base -> top
  g.add(windshield);

  // --- Rear glass / near-vertical tailgate window ---
  const rgLen = 0.34;
  const rearGlass = box(rgLen, ghRearH * 0.92, carWidth * 0.82, glassMat, false);
  rearGlass.position.set(ghBackX - rgLen * 0.1, roofRearY - ghRearH * 0.46, 0);
  rearGlass.rotation.z = -0.18; // gently raked tailgate
  g.add(rearGlass);

  // ===========================================================================
  // ROOF: the dominant top-down surface. We want a SLICK, CROWNED silver lid that
  // catches a bright sun-highlight streak and reads as glossy metal, not flat
  // grey. The crown is built by laying a wide, gently curved shell over the cabin
  // so the top-down view shows a light-to-dark shading gradient across the width.
  // ===========================================================================
  // Span the roof from the windshield TOP (ghFrontX - 0.62) back to the tailgate,
  // so it does not cantilever forward over the hood like a visor.
  const roofLen = greenhouseLen - 0.6;
  const roofTilt = Math.atan2(roofFrontY - roofRearY, greenhouseLen);
  const roofCenterX = greenhouseCenterX - 0.3;
  const roofMidY = (roofFrontY + roofRearY) / 2;
  const roofW = ghHalfTopW * 2;
  const roofLenAlong = roofLen / Math.cos(roofTilt);

  // CROWNED SHELL: a half-cylinder (axis = local X / fore-aft) laid over the cabin.
  // A real crowned cross-section means the surface normal sweeps from facing the
  // sky at the ridge to facing sideways at the eaves, so under the high sun it
  // shows a bright ridge highlight fading to darker edges (the form we want).
  const crownRadius = roofW * 1.05; // gentle dome (a tight radius humped up at the front)
  const crownDrop = 0.07; // how far the eaves sit below the ridge
  const crownGeo = new THREE.CylinderGeometry(
    crownRadius,
    crownRadius,
    roofLenAlong,
    36,
    1,
    true, // open-ended: no flat disc caps (they read as a chrome "tube end")
    -Math.asin(roofW / 2 / crownRadius), // span just the top arc...
    2 * Math.asin(roofW / 2 / crownRadius), // ...wide enough to cover the cabin
  );
  const roof = new THREE.Mesh(crownGeo, bodyMat);
  // Orient the cylinder axis (+Y) to local +X (fore-aft), then add the fore-aft
  // tilt so the front edge rides higher than the rear. Composing both as a single
  // Z rotation works because both are rotations about the lateral (local Z) axis.
  roof.rotation.z = Math.PI / 2 + roofTilt;
  // Sit the arc so its chord (eaves) is at the cabin top and the ridge crowns above.
  roof.position.set(roofCenterX, roofMidY - crownRadius + crownDrop + 0.02, 0);
  roof.castShadow = true;
  g.add(roof);

  // A thin body-colored fore-aft CHARACTER LINE / ridge cap down the crown center,
  // and two faint panel SEAMS either side, to break up the big roof panel.
  const ridgeY = roofMidY + crownDrop + 0.06;
  const ridge = box(roofLenAlong * 0.94, 0.02, 0.05, bodyMat, false);
  ridge.position.set(roofCenterX, ridgeY + 0.012, 0);
  ridge.rotation.z = roofTilt;
  g.add(ridge);
  for (const sz of [roofW * 0.24, -roofW * 0.24]) {
    const seam = box(roofLenAlong * 0.86, 0.012, 0.02, trimMat, false);
    seam.position.set(roofCenterX, ridgeY - 0.02, sz);
    seam.rotation.z = roofTilt;
    g.add(seam);
  }

  // ROOF RAILS: thin dark bars riding the eaves along both roof edges (a clear
  // minivan cue and a strong dark frame around the bright crown from above).
  const railGeo = new THREE.BoxGeometry(greenhouseLen * 0.82, 0.05, 0.06);
  for (const sz of [roofW * 0.46, -roofW * 0.46]) {
    const railBar = new THREE.Mesh(railGeo, lowerTrimMat);
    railBar.position.set(roofCenterX - 0.04, roofMidY + 0.07, sz);
    railBar.rotation.z = roofTilt;
    railBar.castShadow = true;
    g.add(railBar);
    // Small feet tying each rail down to the roof, fore and aft.
    for (const fx of [0.4, -0.4]) {
      const foot = box(0.06, 0.06, 0.05, lowerTrimMat, false);
      foot.position.set(roofCenterX + fx * greenhouseLen * 0.4, roofMidY + 0.04, sz);
      foot.rotation.z = roofTilt;
      g.add(foot);
    }
  }

  // MOONROOF: a clear dark-glass panel recessed into the FRONT of the crown, with
  // a bright chrome surround so it frames cleanly from the top-down view.
  const moonX = greenhouseCenterX + greenhouseLen * 0.17;
  const moonY = roofMidY + crownDrop + 0.05;
  const moonSurround = box(0.7, 0.02, roofW * 0.5, chromeMat, false);
  moonSurround.position.set(moonX, moonY + 0.002, 0);
  moonSurround.rotation.z = roofTilt;
  g.add(moonSurround);
  const moonroof = box(0.6, 0.03, roofW * 0.42, glassMat, false);
  moonroof.position.set(moonX, moonY + 0.02, 0);
  moonroof.rotation.z = roofTilt;
  g.add(moonroof);

  // Roof spoiler over the tailgate.
  const spoiler = box(0.16, 0.06, carWidth * 0.74, trimMat);
  spoiler.position.set(ghBackX + 0.06, roofRearY + 0.06, 0);
  g.add(spoiler);

  // Bright chrome window surround along the TOP of the side glass (an Odyssey cue
  // that, with the lower belt strip, frames the glass).
  for (const sign of [1, -1]) {
    const topStrip = box(greenhouseLen * 0.8, 0.03, 0.025, chromeMat);
    topStrip.position.set(
      greenhouseCenterX - 0.06,
      roofMidY - 0.02,
      sign * (ghHalfTopW + 0.012),
    );
    topStrip.rotation.z = roofTilt;
    g.add(topStrip);
  }

  // --- Body-colored A/B/C/D pillars dividing the side glass into panes ---
  // Each pillar is a thin body-colored post on the outer face of the glass.
  const pillarFracs = [0.02, 0.36, 0.64, 0.99]; // A, B, C, D as fraction of cabin len
  for (const frac of pillarFracs) {
    const px = ghBackX + frac * greenhouseLen;
    // Roof height at this X (linear taper front->rear).
    const t = (px - ghBackX) / greenhouseLen;
    const topY = roofRearY + t * (roofFrontY - roofRearY);
    const ph = topY - ghBaseY;
    const isEnd = frac < 0.06 || frac > 0.95;
    const thick = isEnd ? 0.13 : 0.1;
    for (const sign of [1, -1]) {
      const post = box(thick, ph, 0.06, bodyMat);
      post.position.set(px, ghBaseY + ph / 2, sign * (ghHalfBaseW + 0.015));
      post.rotation.x = sign * 0.07;
      g.add(post);
    }
  }

  // --- Black gloss rear-quarter glass: the Odyssey's signature wraparound dark
  // panel at the D-pillar that makes the greenhouse look like it floats. ---
  const quarterMat = new THREE.MeshStandardMaterial({
    color: 0x0b0d10,
    roughness: 0.12,
    metalness: 0.5,
  });
  for (const sign of [1, -1]) {
    const q = box(
      greenhouseLen * 0.27,
      (ghFrontH + ghRearH) / 2 - 0.02,
      0.04,
      quarterMat,
      false,
    );
    q.position.set(
      ghBackX + greenhouseLen * 0.135,
      ghBaseY + (ghFrontH + ghRearH) / 4 + 0.04,
      sign * (ghHalfBaseW + 0.03),
    );
    q.rotation.x = sign * 0.13;
    g.add(q);
  }

  // --- Bumpers (body color), front and rear ---
  const bumperH = 0.26;
  const bumperY = wheelRadius + bumperH / 2 - 0.01;
  const frontBumper = roundedBox(0.58, bumperH, carWidth * 0.82, 0.28, bodyMat);
  frontBumper.position.set(front - 0.2, bumperY, 0);
  g.add(frontBumper);
  const rearBumperMesh = roundedBox(0.2, bumperH, carWidth * 0.98, 0.07, bodyMat);
  rearBumperMesh.position.set(rearBumper + 0.07, bumperY, 0);
  g.add(rearBumperMesh);

  // --- Front grille (dark) with a horizontal chrome bar, plus a lower intake ---
  // Grille sits high under the hood lip; chrome bar spans the headlights.
  const grilleY = bumperY + bumperH / 2 + 0.16;
  const grille = box(0.05, 0.18, carWidth * 0.5, trimMat);
  grille.position.set(front - 0.03, grilleY, 0);
  g.add(grille);
  const grilleBar = box(0.06, 0.07, carWidth * 0.84, chromeMat);
  grilleBar.position.set(front - 0.005, grilleY + 0.07, 0);
  g.add(grilleBar);
  // Lower bumper intake (dark slot).
  const intake = box(0.05, 0.1, carWidth * 0.62, lowerTrimMat);
  intake.position.set(front - 0.05, bumperY - bumperH / 2 + 0.06, 0);
  g.add(intake);

  // --- Wheels: tire + alloy hub with spokes; front axle at +W, rear at 0 ---
  const halfTrack = halfW - wheelWidth / 2 + 0.02;
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
  const hubGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.6,
    wheelRadius * 0.6,
    wheelWidth + 0.02,
    18,
  );
  const capGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.22,
    wheelRadius * 0.22,
    wheelWidth + 0.04,
    14,
  );
  const spokeGeo = new THREE.BoxGeometry(wheelRadius * 1.1, 0.06, wheelWidth + 0.03);
  for (const axleX of [W, 0]) {
    for (const side of [halfTrack, -halfTrack]) {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.x = WHEEL_LATERAL;
      tire.position.set(axleX, wheelRadius, side);
      tire.castShadow = true;
      g.add(tire);

      const hub = new THREE.Mesh(hubGeo, rimMat);
      hub.rotation.x = WHEEL_LATERAL;
      hub.position.set(axleX, wheelRadius, side);
      g.add(hub);

      // Spoke bars over a dark hub gap read as an alloy from a distance.
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.x = WHEEL_LATERAL;
        spoke.rotation.z = (s * Math.PI) / 5;
        spoke.position.set(axleX, wheelRadius, side);
        g.add(spoke);
      }
      const cap = new THREE.Mesh(capGeo, chromeMat);
      cap.rotation.x = WHEEL_LATERAL;
      cap.position.set(axleX, wheelRadius, side);
      g.add(cap);

      // Subtle body-colored wheel-arch lip over each tire.
      const arch = roundedBox(wheelRadius * 2.4, 0.12, wheelWidth + 0.1, 0.05, lowerTrimMat);
      arch.position.set(axleX, wheelRadius * 1.95, side);
      g.add(arch);
    }
  }

  // --- Side mirrors on the front doors ---
  const mirrorStalkGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8);
  const mirrorX = ghFrontX + 0.08;
  const mirrorY = lowerTopY - 0.08;
  for (const side of [halfW, -halfW]) {
    const stalk = new THREE.Mesh(mirrorStalkGeo, trimMat);
    stalk.rotation.x = WHEEL_LATERAL;
    stalk.position.set(mirrorX, mirrorY, side + Math.sign(side) * 0.07);
    g.add(stalk);
    const housing = roundedBox(0.14, 0.11, 0.07, 0.04, bodyMat);
    housing.position.set(mirrorX, mirrorY + 0.03, side + Math.sign(side) * 0.16);
    g.add(housing);
  }

  // --- Lights ---
  // Swept headlights wrapping the front corners, riding the chrome bar line.
  const headInset = halfW - 0.26;
  const headY = grilleY + 0.07;
  for (const side of [headInset, -headInset]) {
    const head = roundedBox(0.08, 0.14, 0.4, 0.04, headMat);
    head.position.set(front - 0.04, headY, side);
    head.rotation.y = Math.sign(side) * 0.22; // sweep back at the corner
    g.add(head);
  }
  // Tall wraparound tail lights up each rear corner plus a light bar across.
  const tailY0 = bumperY + bumperH / 2;
  for (const side of [halfW - 0.05, -(halfW - 0.05)]) {
    const tail = roundedBox(0.06, 0.48, 0.16, 0.03, tailMat);
    tail.position.set(rearBumper + 0.02, tailY0 + 0.24, side);
    g.add(tail);
  }
  const tailBar = box(0.05, 0.09, carWidth * 0.7, tailMat);
  tailBar.position.set(rearBumper + 0.03, tailY0 + 0.4, 0);
  g.add(tailBar);

  // --- License plates ---
  const plateGeo = new THREE.BoxGeometry(0.04, 0.16, 0.34);
  const frontPlate = new THREE.Mesh(plateGeo, plateMat);
  frontPlate.position.set(front - 0.04, bumperY - 0.06, 0);
  g.add(frontPlate);
  const rearPlate = new THREE.Mesh(plateGeo, plateMat);
  rearPlate.position.set(rearBumper + 0.04, bumperY - 0.02, 0);
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
    color: 0x35383b,
    roughness: 0.5,
    metalness: 0.8,
  });
  const plankMat = new THREE.MeshStandardMaterial({
    color: 0x7a6a52, // weathered wood
    roughness: 0.85,
    metalness: 0.05,
  });
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x2c2e30,
    roughness: 0.5,
    metalness: 0.75,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x111114,
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

  // --- Planked deck (several boards with thin gaps -> planked look) ---
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

  // --- Low side rails along both long edges, on short stake posts ---
  const railH = 0.16;
  const railThick = 0.05;
  const railY = deckTopY + plankH / 2 + railH / 2 + 0.06;
  const railSide = halfW - railThick / 2;
  const postGeo = new THREE.BoxGeometry(0.05, 0.12, 0.05);
  for (const side of [railSide, -railSide]) {
    const rail = box(deckLength, railH, railThick, railMat);
    rail.position.set(deckCenterX, railY, side);
    g.add(rail);
    // A few stake posts under the side rail.
    for (let i = 0; i < 4; i++) {
      const post = new THREE.Mesh(postGeo, railMat);
      const px = deckBack + 0.3 + (i / 3) * (deckLength - 0.6);
      post.position.set(px, railY - railH / 2 - 0.05, side);
      g.add(post);
    }
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

/**
 * Load the licensed glTF van into `parent`, normalized to our conventions: scaled
 * so its length matches carLength, centered between the bumpers (rear-axle origin),
 * sitting on the ground. ("Van" by jeremy, via Poly Pizza, CC-BY 3.0; longest axis
 * is X = forward.) Async; the mesh pops in when loaded.
 */
function loadGltfCar(gs: GameState, parent: THREE.Group): void {
  const { carLength, carFrontOverhang } = gs.rig;
  const rearBumper = -(carLength - carFrontOverhang);
  const bodyCenterX = (carFrontOverhang + rearBumper) / 2;

  new GLTFLoader().load(
    "/models/van.glb",
    (gltf) => {
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = carLength / Math.max(size.x, 1e-3); // source: longest axis is X
      model.scale.setScalar(scale);
      model.position.set(
        bodyCenterX - center.x * scale,
        -box.min.y * scale, // sit on the ground
        -center.z * scale,
      );
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = true;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((mm) => mm && (mm.side = THREE.DoubleSide));
        }
      });
      parent.add(model);
    },
    undefined,
    (err) => {
      // eslint-disable-next-line no-console
      console.warn("van.glb failed to load", err);
    },
  );
}

export function buildRig(gs: GameState): RigView {
  const group = new THREE.Group();
  const carProc = buildCar(gs);
  const carGltf = new THREE.Group();
  carGltf.visible = false;
  loadGltfCar(gs, carGltf);
  const trailerGroup = buildTrailer(gs);
  group.add(carProc, carGltf, trailerGroup);

  return {
    group,
    update(gs2: GameState, derived: PhysicsDerived): void {
      placeObject(carProc, gs2.physics, gs2.physics.carHeading);
      placeObject(carGltf, gs2.physics, gs2.physics.carHeading);
      placeObject(trailerGroup, derived.trailerAxle, derived.trailerHeading);
    },
    setCarStyle(style: CarStyle): void {
      const useGltf = style === "gltf";
      carGltf.visible = useGltf;
      carProc.visible = !useGltf;
    },
  };
}
