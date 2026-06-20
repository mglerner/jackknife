import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// =============================================================================
// Optional post-processing, applied to the MAIN view only (a single coherent
// camera, so depth is continuous): ground-truth ambient occlusion darkens contact
// points and crevices, a gentle bloom makes bright highlights glow, then OutputPass
// does tone mapping + sRGB. The small mirror strip / large mirror panels stay as
// direct renders (AO across discontinuous viewport depth would be wrong, and they
// are cheap). Gated behind a quality toggle since it is the heaviest mobile cost.
// =============================================================================

export interface PostFX {
  setSize(wCss: number, hCss: number, dpr: number): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
}

export function createPostFX(renderer: THREE.WebGLRenderer, w: number, h: number): PostFX {
  const scene0 = new THREE.Scene();
  const cam0 = new THREE.PerspectiveCamera();
  const composer = new EffectComposer(renderer);

  const renderPass = new RenderPass(scene0, cam0);
  composer.addPass(renderPass);

  // Contact-scale AO (not a grime filter). blendIntensity keeps it gentle.
  const gtao = new GTAOPass(scene0, cam0, w, h);
  (gtao as { blendIntensity: number }).blendIntensity = 0.7;
  composer.addPass(gtao);

  // Gentle bloom: low strength, high threshold so only genuine highlights glow.
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.5, 0.8);
  composer.addPass(bloom);

  composer.addPass(new OutputPass());

  return {
    setSize(wCss, hCss, dpr) {
      composer.setPixelRatio(Math.min(dpr, 2));
      composer.setSize(wCss, hCss);
    },
    render(scene, camera) {
      (renderPass as { scene: THREE.Scene; camera: THREE.Camera }).scene = scene;
      (renderPass as { scene: THREE.Scene; camera: THREE.Camera }).camera = camera;
      (gtao as { scene: THREE.Scene; camera: THREE.Camera }).scene = scene;
      (gtao as { scene: THREE.Scene; camera: THREE.Camera }).camera = camera;
      composer.render();
    },
  };
}
