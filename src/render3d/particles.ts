import * as THREE from "three";

/**
 * A small, pooled particle system that adds "juice" to the trailer game:
 * light dust kicked up at the rig's wheels and soft grey exhaust puffs.
 *
 * All coordinates are world-space three.js coords (x, z on the ground plane,
 * y up). The caller is expected to have already converted from game-world
 * coords, so values are used as given.
 *
 * Internally everything lives in a single pooled THREE.Points object backed by
 * reused Float32 buffers. Nothing is allocated per spawn; dead particles are
 * recycled. The pool is capped so a runaway caller cannot grow memory or cost.
 */
export interface ParticleSystem {
  /**
   * Spawn a small puff of pale warm dust at a ground point (y is forced to 0).
   * Used at the rig's wheels as it rolls. `intensity01` (clamped to 0..1)
   * scales both the number of particles spawned and their size.
   */
  wheelDust(worldX: number, worldZ: number, intensity01: number): void;
  /** Spawn a small soft grey exhaust puff at the tailpipe. */
  exhaust(worldX: number, worldZ: number, y: number): void;
  /** A sharp outward spray of dust on an impact (collision feedback). */
  burst(worldX: number, worldZ: number, n?: number): void;
  /** A celebratory pop of colorful confetti at a ground point (on a clean park). */
  celebrate(worldX: number, worldZ: number): void;
  /** Advance and fade all live particles; recycle dead ones. `dt` in seconds. */
  update(dt: number): void;
  /** Release GPU/CPU resources and remove from the scene. */
  dispose(): void;
}

const MAX_PARTICLES = 460; // headroom so a win's confetti is never starved by dust

// Per-spawn caps so a burst of calls cannot blow the pool budget in one frame.
const MAX_DUST_PER_SPAWN = 8;
const MAX_EXHAUST_PER_SPAWN = 3;

