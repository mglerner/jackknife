import * as THREE from "three";

// =============================================================================
// Procedural PBR surface textures (no asset files): each surface gets an albedo
// map, a NORMAL map (real surface relief, derived from a fractal height field via
// Sobel), and a roughness map. This is the difference between flat-shaded low-poly
// and surfaces that actually read as asphalt / concrete / grass / metal.
//
// The expensive part (generating the canvases) is cached per key; we hand out
// fresh CanvasTextures from the cached canvases so each ground region can set its
// own repeat (consistent real-world texel density) cheaply.
// =============================================================================

export interface SurfaceOpts {
  key: string;
  base: [number, number, number]; // sRGB 0..255
  freq?: number; // base lattice frequency (feature size); higher = finer grain
  octaves?: number; // fractal detail layers
  contrast?: number; // how much the height modulates the albedo (0..1)
  normalStrength?: number; // bump depth
  roughness?: number; // mid roughness (0..1)
  roughVar?: number; // roughness variation with height
  metalness?: number;
  repeat?: number; // texture repeats across the region
  speckle?: number; // fine per-pixel grain on top of the smooth noise
  envMapIntensity?: number; // matte ground should be LOW (~0.3) so env light doesn't wash it flat
}

const SIZE = 256;
const canvasCache = new Map<string, { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement }>();

/** Small deterministic RNG so a given key always generates the same surface. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** A tileable F x F random lattice. */
function lattice(F: number, rng: () => number): Float32Array {
  const a = new Float32Array(F * F);
  for (let i = 0; i < a.length; i++) a[i] = rng();
  return a;
}

/** Bilinear smoothstep sample of a tileable lattice; u,v in [0,1). */
function sampleLattice(a: Float32Array, F: number, u: number, v: number): number {
  const x = u * F;
  const y = v * F;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const x0 = ((xi % F) + F) % F;
  const y0 = ((yi % F) + F) % F;
  const x1 = (x0 + 1) % F;
  const y1 = (y0 + 1) % F;
  const fx = smooth(x - xi);
  const fy = smooth(y - yi);
  const v00 = a[y0 * F + x0];
  const v10 = a[y0 * F + x1];
  const v01 = a[y1 * F + x0];
  const v11 = a[y1 * F + x1];
  const top = v00 + (v10 - v00) * fx;
  const bot = v01 + (v11 - v01) * fx;
  return top + (bot - top) * fy;
}

