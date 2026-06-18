// Dev-only model preview: renders the rig on a turntable with good lighting so we
// can iterate on the vehicle/trailer geometry headlessly (screenshot from angles).
import * as THREE from "three";
import { buildRig } from "./render3d/rig";
import { createGame } from "./game/state";
import { derive } from "./core/physics";
import { DEFAULT_RIG } from "./rigs/rigs";
import { DEFAULT_SCENARIO } from "./scenarios/scenarios";
import { DEFAULT_DIFFICULTY } from "./difficulty/difficulty";

const canvas = document.getElementById("view") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
const dpr = Math.min(window.devicePixelRatio || 1, 3);

const scene = new THREE.Scene();
scene.background = new THREE.Color("#c7d0d7");

scene.add(new THREE.HemisphereLight(0xdfeaff, 0x9aa17f, 1.1));
const sun = new THREE.DirectionalLight(0xfff4e2, 1.6);
sun.position.set(7, 11, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 0.5, far: 40 });
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias = -0.0004;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(22, 56),
  new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// A straight rig at the origin facing +X (forward).
const base = createGame(DEFAULT_RIG, DEFAULT_SCENARIO, DEFAULT_DIFFICULTY);
const gs = { ...base, physics: { x: 0, y: 0, carHeading: 0, trailerHeading: 0 } };
const rig = buildRig(gs);
scene.add(rig.group);

const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h); // updateStyle=true: the preview canvas has no CSS of its own
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

// Place the rig once, then auto-frame it from its bounding box (the glTF car
// loads async, so this box is the procedural car + trailer we are iterating on).
rig.update(gs, derive(gs.physics, gs.rig, { v: 0, delta: 0 }));
scene.updateMatrixWorld(true);
const bbox = new THREE.Box3().setFromObject(rig.group);
const center = bbox.getCenter(new THREE.Vector3());
const size = bbox.getSize(new THREE.Vector3());
const radius = 0.5 * Math.hypot(size.x, size.y, size.z);
const fitDist = (radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.25;
const dir = new THREE.Vector3(1.0, 0.5, 0.82).normalize(); // front-3/4, slightly above
const baseAng = Math.atan2(dir.z, dir.x);
const horiz = Math.hypot(dir.x, dir.z) * fitDist;
const vert = dir.y * fitDist;

let t = 0;
function frame(): void {
  rig.update(gs, derive(gs.physics, gs.rig, { v: 0, delta: 0 }));
  t += 1 / 60;
  const ang = baseAng + t * 0.5; // slow orbit so screenshots catch different sides
  cam.position.set(center.x + Math.cos(ang) * horiz, center.y + vert, center.z + Math.sin(ang) * horiz);
  cam.lookAt(center);
  renderer.render(scene, cam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