// Pale warm dust and soft grey exhaust.
const DUST_COLOR = new THREE.Color(0.86, 0.78, 0.62);
const EXHAUST_COLOR = new THREE.Color(0.6, 0.6, 0.62);
// Confetti palette for the win pop.
const CONFETTI = [
  new THREE.Color(0x4cc2ff),
  new THREE.Color(0xffd45e),
  new THREE.Color(0x7ee787),
  new THREE.Color(0xff7b9c),
];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// Cheap deterministic-ish jitter helpers.
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function makeRoundTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const half = size / 2;
    const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0.0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.55)");
    grad.addColorStop(1.0, "rgba(255,255,255,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function createParticles(scene: THREE.Group | THREE.Scene): ParticleSystem {
  // Reused buffers. Capacity is fixed for the lifetime of the system.
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);

  // Per-particle simulation state (CPU side, reused).
  const velX = new Float32Array(MAX_PARTICLES);
  const velY = new Float32Array(MAX_PARTICLES);
  const velZ = new Float32Array(MAX_PARTICLES);
  const age = new Float32Array(MAX_PARTICLES);
  const life = new Float32Array(MAX_PARTICLES); // total lifetime; 0 = dead/free
  const baseSize = new Float32Array(MAX_PARTICLES);
  const growth = new Float32Array(MAX_PARTICLES); // size units per second
  const r = new Float32Array(MAX_PARTICLES);
  const g = new Float32Array(MAX_PARTICLES);
  const b = new Float32Array(MAX_PARTICLES);

  // Free-list of available slot indices for O(1) spawn without scanning.
  const freeList = new Int32Array(MAX_PARTICLES);
  for (let i = 0; i < MAX_PARTICLES; i++) freeList[i] = i;
  let freeCount = MAX_PARTICLES;

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  const colorAttr = new THREE.BufferAttribute(colors, 3);
  const sizeAttr = new THREE.BufferAttribute(sizes, 1);
  positionAttr.setUsage(THREE.DynamicDrawUsage);
  colorAttr.setUsage(THREE.DynamicDrawUsage);
  sizeAttr.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("color", colorAttr);
  geometry.setAttribute("size", sizeAttr);
  geometry.setDrawRange(0, MAX_PARTICLES);

  const sprite = makeRoundTexture();
  const material = new THREE.PointsMaterial({
    size: 1,
    map: sprite,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    sizeAttenuation: true,
    alphaTest: 0.01,
  });

  // Per-vertex size: PointsMaterial uses a single `size` uniform for all
  // points. Swap that uniform declaration for a per-vertex attribute so each
  // particle can have its own size. The stock shader's `gl_PointSize = size;`
  // line then reads the attribute.
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      "uniform float size;",
      "attribute float size;",
    );
  };

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 10;
  scene.add(points);

  // Make dead particles invisible by parking them with size 0 and alpha 0.
  for (let i = 0; i < MAX_PARTICLES; i++) {
    sizes[i] = 0;
    colors[i * 3] = 0;
    colors[i * 3 + 1] = 0;
    colors[i * 3 + 2] = 0;
  }
  sizeAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;

  function spawn(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    lifeSec: number,
    size0: number,
    grow: number,
    color: THREE.Color,
  ): void {
    if (freeCount <= 0) return; // pool exhausted; drop the spawn.
    const slot = freeList[--freeCount];
    const p3 = slot * 3;
    positions[p3] = x;
    positions[p3 + 1] = y;
    positions[p3 + 2] = z;
    velX[slot] = vx;
    velY[slot] = vy;
    velZ[slot] = vz;
    age[slot] = 0;
    life[slot] = lifeSec;
    baseSize[slot] = size0;
    growth[slot] = grow;
    r[slot] = color.r;
    g[slot] = color.g;
    b[slot] = color.b;
    sizes[slot] = size0;
    colors[p3] = color.r;
    colors[p3 + 1] = color.g;
    colors[p3 + 2] = color.b;
  }

  function wheelDust(worldX: number, worldZ: number, intensity01: number): void {
    const t = clamp01(intensity01);
    if (t <= 0) return;
    const count = Math.max(1, Math.round(t * MAX_DUST_PER_SPAWN));
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(0.1, 0.45) * (0.6 + t);
      spawn(
        worldX + rand(-0.08, 0.08),
        0,
        worldZ + rand(-0.08, 0.08),
        Math.cos(ang) * spd,
        rand(0.25, 0.6) * (0.6 + t), // rises
        Math.sin(ang) * spd,
        rand(0.5, 0.9),
        rand(0.1, 0.18) * (0.7 + t),
        rand(0.25, 0.5), // grows slightly
        DUST_COLOR,
      );
    }
  }

  function exhaust(worldX: number, worldZ: number, y: number): void {
    const count = MAX_EXHAUST_PER_SPAWN;
    for (let i = 0; i < count; i++) {
      spawn(
        worldX + rand(-0.03, 0.03),
        y + rand(-0.02, 0.02),
        worldZ + rand(-0.03, 0.03),
        rand(-0.06, 0.06),
        rand(0.18, 0.34), // drifts up
        rand(-0.06, 0.06),
        rand(0.7, 1.2),
        rand(0.07, 0.12),
        rand(0.18, 0.35),
        EXHAUST_COLOR,
      );
    }
  }

  function burst(worldX: number, worldZ: number, n = 14): void {
    for (let i = 0; i < n; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(0.7, 1.8);
      spawn(
        worldX,
        0.06,
        worldZ,
        Math.cos(ang) * spd,
        rand(0.5, 1.3),
        Math.sin(ang) * spd,
        rand(0.3, 0.55),
        rand(0.12, 0.2),
        rand(-0.1, 0.05),
        DUST_COLOR,
      );
    }
  }

  function celebrate(worldX: number, worldZ: number): void {
    for (let i = 0; i < 44; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(0.5, 1.9);
      spawn(
        worldX + rand(-0.3, 0.3),
        rand(0.2, 0.7),
        worldZ + rand(-0.3, 0.3),
        Math.cos(ang) * spd,
        rand(1.4, 2.8), // pop upward
        Math.sin(ang) * spd,
        rand(1.1, 1.8),
        rand(0.14, 0.24),
        rand(-0.03, 0.04),
        CONFETTI[i % CONFETTI.length],
      );
    }
  }

  function update(dt: number): void {
    if (dt <= 0) return;
    // Clamp huge dt (e.g. after a tab was backgrounded) to keep things sane.
    const step = dt > 0.1 ? 0.1 : dt;
    for (let slot = 0; slot < MAX_PARTICLES; slot++) {
      const lifeSec = life[slot];
      if (lifeSec <= 0) continue; // free slot.
      let a = age[slot] + step;
      const p3 = slot * 3;
      if (a >= lifeSec) {
        // Recycle.
        life[slot] = 0;
        sizes[slot] = 0;
        colors[p3] = 0;
        colors[p3 + 1] = 0;
        colors[p3 + 2] = 0;
        freeList[freeCount++] = slot;
        continue;
      }
      age[slot] = a;
      // Light upward damping so puffs slow as they rise.
      const vy = velY[slot] * (1 - 0.9 * step);
      velY[slot] = vy;
      positions[p3] += velX[slot] * step;
      positions[p3 + 1] += vy * step;
      positions[p3 + 2] += velZ[slot] * step;

      const k = a / lifeSec; // 0..1 progress.
      const fade = 1 - k; // linear fade out.
      sizes[slot] = baseSize[slot] + growth[slot] * a;
      // Fade by dimming the vertex color toward black (NormalBlending +
      // round-sprite alpha gives a soft dissolve).
      colors[p3] = r[slot] * fade;
      colors[p3 + 1] = g[slot] * fade;
      colors[p3 + 2] = b[slot] * fade;
    }
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    sizeAttr.needsUpdate = true;
  }

  function dispose(): void {
    scene.remove(points);
    geometry.dispose();
    material.dispose();
    sprite.dispose();
  }

  return { wheelDust, exhaust, burst, celebrate, update, dispose };
}
