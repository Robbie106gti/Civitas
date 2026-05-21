import * as THREE from 'three';
import type { WebGLRenderer, Scene, Camera } from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SimClock } from './simClock';
import type { WorkerSimTickResultMessage } from '../protocol';
import { isPerfEnabled, recordRenderFrame, setRendererInfo } from '../../perf/perfMonitor';

export interface RenderLoopOptions {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: Camera;
  simClock: SimClock;
  controls?: OrbitControls;
  /** Return true when something besides camera motion needs a frame (sim visuals, resize). */
  needsFrame?: () => boolean;
  onBeforeRender?: (snapshot: WorkerSimTickResultMessage | null, alpha: number) => void;
}

export interface RenderLoopHandle {
  stop: () => void;
  /** Request a draw on the next animation frame. */
  invalidate: () => void;
}

/** Render only when the camera moves, controls damp, or `invalidate()` / `needsFrame` fire. */
export function startRenderLoop(options: RenderLoopOptions): RenderLoopHandle {
  let frameId = 0;
  let running = true;
  let pending = true;

  const lastPos = new THREE.Vector3();
  const lastQuat = new THREE.Quaternion();
  const lastTarget = new THREE.Vector3();
  let cameraSnapped = false;

  function snapCamera(): void {
    const cam = options.camera;
    lastPos.copy(cam.position);
    lastQuat.copy(cam.quaternion);
    if (options.controls) lastTarget.copy(options.controls.target);
    cameraSnapped = true;
  }

  function cameraChanged(): boolean {
    const cam = options.camera;
    if (!cameraSnapped) return true;
    if (!cam.position.equals(lastPos) || !cam.quaternion.equals(lastQuat)) return true;
    if (options.controls && !options.controls.target.equals(lastTarget)) return true;
    return false;
  }

  function schedule(): void {
    if (!running || frameId !== 0) return;
    frameId = requestAnimationFrame(loop);
  }

  function invalidate(): void {
    pending = true;
    schedule();
  }

  options.controls?.addEventListener('change', invalidate);

  const loop = (now: number) => {
    frameId = 0;
    if (!running) return;

    const perfOn = isPerfEnabled();
    const frameStart = perfOn ? performance.now() : 0;

    options.controls?.update();
    const camMoved = cameraChanged();
    const external = options.needsFrame?.() ?? false;

    let rendered = false;
    if (pending || camMoved || external) {
      pending = false;
      if (camMoved) snapCamera();

      const alpha = options.simClock.interpolationAlpha(now);
      const snapshot = options.simClock.last;
      options.onBeforeRender?.(snapshot, alpha);
      options.renderer.render(options.scene, options.camera);
      rendered = true;

      if (perfOn) {
        const info = options.renderer.info;
        setRendererInfo({
          triangles: info.render.triangles,
          drawCalls: info.render.calls,
          geometries: info.memory.geometries,
          textures: info.memory.textures,
        });
      }
    }

    if (perfOn) {
      recordRenderFrame(now, rendered, performance.now() - frameStart);
    }

    options.controls?.update();
    if (cameraChanged() || (options.needsFrame?.() ?? false)) {
      pending = true;
    }

    if (pending) schedule();
  };

  snapCamera();
  schedule();

  return {
    stop: () => {
      running = false;
      if (frameId !== 0) cancelAnimationFrame(frameId);
      frameId = 0;
    },
    invalidate,
  };
}
