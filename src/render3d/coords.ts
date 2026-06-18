import * as THREE from "three";
import type { Vec2 } from "../core/vec";

// =============================================================================
// WORLD -> THREE coordinate convention (the single source of truth for 3D).
//
//   Our world is the 2D ground plane: (x, y) in meters, headings CCW from +x,
//   so the car's forward direction at heading h is (cos h, sin h), and +y is the
//   car's LEFT when h = 0.
//
//   Three.js is Y-up; the ground is the XZ plane. We map:
//       world x  ->  Three  X
//       world y  ->  Three -Z
//   A world heading h then maps to a rotation of h about the Three +Y axis on a
//   mesh whose LOCAL +X is "forward" (verified: R_y(h)*(1,0,0) = (cos h,0,-sin h),
//   which equals worldToThree of the forward direction).
//
//   Top-down camera: look straight down (0,-1,0) with up = (0,0,-1) so that world
//   +y points UP the screen and world +x points right.
// =============================================================================

/** A world ground point (optionally raised by `y` meters) as a Three vector. */
export function worldToThree(p: Vec2, y = 0): THREE.Vector3 {
  return new THREE.Vector3(p.x, y, -p.y);
}

/** Position + orient an object from a world point and heading (local +X = forward). */
export function placeObject(obj: THREE.Object3D, p: Vec2, heading: number, y = 0): void {
  obj.position.set(p.x, y, -p.y);
  obj.rotation.set(0, heading, 0);
}

/** Up vector for the top-down camera so world +y is screen-up. */
export const TOPDOWN_UP = new THREE.Vector3(0, 0, -1);