/** Fractal (multi-octave) tileable height field in [0,1]. */
function heightField(freq: number, octaves: number, rng: () => number): Float32Array {
  const lats: { a: Float32Array; F: number; amp: number }[] = [];
  let F = Math.max(2, Math.round(freq));
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    lats.push({ a: lattice(F, rng), F, amp });
    norm += amp;
    F *= 2;
    amp *= 0.5;
  }
  const h = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const u = x / SIZE;
      const v = y / SIZE;
      let s = 0;
      for (const l of lats) s += l.amp * sampleLattice(l.a, l.F, u, v);
      h[y * SIZE + x] = s / norm;
    }
  }
  return h;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function generate(opts: SurfaceOpts): { albedo: HTMLCanvasElement; normal: HTMLCanvasElement; rough: HTMLCanvasElement } {
  const freq = opts.freq ?? 6;
  const octaves = opts.octaves ?? 4;
  const contrast = opts.contrast ?? 0.35;
  const speckle = opts.speckle ?? 8;
  const roughness = opts.roughness ?? 0.85;
  const roughVar = opts.roughVar ?? 0.25;
  const strength = opts.normalStrength ?? 1;

  // Seed from the key so a surface is stable across rebuilds.
  let seed = 0;
  for (let i = 0; i < opts.key.length; i++) seed = (seed * 31 + opts.key.charCodeAt(i)) | 0;
  const rng = mulberry32(seed);
  const h = heightField(freq, octaves, rng);
  const grain = mulberry32(seed ^ 0x9e3779b9);

  const mk = (): [HTMLCanvasElement, ImageData] => {
    const c = document.createElement("canvas");
    c.width = SIZE;
    c.height = SIZE;
    const ctx = c.getContext("2d")!;
    return [c, ctx.createImageData(SIZE, SIZE)];
  };
  const [albedo, aImg] = mk();
  const [normal, nImg] = mk();
  const [rough, rImg] = mk();

  const [br, bg, bb] = opts.base;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const hv = h[i];
      const sp = (grain() - 0.5) * 2 * speckle;
      const shade = (hv - 0.5) * contrast * 255 + sp;
      aImg.data[i * 4 + 0] = clamp255(br + shade);
      aImg.data[i * 4 + 1] = clamp255(bg + shade);
      aImg.data[i * 4 + 2] = clamp255(bb + shade);
      aImg.data[i * 4 + 3] = 255;

      // Sobel gradient (wrapped) -> tangent-space normal.
      const xm = (x - 1 + SIZE) % SIZE;
      const xp = (x + 1) % SIZE;
      const ym = (y - 1 + SIZE) % SIZE;
      const yp = (y + 1) % SIZE;
      const dx = (h[y * SIZE + xp] - h[y * SIZE + xm]) * strength;
      const dy = (h[yp * SIZE + x] - h[ym * SIZE + x]) * strength;
      const nz = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      nImg.data[i * 4 + 0] = clamp255((-dx * nz * 0.5 + 0.5) * 255);
      nImg.data[i * 4 + 1] = clamp255((-dy * nz * 0.5 + 0.5) * 255);
      nImg.data[i * 4 + 2] = clamp255((nz * 0.5 + 0.5) * 255);
      nImg.data[i * 4 + 3] = 255;

      const rv = clamp255((roughness + (hv - 0.5) * roughVar) * 255);
      rImg.data[i * 4 + 0] = rv;
      rImg.data[i * 4 + 1] = rv;
      rImg.data[i * 4 + 2] = rv;
      rImg.data[i * 4 + 3] = 255;
    }
  }
  albedo.getContext("2d")!.putImageData(aImg, 0, 0);
  normal.getContext("2d")!.putImageData(nImg, 0, 0);
  rough.getContext("2d")!.putImageData(rImg, 0, 0);
  return { albedo, normal, rough };
}

function tex(canvas: HTMLCanvasElement, repeat: number, srgb: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
}

/** A PBR MeshStandardMaterial with generated albedo + normal + roughness maps. */
export function surfaceMaterial(opts: SurfaceOpts): THREE.MeshStandardMaterial {
  let c = canvasCache.get(opts.key);
  if (!c) {
    c = generate(opts);
    canvasCache.set(opts.key, c);
  }
  const repeat = opts.repeat ?? 6;
  const s = opts.normalStrength ?? 1;
  return new THREE.MeshStandardMaterial({
    map: tex(c.albedo, repeat, true),
    normalMap: tex(c.normal, repeat, false),
    normalScale: new THREE.Vector2(s, s),
    roughnessMap: tex(c.rough, repeat, false),
    roughness: 1,
    metalness: opts.metalness ?? 0,
    envMapIntensity: opts.envMapIntensity ?? 0.3,
  });
}

// Large-scale "macro" variation: soft low-frequency blobs that gently darken the
// ground in patches at a scale much bigger than the detail tiles. Overlaid with
// multiply blending, it breaks up the obvious repeating grid of the tiled detail
// texture (the detail period and this macro period are incommensurate), and reads
// as natural ground unevenness. One cached grayscale canvas, reused everywhere.
let macroCanvas: HTMLCanvasElement | null = null;
function macroGen(): HTMLCanvasElement {
  if (macroCanvas) return macroCanvas;
  const h = heightField(3, 3, mulberry32(0x5eed));
  const c = document.createElement("canvas");
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let i = 0; i < SIZE * SIZE; i++) {
    const v = clamp255((0.87 + h[i] * 0.13) * 255); // 0.87..1.0: gentle darken-only patches
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  macroCanvas = c;
  return c;
}

/** A multiply-blended overlay material that breaks up ground tile repetition. */
export function macroMaterial(repeat: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    map: tex(macroGen(), repeat, true),
    transparent: true,
    blending: THREE.MultiplyBlending,
    depthWrite: false,
  });
}
