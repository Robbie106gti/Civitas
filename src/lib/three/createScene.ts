import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { GameGrid } from '../game/grid';
import { SUB_CELL_WORLD_SIZE, SUB_CELLS_PER_TILE } from '../game/constants';

export interface SceneContext {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  ground: THREE.Mesh;
  /** Directional sun; shadow camera can be updated when shadows are enabled. */
  sun: THREE.DirectionalLight;
  shadowsEnabled: boolean;
}

/** Request a shadow-map pass on the next frame (required when `autoUpdate` is false). */
export function requestShadowMapUpdate(ctx: SceneContext): void {
  if (ctx.shadowsEnabled) {
    ctx.renderer.shadowMap.needsUpdate = true;
  }
}

export function createScene(canvas: HTMLCanvasElement, grid: GameGrid): SceneContext {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.FogExp2(0xc8dce8, 0.035);

  const centerX = (grid.width * SUB_CELLS_PER_TILE * SUB_CELL_WORLD_SIZE) / 2;
  const centerZ = (grid.height * SUB_CELLS_PER_TILE * SUB_CELL_WORLD_SIZE) / 2;

  const aspect = canvas.clientWidth / Math.max(canvas.clientHeight, 1);
  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 500);
  camera.position.set(centerX + 8, 14, centerZ + 8);
  camera.lookAt(centerX, 0, centerZ);

  const shadowsOptIn =
    typeof localStorage !== 'undefined' &&
    (localStorage.getItem('civitas.shadows') === '1' ||
      localStorage.getItem('ceaser.shadows') === '1');
  const skipShadows = !shadowsOptIn;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = !skipShadows;
  if (!skipShadows) {
    // Manual updates save GPU; must set needsUpdate or PCF shaders sample a null map
    // (WebGL: texture format / sampler2DShadow mismatch, error flood, ~100% CPU).
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }

  const ambient = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff4e6, 0.9);
  sun.position.set(12, 24, 8);
  if (!skipShadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 80;
    const shadowSpan = 48;
    sun.shadow.camera.left = -shadowSpan;
    sun.shadow.camera.right = shadowSpan;
    sun.shadow.camera.top = shadowSpan;
    sun.shadow.camera.bottom = -shadowSpan;
  }
  scene.add(sun);

  const groundSize = 256;
  const groundGeom = new THREE.PlaneGeometry(groundSize, groundSize);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xc4a574 });
  const ground = new THREE.Mesh(groundGeom, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(centerX, 0, centerZ);
  ground.receiveShadow = !skipShadows;
  // Hidden once chunk terrain renders; kept for placement raycasts below the city.
  ground.visible = false;
  scene.add(ground);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(centerX, 0, centerZ);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2.2;
  controls.minDistance = 2;
  controls.maxDistance = 120;
  controls.update();

  return { scene, camera, renderer, controls, ground, sun, shadowsEnabled: !skipShadows };
}

export function resizeRenderer(ctx: SceneContext, width: number, height: number): void {
  ctx.renderer.setSize(width, height, false);
  ctx.camera.aspect = width / Math.max(height, 1);
  ctx.camera.updateProjectionMatrix();
}

export function cameraSubCenter(ctx: SceneContext): { sx: number; sz: number } {
  const t = ctx.controls.target;
  return {
    sx: Math.floor(t.x / SUB_CELL_WORLD_SIZE),
    sz: Math.floor(t.z / SUB_CELL_WORLD_SIZE),
  };
}
