import * as THREE from "three";
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

export interface RigView {
  group: THREE.Group;
  update(gs: GameState, derived: PhysicsDerived): void;
}

const WHEEL_LATERAL = Math.PI / 2; // rotate cylinder axis from +Y to +Z (lateral)

/**
 * Tag a FRONT-wheel mesh so rig.update yaws it about its own vertical (kingpin)
 * axis to show the tires steering. The "YXZ" order makes the later rotation.y a
 * clean vertical yaw applied OUTSIDE the lateral/spoke orientation; at rotation.y=0
 * it is identical to the default order, so the static (straight) look is unchanged.
 */
function steerWheel<T extends THREE.Object3D>(m: T): T {
  m.userData.steer = true;
  m.rotation.order = "YXZ";
  return m;
}

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

// Dispatcher: pick the tow-vehicle model from the rig's optional vehicleType.
// "minivan" (default) and the single-axle trailer path are byte-for-byte the
// original, carefully-tuned Honda Odyssey; new types are additive.
function buildCar(gs: GameState): THREE.Group {
  const t = gs.rig.vehicleType;
  return t === "suv" ? buildSuv(gs) : t === "tractor" ? buildTractor(gs) : buildMinivan(gs);
}

function buildMinivan(gs: GameState): THREE.Group {
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
    // Center the arc on +X so that after the +Z/2 axis rotation it faces UP (theta=0
    // is +Z, which the rotation leaves sideways; +pi/2 puts it overhead as intended).
    Math.PI / 2 - Math.asin(roofW / 2 / crownRadius),
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
    // Front wheels (axleX === W) steer: tag their meshes so rig.update yaws them.
    const t = (m: THREE.Object3D): THREE.Object3D => (axleX === W ? steerWheel(m) : m);
    for (const side of [halfTrack, -halfTrack]) {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.x = WHEEL_LATERAL;
      tire.position.set(axleX, wheelRadius, side);
      tire.castShadow = true;
      g.add(t(tire));

      const hub = new THREE.Mesh(hubGeo, rimMat);
      hub.rotation.x = WHEEL_LATERAL;
      hub.position.set(axleX, wheelRadius, side);
      g.add(t(hub));

      // Spoke bars over a dark hub gap read as an alloy from a distance.
      for (let s = 0; s < 5; s++) {
        const spoke = new THREE.Mesh(spokeGeo, rimMat);
        spoke.rotation.x = WHEEL_LATERAL;
        spoke.rotation.z = (s * Math.PI) / 5;
        spoke.position.set(axleX, wheelRadius, side);
        g.add(t(spoke));
      }
      const cap = new THREE.Mesh(capGeo, chromeMat);
      cap.rotation.x = WHEEL_LATERAL;
      cap.position.set(axleX, wheelRadius, side);
      g.add(t(cap));

      // Subtle body-colored wheel-arch lip over each tire (stays with the body).
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

// Dispatcher: pick the trailer model from the rig's optional trailerType. The
// "utility-single" (default) path is byte-for-byte the original utility trailer.
function buildTrailer(gs: GameState): THREE.Group {
  const t = gs.rig.trailerType;
  return t === "utility-dual"
    ? buildDualTrailer(gs)
    : t === "ag"
      ? buildAgTrailer(gs)
      : t === "cargo"
        ? buildCargoTrailer(gs)
        : buildUtilityTrailer(gs);
}

// Full-height enclosed cargo trailer: the open-trailer chassis (frame, wheels, tongue,
// lights) with a tall opaque box enclosing the deck. The box front faces the tow
// vehicle, so it blocks the backup camera; the rear doors face the way you are backing.
function buildCargoTrailer(gs: GameState): THREE.Group {
  const g = buildUtilityTrailer(gs); // chassis + wheels + tongue; deck cargo is hidden inside
  const { D, trailerWidth, trailerRearOverhang } = gs.rig;
  const deckFront = D;
  const deckBack = -trailerRearOverhang;
  const len = deckFront - deckBack;
  const cx = (deckFront + deckBack) / 2;
  const halfW = trailerWidth / 2;
  const floorY = 0.3 + 0.1 + 0.14 + 0.04; // matches the utility deck top (wheelR + frame + planks)
  const boxH = 1.95; // taller than the ~1.75 m backup camera, so it reads as blocked

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xe9ebec, roughness: 0.5, metalness: 0.25 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x3f4348, roughness: 0.5, metalness: 0.6 });

  const shell = box(len, boxH, trailerWidth, bodyMat);
  shell.position.set(cx, floorY + boxH / 2, 0);
  g.add(shell);
  const roof = box(len + 0.06, 0.06, trailerWidth + 0.06, trimMat);
  roof.position.set(cx, floorY + boxH + 0.02, 0);
  g.add(roof);
  // Vertical corner posts.
  for (const sx of [deckFront, deckBack]) {
    for (const sz of [halfW, -halfW]) {
      const post = box(0.06, boxH, 0.06, trimMat);
      post.position.set(sx, floorY + boxH / 2, sz);
      g.add(post);
    }
  }
  // Rear double doors (on the tail face): a center seam and two handles.
  const seam = box(0.03, boxH * 0.9, 0.03, trimMat);
  seam.position.set(deckBack - 0.01, floorY + boxH / 2, 0);
  g.add(seam);
  for (const hz of [0.2, -0.2]) {
    const handle = box(0.04, 0.24, 0.04, trimMat);
    handle.position.set(deckBack - 0.02, floorY + boxH * 0.5, hz);
    g.add(handle);
  }
  return g;
}

