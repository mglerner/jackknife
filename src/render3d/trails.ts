import * as THREE from "three";
import { worldToThree } from "./coords";
import type { Vec2 } from "../core/vec";

/**
 * Persistent tyre marks the rig paints on the ground as it moves: a readable
 * record of the path driven (the trailer-backing analogue of Absolute Drift's
 * skid trails). One InstancedMesh of flat dark quads, recycled in a ring buffer,
 * so it is a single cheap draw call regardless of how long the maneuver runs.
 */
export interface Trails {
  mesh: THREE.Object3D;
  /** Stamp a mark at each world wheel contact (point + that body's heading). */
  stamp(marks: { p: Vec2; heading: number }[]): void;
  /** Clear all marks (call on restart / teleport). */
  reset(): void;
}

export function createTrails(capacity = 360): Trails {
  // A unit quad laid flat: after rotateX, local +X = length, +Z = width, +Y = up.
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x14161a,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1; // sit just over the ground regions

  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, hidden);
  mesh.instanceMatrix.needsUpdate = true;

  let idx = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const scale = new THREE.Vector3(0.52, 1, 0.16); // length (X), -, width (Z)

  return {
    mesh,
    stamp(marks) {
      for (const mk of marks) {
        const v = worldToThree(mk.p, 0.02);
        pos.set(v.x, v.y, v.z);
        q.setFromAxisAngle(up, mk.heading);
        m.compose(pos, q, scale);
        mesh.setMatrixAt(idx % capacity, m);
        idx++;
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    reset() {
      for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, hidden);
      mesh.instanceMatrix.needsUpdate = true;
      idx = 0;
    },
  };
}