function buildUtilityTrailer(gs: GameState): THREE.Group {
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

// -----------------------------------------------------------------------------
// SUV: a Hyundai Ioniq 5 - a sleek modern EV crossover.
//
// The look: lower and cleaner than a truck, a very short hood, a nearly flat
// roof with a long flat greenhouse, squared-off (octagonal) wheel arches with
// black cladding, and the signature "Parametric Pixel" lights - a grid of small
// square emissive blocks at each corner. Light two-tone: a pale sand/grey glossy
// body over darker grey lower cladding. Origin = rear axle, LOCAL +X forward.
// -----------------------------------------------------------------------------

function buildSuv(gs: GameState): THREE.Group {
  const { carLength, carWidth, carFrontOverhang, W } = gs.rig;
  const g = new THREE.Group();

  const front = carFrontOverhang;
  const rearBumper = -(carLength - carFrontOverhang);
  const bodyCenterX = (front + rearBumper) / 2;
  const halfW = carWidth / 2;

  // --- Materials (shared across this car) ---
  // Glossy clearcoat paint like the minivan, but a cool pale grey-green so the
  // Ioniq reads as a fresh modern EV. Clearcoat gives a crisp top-down highlight.
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x6c8168, // muted sage / forest green (matches the reference Ioniq 5)
    roughness: 0.16,
    metalness: 0.5,
    envMapIntensity: 1.4,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  });
  // Matte dark anthracite for the lower cladding and wheel arches (clear contrast
  // against the pale body, so the two-tone reads from straight overhead).
  const claddingMat = new THREE.MeshStandardMaterial({
    color: 0x9ba0a4, // satin silver-grey lower cladding (as on the reference green Ioniq 5)
    roughness: 0.6,
    metalness: 0.2,
  });
  // Near-black gloss for the contrast roof / floating-roof cap (a strong, clean
  // two-tone read in the primary top-down camera).
  const roofMat = new THREE.MeshPhysicalMaterial({
    color: 0x33373d, // lighter graphite roof so the top-down is not a black slab
    roughness: 0.3,
    metalness: 0.4,
    envMapIntensity: 1.2,
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x2c3a48, // tinted glazing, lifted off pure black with a cool blue cast
    roughness: 0.08,
    metalness: 0.6,
    transparent: true,
    opacity: 0.7,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0x0d0f12,
    roughness: 0.4,
    metalness: 0.4,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x16161a,
    roughness: 0.92,
    metalness: 0.05,
  });
  // Bright machined-alloy face for the aero wheels.
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xcdd1d6,
    roughness: 0.24,
    metalness: 0.95,
  });
  // Dark spoke-gap material so the alloy face reads as cut-outs over a dark dish.
  const rimDarkMat = new THREE.MeshStandardMaterial({
    color: 0x202327,
    roughness: 0.6,
    metalness: 0.4,
  });
  // Emissive "Parametric Pixel" lights (cool white front, red rear). Punchy
  // emissive so the little squares clearly glow in both views.
  const pixelMat = new THREE.MeshStandardMaterial({
    color: 0xf2f6ff,
    emissive: 0xbfd6ff,
    emissiveIntensity: 1.6,
    roughness: 0.18,
    metalness: 0.1,
  });
  const tailPixelMat = new THREE.MeshStandardMaterial({
    color: 0xf03224,
    emissive: 0xd61608,
    emissiveIntensity: 1.7,
    roughness: 0.22,
  });

  const wheelRadius = 0.45; // big 20" aero wheels relative to a low, wide body
  const wheelWidth = 0.28;

  // The Ioniq 5 is LOW, WIDE and PLANTED: a single tall, full-width lower mass
  // that fills the track (wheels tuck under flush, not poking out), then a low
  // flat greenhouse sitting just inboard, then a near-flat floating dark roof.
  // Overall height ~1.6 m. The body is the dominant mass; the cabin is short.
  const lowerH = 0.52; // lower main body so the car sits low and wide, not jeep-tall
  const lowerY = wheelRadius + 0.02 + lowerH / 2;
  const lowerTopY = lowerY + lowerH / 2;

  // --- Lower body: a clean full-width rounded slab, nearly full length, short
  // overhangs. It is as wide as the track so the SUV reads planted from above;
  // a modest corner radius keeps it angular-yet-smooth like the real car.
  const bodyLen = carLength - 0.06;
  const bodyW = carWidth; // full width so the wheels sit flush under the flanks
  const body = roundedBox(bodyLen, lowerH, bodyW, 0.22, bodyMat, true, 6);
  body.position.set(bodyCenterX, lowerY, 0);
  g.add(body);

  // A crisp body-side character line (the Ioniq's signature pressed crease)
  // running fore-aft along each flank, just below the beltline.
  for (const sign of [1, -1]) {
    const crease = box(bodyLen * 0.82, 0.04, 0.04, claddingMat, false);
    crease.position.set(bodyCenterX, lowerY + 0.04, sign * (halfW + 0.005));
    g.add(crease);
  }
  // Flush door-handle cues: two small dark recessed slots on each flank at the
  // beltline (the Ioniq's pop-out handles sit flush in the door skin).
  const handleMat = trimMat;
  for (const sign of [1, -1]) {
    for (const hx of [bodyCenterX + bodyLen * 0.12, bodyCenterX - bodyLen * 0.12]) {
      const handle = box(0.16, 0.035, 0.025, handleMat, false);
      handle.position.set(hx, lowerY + lowerH * 0.28, sign * (halfW + 0.01));
      g.add(handle);
    }
  }

  // Dark cladding wrapping the whole lower edge (rocker + bumper valances). A
  // little taller so the dark/pale two-tone reads clearly from above.
  const cladH = 0.24;
  const cladding = roundedBox(carLength - 0.02, cladH, carWidth + 0.04, 0.07, claddingMat);
  cladding.position.set(bodyCenterX, wheelRadius + 0.05 + cladH / 2 - 0.02, 0);
  g.add(cladding);

  // Short flat clamshell hood; the EV nose is very short and nearly horizontal.
  const ghFrontX = front - carLength * 0.2; // base of the steeply raked A-pillar
  const hoodLen = front - 0.08 - ghFrontX;
  const hoodX = (front - 0.08 + ghFrontX) / 2;
  const hood = roundedBox(hoodLen, 0.14, carWidth * 0.86, 0.06, bodyMat);
  hood.position.set(hoodX, lowerTopY - 0.06, 0);
  hood.rotation.z = -0.03; // almost flat
  g.add(hood);
  // Clamshell hood shut-lines: two fore-aft seams framing the hood from above.
  for (const sign of [1, -1]) {
    const seam = box(hoodLen * 0.92, 0.02, 0.02, trimMat, false);
    seam.position.set(hoodX, lowerTopY + 0.005, sign * carWidth * 0.34);
    seam.rotation.z = -0.03;
    g.add(seam);
  }
  // Clamshell hood shut-line across the front edge + a small Hyundai logo cue
  // centered on the hood front (a bright slim badge on the clean flat face).
  const hoodFrontSeam = box(0.02, 0.02, carWidth * 0.78, trimMat, false);
  hoodFrontSeam.position.set(front - 0.09, lowerTopY - 0.01, 0);
  g.add(hoodFrontSeam);
  const logo = box(0.04, 0.04, 0.14, rimMat, false);
  logo.position.set(front - 0.02, lowerTopY - 0.05, 0);
  g.add(logo);

  // ===========================================================================
  // GREENHOUSE: a SHALLOW, long, nearly-flat cabin that sits LOW on the tall body
  // and tucks inboard, so the whole vehicle reads wide and planted rather than
  // top-heavy. The glass forms a thin dark band; a low near-black floating roof
  // caps it and tapers gently back to a small kicked-up spoiler over the hatch.
  // ===========================================================================
  const ghBackX = rearBumper + carLength * 0.07; // near-vertical tailgate base
  const greenhouseLen = ghFrontX - ghBackX;
  const greenhouseCenterX = (ghFrontX + ghBackX) / 2;
  const ghBaseY = lowerTopY - 0.05;
  const ghH = 0.26; // very shallow cabin: a low sleek glass band, not a tall box
  const roofY = ghBaseY + ghH;
  // Cabin sits clearly INBOARD of the wide flanks (tumblehome + floating roof).
  const ghHalfW = carWidth * 0.34;

  // Side glass: a flat, mostly upright slab per side with a little tumblehome.
  const sideGlassLen = greenhouseLen - 0.46;
  for (const sign of [1, -1]) {
    const glass = box(sideGlassLen, ghH - 0.05, 0.05, glassMat, false);
    glass.position.set(greenhouseCenterX - 0.02, ghBaseY + ghH / 2, sign * ghHalfW);
    glass.rotation.x = sign * 0.08;
    g.add(glass);
  }

  // Body-colored core so we don't see through to the far glass. Kept just under
  // the glass-band height so it stays hidden behind the dark glazing.
  const core = box(greenhouseLen - 0.55, ghH - 0.03, ghHalfW * 2 - 0.04, bodyMat, false);
  core.position.set(greenhouseCenterX - 0.04, ghBaseY + ghH / 2, 0);
  g.add(core);

  // --- Raked windshield from cowl to flat roof front edge ---
  const wsTopX = ghFrontX - 0.5;
  const wsDx = wsTopX - ghFrontX;
  const wsDy = roofY - ghBaseY;
  const wsLen = Math.hypot(wsDx, wsDy);
  const windshield = box(0.06, wsLen, carWidth * 0.84, glassMat, false);
  windshield.position.set(ghFrontX + wsDx / 2, ghBaseY + wsDy / 2, 0);
  windshield.rotation.z = Math.atan2(-wsDx, wsDy);
  g.add(windshield);

  // --- Near-vertical tailgate glass ---
  const rearGlass = box(0.28, ghH * 0.9, carWidth * 0.82, glassMat, false);
  rearGlass.position.set(ghBackX + 0.03, ghBaseY + ghH * 0.46, 0);
  rearGlass.rotation.z = -0.1;
  g.add(rearGlass);

  // --- FLOATING ROOF: a low, wide, gently rounded clamshell lid in near-black.
  // It runs flat then tapers a touch toward the rear, giving the strong two-tone
  // "floating roof" read from straight overhead while staying low and integrated.
  const roofLen = wsTopX - (ghBackX + 0.05);
  const roofX = (wsTopX + ghBackX) / 2;
  // Narrow + slightly shorter dark roof so a generous band of GREEN body shows
  // on both sides and front/rear from straight overhead (not a black slab).
  const roofW = ghHalfW * 2 - 0.06;
  const roof = roundedBox(roofLen * 0.94, 0.09, roofW, 0.06, roofMat, true, 5);
  roof.position.set(roofX, roofY - 0.02, 0);
  roof.rotation.z = 0.012; // a whisper of rear taper
  g.add(roof);
  // Small kicked-up spoiler at the top of the near-vertical hatch.
  const spoiler = box(0.12, 0.04, roofW, roofMat);
  spoiler.position.set(ghBackX + 0.02, roofY + 0.0, 0);
  g.add(spoiler);
  // A modest glass roof panel inset into the FRONT of the lid (the real Ioniq 5
  // has a moderate glass panel, not a full black roof). Kept narrow and short so
  // the surrounding roof + body still read predominantly as paint from above.
  const sunroof = box(roofLen * 0.5, 0.02, roofW * 0.66, glassMat, false);
  sunroof.position.set(roofX - roofLen * 0.06, roofY + 0.03, 0);
  g.add(sunroof);

  // --- Black gloss B/C pillars + bright window surround (clean modern frame) ---
  const surroundMat = new THREE.MeshStandardMaterial({
    color: 0x0c0e12,
    roughness: 0.25,
    metalness: 0.6,
  });
  for (const frac of [0.34, 0.66]) {
    const px = ghBackX + frac * greenhouseLen;
    for (const sign of [1, -1]) {
      const post = box(0.09, ghH - 0.03, 0.06, surroundMat);
      post.position.set(px, ghBaseY + ghH / 2, sign * (ghHalfW + 0.012));
      post.rotation.x = sign * 0.08;
      g.add(post);
    }
  }
  // Blacked-out A and D pillars so the greenhouse reads as one wraparound glass
  // band (the clean "black-out pillar" look). Kept just under the roofline so
  // they never poke up above the lid as little tabs.
  for (const frac of [0.04, 0.96]) {
    const px = ghBackX + frac * greenhouseLen;
    for (const sign of [1, -1]) {
      const post = box(0.11, ghH - 0.08, 0.055, surroundMat);
      post.position.set(px, ghBaseY + (ghH - 0.08) / 2, sign * (ghHalfW + 0.012));
      post.rotation.x = sign * 0.08;
      g.add(post);
    }
  }
  // Bright belt strip along the base of the side windows.
  for (const sign of [1, -1]) {
    const strip = box(sideGlassLen, 0.03, 0.03, rimMat);
    strip.position.set(greenhouseCenterX - 0.02, ghBaseY + 0.03, sign * (ghHalfW + 0.02));
    g.add(strip);
  }

  // --- Bumpers (body color), short and clean ---
  const bumperH = 0.26;
  const bumperY = wheelRadius + bumperH / 2 + 0.0;
  const frontBumper = roundedBox(0.34, bumperH, carWidth * 0.9, 0.1, bodyMat);
  frontBumper.position.set(front - 0.12, bumperY, 0);
  g.add(frontBumper);
  const rearBumperMesh = roundedBox(0.22, bumperH, carWidth * 0.96, 0.08, bodyMat);
  rearBumperMesh.position.set(rearBumper + 0.08, bumperY, 0);
  g.add(rearBumperMesh);

  // ===========================================================================
  // PARAMETRIC PIXEL LIGHTS: small SQUARE pixel clusters set into dark recessed
  // housings. The front clusters sit LOW at the outer front corners (not floating
  // mid-face); the rear is the iconic FULL-WIDTH pixel light bar. Both wrap a
  // touch onto the top face so they also read in the primary top-down camera.
  // ===========================================================================
  const pixGeo = new THREE.BoxGeometry(0.05, 0.07, 0.07);
  const pixStep = 0.09;

  // Front: a clean flat face. A dark recessed pocket low at each outer corner
  // holds a tight 2x2 square pixel cluster (cool white). A thin V-shaped DRL
  // line links the pockets up across the nose (the Ioniq's V positioning lamp).
  const headY = bumperY + bumperH / 2 + 0.18; // low on the nose, by the corners
  for (const sideC of [halfW - 0.2, -(halfW - 0.2)]) {
    const pocket = box(0.05, 0.22, 0.26, trimMat);
    pocket.position.set(front - 0.02, headY, sideC);
    g.add(pocket);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const px = new THREE.Mesh(pixGeo, pixelMat);
        px.position.set(
          front + 0.01,
          headY + 0.05 - r * pixStep,
          sideC - 0.045 + c * pixStep,
        );
        g.add(px);
      }
    }
  }
  // Thin V-shaped DRL bars climbing inboard-up from each corner pocket.
  for (const sign of [1, -1]) {
    const drl = box(0.05, 0.03, carWidth * 0.34, pixelMat, false);
    drl.position.set(front - 0.01, headY + 0.16, sign * carWidth * 0.18);
    drl.rotation.x = sign * 0.18;
    g.add(drl);
  }
  // Top-of-corner echo so the front corners glow in the top-down camera: a tight
  // pixel pair laid into the hood-front lip right at each front top corner.
  for (const sideC of [halfW - 0.16, -(halfW - 0.16)]) {
    for (let c = 0; c < 2; c++) {
      const px = new THREE.Mesh(pixGeo, pixelMat);
      px.position.set(front - 0.07, lowerTopY - 0.01, sideC - 0.045 + c * pixStep);
      g.add(px);
    }
  }

  // Rear: the iconic FULL-WIDTH parametric pixel light bar spanning the tailgate,
  // set into a dark recessed band so the red pixels read as one sharp strip.
  const tailY = bumperY + bumperH / 2 + 0.16;
  const rearBand = box(0.05, 0.2, carWidth * 0.96, trimMat);
  rearBand.position.set(rearBumper + 0.0, tailY, 0);
  g.add(rearBand);
  const nRear = 21;
  const rearSpan = carWidth * 0.88;
  for (const dy of [0.06, -0.06]) {
    for (let i = 0; i < nRear; i++) {
      const px = new THREE.Mesh(pixGeo, tailPixelMat);
      const z = -rearSpan / 2 + (i / (nRear - 1)) * rearSpan;
      px.position.set(rearBumper + 0.02, tailY + dy, z);
      g.add(px);
    }
  }
  // Rear bar echoed onto the TOP of the tail so the full-width red band also
  // glows in the top-down camera (laid into the tailgate top lip).
  for (let i = 0; i < nRear; i++) {
    const px = new THREE.Mesh(pixGeo, tailPixelMat);
    const z = -rearSpan / 2 + (i / (nRear - 1)) * rearSpan;
    px.position.set(rearBumper + 0.07, lowerTopY - 0.01, z);
    g.add(px);
  }

  // --- Closed grille-less nose panel with a subtle sensor strip ---
  const nosePanel = box(0.05, 0.14, carWidth * 0.5, trimMat);
  nosePanel.position.set(front - 0.02, bumperY - 0.02, 0);
  g.add(nosePanel);

  // --- Side mirrors ---
  const mirrorStalkGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.1, 8);
  const mirrorX = ghFrontX + 0.05;
  const mirrorY = lowerTopY - 0.06;
  for (const side of [halfW, -halfW]) {
    const stalk = new THREE.Mesh(mirrorStalkGeo, trimMat);
    stalk.rotation.x = WHEEL_LATERAL;
    stalk.position.set(mirrorX, mirrorY, side + Math.sign(side) * 0.06);
    g.add(stalk);
    const housing = roundedBox(0.13, 0.1, 0.06, 0.03, bodyMat);
    housing.position.set(mirrorX, mirrorY + 0.02, side + Math.sign(side) * 0.14);
    g.add(housing);
  }

  // --- Wheels with SQUARED-OFF (octagonal) black wheel arches ---
  const halfTrack = halfW - wheelWidth / 2 + 0.02;
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
  // A bright machined alloy DISC face (the Ioniq aero wheels read as a near-solid
  // turbine face), with a dark recessed ring and a small hub cap.
  const faceGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.88,
    wheelRadius * 0.88,
    0.04,
    24,
  );
  const dishGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.66,
    wheelRadius * 0.66,
    wheelWidth + 0.02,
    20,
  );
  const capGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.2,
    wheelRadius * 0.2,
    wheelWidth + 0.06,
    16,
  );
  // Aero spokes: short thin radial blades CONFINED to the outward alloy face.
  // Their length (local X) is < the face radius so they never reach across the
  // hub or poke past the tire; they lie flat in the wheel's vertical XY face
  // plane (no lateral tip), so they read as a clean turbine disc, not bars.
  const spokeLen = wheelRadius * 0.5; // stays well inside the bright face radius
  const bladeGeo = new THREE.BoxGeometry(spokeLen, 0.06, 0.02);
  for (const axleX of [W, 0]) {
    // Front wheels (axleX === W) steer: tag their meshes so rig.update yaws them.
    const t = (m: THREE.Object3D): THREE.Object3D => (axleX === W ? steerWheel(m) : m);
    for (const side of [halfTrack, -halfTrack]) {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.x = WHEEL_LATERAL;
      tire.position.set(axleX, wheelRadius, side);
      tire.castShadow = true;
      g.add(t(tire));

      // Dark inner dish so the bright face reads as a thin outboard alloy.
      const dish = new THREE.Mesh(dishGeo, rimDarkMat);
      dish.rotation.x = WHEEL_LATERAL;
      dish.position.set(axleX, wheelRadius, side);
      g.add(t(dish));

      // Bright machined face, sitting just outboard of the tire centerline.
      const faceZ = side + Math.sign(side) * (wheelWidth / 2 + 0.005);
      const face = new THREE.Mesh(faceGeo, rimMat);
      face.rotation.x = WHEEL_LATERAL;
      face.position.set(axleX, wheelRadius, faceZ);
      g.add(t(face));

      // Dark turbine cut-outs SET INTO the face: short radial spokes laid flat in
      // the wheel's vertical XY plane (no lateral tip), each pushed outward from
      // the hub so it sits between the centre cap and the rim lip, fully within
      // the bright disc. The face is at faceZ; the spokes sit a hair proud of it.
      const spokeZ = faceZ + Math.sign(side) * 0.011;
      const spokeMid = wheelRadius * 0.5; // mid-radius of each spoke
      const nSpokes = 8;
      for (let s = 0; s < nSpokes; s++) {
        const a = (s * 2 * Math.PI) / nSpokes + 0.2;
        const blade = new THREE.Mesh(bladeGeo, rimDarkMat);
        blade.rotation.z = a;
        // Offset along the spoke's own (rotated) radial direction.
        blade.position.set(
          axleX + spokeMid * Math.cos(a),
          wheelRadius + spokeMid * Math.sin(a),
          spokeZ,
        );
        g.add(t(blade));
      }
      const cap = new THREE.Mesh(capGeo, rimMat);
      cap.rotation.x = WHEEL_LATERAL;
      cap.position.set(axleX, wheelRadius, side);
      g.add(t(cap));

      // Squared-off arch: build the over-tire trim from short straight cladding
      // segments arranged as a flat-topped (octagonal) arch rather than a curve.
      const archAngles = [0.14, 0.37, 0.63, 0.86]; // four facets: flat-top octagon
      for (const af of archAngles) {
        const a = Math.PI * af;
        const segLen = wheelRadius * 0.74;
        const seg = box(segLen, 0.11, wheelWidth + 0.16, claddingMat);
        const ar = wheelRadius + 0.12;
        seg.position.set(axleX + ar * Math.cos(a), wheelRadius + ar * Math.sin(a), side);
        seg.rotation.z = a - Math.PI / 2;
        g.add(seg);
      }
      // Vertical side flares closing the arch down to the cladding.
      for (const sx of [1, -1]) {
        const flare = box(0.11, 0.36, wheelWidth + 0.16, claddingMat);
        flare.position.set(axleX + sx * (wheelRadius + 0.07), wheelRadius + 0.06, side);
        g.add(flare);
      }
    }
  }

  return g;
}

// -----------------------------------------------------------------------------
// TRACTOR: a compact farm tractor.
//
// The look: SMALL front wheels, BIG rear wheels, a tall narrow hood up front, a
// glassy cab toward the rear, a vertical exhaust stack, green (John Deere-ish)
// paint with yellow rims. Origin = rear axle, LOCAL +X forward.
// -----------------------------------------------------------------------------

function buildTractor(gs: GameState): THREE.Group {
  const { carLength, carWidth, carFrontOverhang, W } = gs.rig;
  const g = new THREE.Group();

  const front = carFrontOverhang; // front axle is at +W; nose extends to +front
  const rear = -(carLength - carFrontOverhang);
  const halfW = carWidth / 2;

  // --- Materials ---
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0x2f7d32, // tractor green
    roughness: 0.35,
    metalness: 0.4,
    envMapIntensity: 1.1,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
  });
  const yellowMat = new THREE.MeshStandardMaterial({
    color: 0xf2c200, // wheel rims / trim yellow
    roughness: 0.45,
    metalness: 0.3,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x222428,
    roughness: 0.6,
    metalness: 0.4,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1b2128,
    roughness: 0.1,
    metalness: 0.35,
    transparent: true,
    opacity: 0.7,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x141417,
    roughness: 0.95,
    metalness: 0.05,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x55585c,
    roughness: 0.4,
    metalness: 0.85,
  });
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfff6d8,
    emissive: 0xffe9a0,
    emissiveIntensity: 0.7,
    roughness: 0.2,
  });

  // Big rear wheels at the origin axle, small front wheels at +W.
  const rearWheelR = 0.62;
  const rearWheelW = 0.34;
  const frontWheelR = 0.34;
  const frontWheelW = 0.22;

  // --- Chassis: a low central beam connecting both axles ---
  const chassisLen = front - rear + 0.3;
  const chassisY = rearWheelR * 0.7;
  const chassis = box(chassisLen, 0.22, carWidth * 0.42, darkMat);
  chassis.position.set((front + rear) / 2, chassisY, 0);
  g.add(chassis);

  // --- Tall narrow hood up front (engine bay), tapering toward the nose ---
  const hoodBackX = W - 0.2; // hood begins just ahead of the cab/rear axle area
  const hoodFrontX = front - 0.05;
  const hoodLen = hoodFrontX - hoodBackX;
  const hoodY = chassisY + 0.34;
  const hood = roundedBox(hoodLen, 0.62, carWidth * 0.5, 0.1, bodyMat, true, 4);
  hood.position.set((hoodFrontX + hoodBackX) / 2, hoodY + 0.1, 0);
  g.add(hood);
  // A slightly narrower, lower nose cap so the front grille reads tapered.
  const noseCap = roundedBox(0.3, 0.46, carWidth * 0.42, 0.08, bodyMat);
  noseCap.position.set(hoodFrontX - 0.05, hoodY + 0.02, 0);
  g.add(noseCap);

  // Front grille + round headlights on the nose.
  const grille = box(0.05, 0.3, carWidth * 0.34, darkMat);
  grille.position.set(hoodFrontX + 0.02, hoodY, 0);
  g.add(grille);
  const headGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.05, 14);
  for (const side of [carWidth * 0.16, -carWidth * 0.16]) {
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.x = WHEEL_LATERAL;
    head.rotation.z = Math.PI / 2;
    head.position.set(hoodFrontX + 0.01, hoodY + 0.18, side);
    g.add(head);
  }

  // --- Vertical exhaust stack rising off the hood, just ahead of the cab and
  // outboard so it clears the cab roof and reads as a distinct vertical pipe. ---
  const stackX = hoodBackX + 0.05;
  const stackZ = halfW * 0.66;
  const stackGeo = new THREE.CylinderGeometry(0.05, 0.06, 0.95, 12);
  const stack = new THREE.Mesh(stackGeo, metalMat);
  stack.position.set(stackX, hoodY + 0.7, stackZ);
  stack.castShadow = true;
  g.add(stack);
  // A little elbow cap at the top.
  const stackCap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12), darkMat);
  stackCap.position.set(stackX, hoodY + 1.2, stackZ);
  g.add(stackCap);

  // ===========================================================================
  // CAB: a glassy box toward the rear, over the rear axle. Body-colored posts at
  // the corners, dark roof, big glass on all four sides.
  // ===========================================================================
  const cabBackX = rear + 0.2;
  const cabFrontX = hoodBackX + 0.05;
  const cabLen = cabFrontX - cabBackX;
  const cabCenterX = (cabFrontX + cabBackX) / 2;
  const cabFloorY = chassisY + 0.22;
  const cabH = 1.0;
  const cabHalfW = carWidth * 0.4;
  const cabRoofY = cabFloorY + cabH;

  // Glass walls (four sides) as thin slabs.
  for (const sign of [1, -1]) {
    const sideGlass = box(cabLen - 0.16, cabH - 0.18, 0.04, glassMat, false);
    sideGlass.position.set(cabCenterX, cabFloorY + cabH / 2, sign * cabHalfW);
    g.add(sideGlass);
  }
  const frontGlass = box(0.04, cabH - 0.2, cabHalfW * 2 - 0.12, glassMat, false);
  frontGlass.position.set(cabFrontX - 0.02, cabFloorY + cabH / 2, 0);
  g.add(frontGlass);
  const backGlass = box(0.04, cabH - 0.2, cabHalfW * 2 - 0.12, glassMat, false);
  backGlass.position.set(cabBackX + 0.02, cabFloorY + cabH / 2, 0);
  g.add(backGlass);

  // Corner posts (body color).
  for (const px of [cabFrontX - 0.04, cabBackX + 0.04]) {
    for (const sign of [1, -1]) {
      const post = box(0.07, cabH, 0.07, bodyMat);
      post.position.set(px, cabFloorY + cabH / 2, sign * cabHalfW);
      g.add(post);
    }
  }
  // Dark roof cap over the cab.
  const cabRoof = roundedBox(cabLen + 0.12, 0.1, cabHalfW * 2 + 0.12, 0.05, darkMat, true, 4);
  cabRoof.position.set(cabCenterX, cabRoofY + 0.03, 0);
  g.add(cabRoof);
  // A body-colored lower cab surround (kick panel) so it isn't all glass.
  const cabBase = box(cabLen, 0.18, cabHalfW * 2 + 0.04, bodyMat);
  cabBase.position.set(cabCenterX, cabFloorY + 0.05, 0);
  g.add(cabBase);

  // --- Rear fenders sweeping over the big rear wheels ---
  // --- Drawbar / hitch nub behind the rear axle (cosmetic; hitch is at L) ---
  const drawbar = box(0.5, 0.1, 0.12, darkMat);
  drawbar.position.set(rear - 0.1, chassisY - 0.05, 0);
  g.add(drawbar);

  // --- Wheels ---
  function addWheel(
    axleX: number,
    side: number,
    r: number,
    w: number,
    fender: boolean,
  ): void {
    // Build the wheel into a pivot at its center so the FRONT wheels (no fender)
    // can yaw to show steering (the lugs use their own rotation.y, so a per-mesh
    // steer would clobber them; the pivot yaws them all together).
    const wheel = new THREE.Group();
    wheel.position.set(axleX, r, side);
    if (!fender) steerWheel(wheel);
    const tireGeo = new THREE.CylinderGeometry(r, r, w, 26);
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.x = WHEEL_LATERAL;
    tire.castShadow = true;
    wheel.add(tire);
    // Yellow rim disc + hub.
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 16),
      yellowMat,
    );
    rim.rotation.x = WHEEL_LATERAL;
    wheel.add(rim);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.16, r * 0.16, w + 0.04, 10),
      metalMat,
    );
    hub.rotation.x = WHEEL_LATERAL;
    wheel.add(hub);
    // Chunky lug treads: short radial bars on the tire for an ag-tire look.
    const lugGeo = new THREE.BoxGeometry(0.06, r * 0.3, w + 0.02);
    for (let s = 0; s < 10; s++) {
      const lug = new THREE.Mesh(lugGeo, tireMat);
      const a = (s / 10) * Math.PI * 2;
      lug.position.set(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, 0);
      lug.rotation.x = WHEEL_LATERAL;
      lug.rotation.y = a;
      wheel.add(lug);
    }
    if (fender) {
      const fend = makeFender(r * 1.05, w + 0.06, bodyMat);
      wheel.add(fend);
    }
    g.add(wheel);
  }

  const rearTrack = halfW - rearWheelW / 2 + 0.02;
  const frontTrack = carWidth * 0.34;
  for (const side of [rearTrack, -rearTrack]) {
    addWheel(0, side, rearWheelR, rearWheelW, true);
  }
  for (const side of [frontTrack, -frontTrack]) {
    addWheel(W, side, frontWheelR, frontWheelW, false);
  }

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

// -----------------------------------------------------------------------------
// DUAL TRAILER: like the utility trailer but a TANDEM (two closely-spaced axles
// = 4 wheels) on a slightly longer deck. Origin = the EFFECTIVE axle (tandem
// midpoint, where physics pivots); the two real axles straddle it.
// -----------------------------------------------------------------------------

function buildDualTrailer(gs: GameState): THREE.Group {
  const { D, trailerWidth, trailerRearOverhang } = gs.rig;
  const g = new THREE.Group();

  const deckFront = D;
  const deckBack = -trailerRearOverhang;
  const deckLength = deckFront - deckBack;
  const deckCenterX = (deckFront + deckBack) / 2;
  const halfW = trailerWidth / 2;

  const wheelRadius = 0.3;
  const frameH = 0.14;
  const deckTopOffset = 0.04;
  const frameY = wheelRadius + 0.1 + frameH / 2;
  const deckTopY = frameY + frameH / 2 + deckTopOffset;

  // The two tandem axles straddle the origin (effective midpoint).
  const axleGap = 0.55; // close spacing
  const axleXs = [axleGap / 2, -axleGap / 2];

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x35383b,
    roughness: 0.5,
    metalness: 0.8,
  });
  const plankMat = new THREE.MeshStandardMaterial({
    color: 0x7a6a52,
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

  // --- Frame perimeter (two side beams + cross members at both axles + ends) ---
  const beamW = 0.1;
  for (const side of [halfW - beamW / 2, -(halfW - beamW / 2)]) {
    const beam = box(deckLength, frameH, beamW, frameMat);
    beam.position.set(deckCenterX, frameY, side);
    g.add(beam);
  }
  for (const cx of [deckFront - beamW / 2, deckBack + beamW / 2, ...axleXs]) {
    const cross = box(beamW, frameH, trailerWidth - beamW, frameMat);
    cross.position.set(cx, frameY, 0);
    g.add(cross);
  }

  // --- Planked deck ---
  const nPlanks = 7;
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

  // --- Side rails on stake posts ---
  const railH = 0.16;
  const railThick = 0.05;
  const railY = deckTopY + plankH / 2 + railH / 2 + 0.06;
  const railSide = halfW - railThick / 2;
  const postGeo = new THREE.BoxGeometry(0.05, 0.12, 0.05);
  for (const side of [railSide, -railSide]) {
    const rail = box(deckLength, railH, railThick, railMat);
    rail.position.set(deckCenterX, railY, side);
    g.add(rail);
    for (let i = 0; i < 5; i++) {
      const post = new THREE.Mesh(postGeo, railMat);
      const px = deckBack + 0.3 + (i / 4) * (deckLength - 0.6);
      post.position.set(px, railY - railH / 2 - 0.05, side);
      g.add(post);
    }
  }
  for (const cx of [deckFront - railThick / 2, deckBack + railThick / 2]) {
    const rail = box(railThick, railH, trailerWidth, railMat);
    rail.position.set(cx, railY, 0);
    g.add(rail);
  }

  // --- A-frame tongue ---
  const couplerX = deckFront + 0.95;
  const tongueY = frameY;
  const tongueGeo = new THREE.BoxGeometry(1.0, frameH * 0.9, 0.08);
  for (const sideZ of [halfW - 0.12, -(halfW - 0.12)]) {
    const arm = new THREE.Mesh(tongueGeo, frameMat);
    const startX = deckFront;
    const midX = (startX + couplerX) / 2;
    const midZ = sideZ / 2;
    arm.position.set(midX, tongueY, midZ);
    const dx = couplerX - startX;
    const dz = -sideZ;
    const len = Math.hypot(dx, dz);
    arm.scale.x = len / 1.0;
    arm.rotation.y = Math.atan2(-dz, dx);
    arm.castShadow = true;
    g.add(arm);
  }
  const coupler = box(0.18, 0.16, 0.16, frameMat);
  coupler.position.set(couplerX, tongueY, 0);
  g.add(coupler);

  // --- Tongue jack ---
  const jackPost = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 0.42, 10),
    frameMat,
  );
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

  // --- TANDEM wheels: two axles, 4 wheels, with a long fender skirt per side ---
  const wheelWidth = 0.22;
  const halfTrack = halfW + wheelWidth / 2 - 0.02;
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 18);
  const rimGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.5,
    wheelRadius * 0.5,
    wheelWidth + 0.02,
    12,
  );
  for (const side of [halfTrack, -halfTrack]) {
    for (const ax of axleXs) {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.x = WHEEL_LATERAL;
      tire.position.set(ax, wheelRadius, side);
      tire.castShadow = true;
      g.add(tire);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = WHEEL_LATERAL;
      rim.position.set(ax, wheelRadius, side);
      g.add(rim);
    }
    // One long tandem fender skirt spanning both wheels.
    const skirt = box(axleGap + wheelRadius * 2.2, 0.05, wheelWidth + 0.14, railMat);
    skirt.position.set(0, wheelRadius + wheelRadius + 0.04, side);
    g.add(skirt);
    // Down-turned ends of the skirt.
    for (const ex of [(axleGap + wheelRadius * 2.2) / 2, -(axleGap + wheelRadius * 2.2) / 2]) {
      const endCap = box(0.05, wheelRadius * 0.7, wheelWidth + 0.14, railMat);
      endCap.position.set(ex, wheelRadius + wheelRadius * 0.7, side);
      g.add(endCap);
    }
  }

  // --- Tail lights ---
  for (const side of [halfW - 0.1, -(halfW - 0.1)]) {
    const tl = box(0.05, 0.12, 0.14, tailMat);
    tl.position.set(deckBack - 0.02, railY, side);
    g.add(tl);
  }

  // --- Cargo ---
  addCargo(g, deckCenterX, deckBack, deckFront, trailerWidth, deckTopY + plankH / 2);

  return g;
}

// -----------------------------------------------------------------------------
// AG TRAILER: a larger agricultural wagon - tall solid sides, bigger wheels, a
// longer deck. Origin = trailer axle, LOCAL +X forward.
// -----------------------------------------------------------------------------

function buildAgTrailer(gs: GameState): THREE.Group {
  const { D, trailerWidth, trailerRearOverhang } = gs.rig;
  const g = new THREE.Group();

  const deckFront = D;
  const deckBack = -trailerRearOverhang;
  const deckLength = deckFront - deckBack;
  const deckCenterX = (deckFront + deckBack) / 2;
  const halfW = trailerWidth / 2;

  const wheelRadius = 0.48; // bigger ag wheels
  const frameH = 0.2;
  const frameY = wheelRadius + 0.12 + frameH / 2;
  const deckTopY = frameY + frameH / 2 + 0.04;

  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x2d3033,
    roughness: 0.55,
    metalness: 0.8,
  });
  // Painted steel wagon body (faded green to match the ag theme).
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x3f6b3a,
    roughness: 0.65,
    metalness: 0.2,
  });
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x6a5b46,
    roughness: 0.85,
    metalness: 0.05,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x121215,
    roughness: 0.95,
    metalness: 0.05,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xf2c200, // yellow ag rims to tie to the tractor
    roughness: 0.45,
    metalness: 0.4,
  });
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff342a,
    emissive: 0xd11409,
    emissiveIntensity: 1.0,
    roughness: 0.35,
  });

  // --- Frame perimeter (side beams + cross members) ---
  const beamW = 0.12;
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

  // --- Solid plank floor ---
  const floor = box(deckLength - 0.04, 0.06, trailerWidth - 0.06, floorMat);
  floor.position.set(deckCenterX, deckTopY, 0);
  floor.castShadow = true;
  g.add(floor);

  // ===========================================================================
  // TALL SOLID SIDES + front/rear walls (the wagon box). Ribbed with vertical
  // stakes for a steel-wagon look.
  // ===========================================================================
  const wallH = 0.82;
  const wallThick = 0.06;
  const wallY = deckTopY + 0.03 + wallH / 2;
  for (const side of [halfW - wallThick / 2, -(halfW - wallThick / 2)]) {
    const wall = box(deckLength - 0.02, wallH, wallThick, wallMat);
    wall.position.set(deckCenterX, wallY, side);
    wall.castShadow = true;
    g.add(wall);
    // Vertical ribs.
    const ribGeo = new THREE.BoxGeometry(0.05, wallH, 0.03);
    const nRibs = 6;
    for (let i = 0; i < nRibs; i++) {
      const rib = new THREE.Mesh(ribGeo, frameMat);
      const px = deckBack + 0.25 + (i / (nRibs - 1)) * (deckLength - 0.5);
      rib.position.set(px, wallY, side + Math.sign(side) * (wallThick / 2 + 0.01));
      g.add(rib);
    }
  }
  // Front and rear walls.
  for (const cx of [deckFront - wallThick / 2, deckBack + wallThick / 2]) {
    const wall = box(wallThick, wallH, trailerWidth - 0.02, wallMat);
    wall.position.set(cx, wallY, 0);
    wall.castShadow = true;
    g.add(wall);
  }
  // Top cap rail running the perimeter sides.
  for (const side of [halfW - wallThick / 2, -(halfW - wallThick / 2)]) {
    const cap = box(deckLength, 0.06, wallThick + 0.04, frameMat);
    cap.position.set(deckCenterX, wallY + wallH / 2 + 0.02, side);
    g.add(cap);
  }

  // --- A-frame tongue (longer, heavier) ---
  const couplerX = deckFront + 1.1;
  const tongueY = frameY;
  const tongueGeo = new THREE.BoxGeometry(1.0, frameH * 0.9, 0.1);
  for (const sideZ of [halfW - 0.15, -(halfW - 0.15)]) {
    const arm = new THREE.Mesh(tongueGeo, frameMat);
    const startX = deckFront;
    const midX = (startX + couplerX) / 2;
    const midZ = sideZ / 2;
    arm.position.set(midX, tongueY, midZ);
    const dx = couplerX - startX;
    const dz = -sideZ;
    const len = Math.hypot(dx, dz);
    arm.scale.x = len / 1.0;
    arm.rotation.y = Math.atan2(-dz, dx);
    arm.castShadow = true;
    g.add(arm);
  }
  const coupler = box(0.2, 0.18, 0.18, frameMat);
  coupler.position.set(couplerX, tongueY, 0);
  g.add(coupler);

  // --- Wheels: 2 big wheels at the axle with deep fenders ---
  const wheelWidth = 0.3;
  const halfTrack = halfW + wheelWidth / 2 - 0.02;
  const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 22);
  const rimGeo = new THREE.CylinderGeometry(
    wheelRadius * 0.52,
    wheelRadius * 0.52,
    wheelWidth + 0.02,
    14,
  );
  const lugGeo = new THREE.BoxGeometry(0.06, wheelRadius * 0.28, wheelWidth + 0.02);
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
    // Ag-tire lug bars.
    for (let s = 0; s < 10; s++) {
      const lug = new THREE.Mesh(lugGeo, tireMat);
      const a = (s / 10) * Math.PI * 2;
      lug.position.set(Math.cos(a) * wheelRadius * 0.92, wheelRadius + Math.sin(a) * wheelRadius * 0.92, side);
      lug.rotation.x = WHEEL_LATERAL;
      lug.rotation.y = a;
      g.add(lug);
    }
    const fender = makeFender(wheelRadius + 0.04, wheelWidth + 0.06, frameMat);
    fender.position.set(0, wheelRadius, side);
    g.add(fender);
  }

  // --- Tail lights at the rear corners ---
  for (const side of [halfW - 0.12, -(halfW - 0.12)]) {
    const tl = box(0.05, 0.14, 0.16, tailMat);
    tl.position.set(deckBack - 0.03, wallY - wallH / 2 + 0.1, side);
    g.add(tl);
  }

  // --- Ag load: a heaped mound of grain/feed filling the wagon box ---
  const loadMat = new THREE.MeshStandardMaterial({
    color: 0xb89a52, // golden grain
    roughness: 0.95,
    metalness: 0.0,
  });
  const moundGeo = new THREE.CylinderGeometry(0, halfW * 0.95, 0.5, 16);
  const mound = new THREE.Mesh(moundGeo, loadMat);
  // A long heap: scale a cone along X to fill the box length.
  mound.scale.set(1, 1, 1);
  mound.position.set(deckCenterX, wallY + wallH / 2 - 0.05, 0);
  // Flatten + stretch into a ridge by replacing with a stretched box-ish heap:
  mound.scale.set(deckLength / (halfW * 1.9), 1, 1);
  mound.castShadow = true;
  g.add(mound);
  // A flat grain bed filling the box up to near the rim, under the heap.
  const bed = box(deckLength - 0.2, 0.4, trailerWidth - 0.18, loadMat, false);
  bed.position.set(deckCenterX, wallY, 0);
  g.add(bed);

  return g;
}

export function buildRig(gs: GameState): RigView {
  const group = new THREE.Group();
  const carGroup = buildCar(gs);
  const trailerGroup = buildTrailer(gs);
  group.add(carGroup, trailerGroup);

  // Front-wheel meshes/pivots tagged by steerWheel(), yawed to show the tires turn.
  const steerers: THREE.Object3D[] = [];
  carGroup.traverse((o) => {
    if (o.userData.steer) steerers.push(o);
  });

  return {
    group,
    update(gs2: GameState, derived: PhysicsDerived): void {
      placeObject(carGroup, gs2.physics, gs2.physics.carHeading);
      for (const s of steerers) s.rotation.y = gs2.delta;
      placeObject(trailerGroup, derived.trailerAxle, derived.trailerHeading);
    },
  };
}
