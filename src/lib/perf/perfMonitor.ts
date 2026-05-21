import { writable } from 'svelte/store';
import type { WorkerPerfSnapshot } from '../game/protocol';

/** Enable: `?perf=1`, `localStorage.setItem('civitas.perf', '1')`, or backtick (`). */
const STORAGE_KEY = 'civitas.perf';
const LEGACY_STORAGE_KEY = 'ceaser.perf';

export interface PerfDisplayState {
  rafFps: number;
  renderFps: number;
  frameMs: number;
  rendersPerSec: number;
  simHz: number;
  simHzTarget: number;
  lastTickMs: number;
  lastSlowTickMs: number | null;
  worker: WorkerPerfSnapshot | null;
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  heapMb: number | null;
  visibleChunks: number;
  meshRebuildsPerSec: number;
}

type FrameSample = { t: number; rendered: boolean; ms: number };

let enabled = false;

const frameSamples: FrameSample[] = [];
let renderCountWindow = 0;
let tickCountWindow = 0;
let meshRebuildCountWindow = 0;
let windowStart = 0;

let lastTickMs = 0;
let lastSlowTickMs: number | null = null;
let lastWorkerPerf: WorkerPerfSnapshot | null = null;
let simHzTarget = 12;

let visibleChunks = 0;
let rendererInfo: {
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
} | null = null;
let heapMb: number | null = null;

export const perfEnabled = writable(false);
export const perfDisplay = writable<PerfDisplayState | null>(null);

export function isPerfEnabled(): boolean {
  return enabled;
}

export function setSimHzTarget(hz: number): void {
  simHzTarget = hz;
}

export function enablePerf(): void {
  if (enabled) return;
  enabled = true;
  windowStart = performance.now();
  frameSamples.length = 0;
  renderCountWindow = 0;
  tickCountWindow = 0;
  meshRebuildCountWindow = 0;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* private mode */
  }
  perfEnabled.set(true);
  flushPerfDisplay();
}

export function disablePerf(): void {
  if (!enabled) return;
  enabled = false;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  perfEnabled.set(false);
  perfDisplay.set(null);
}

export function togglePerf(): void {
  if (enabled) disablePerf();
  else enablePerf();
}

export function initPerfFromUrl(): void {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? '');
    if (params.get('perf') === '1') {
      enablePerf();
      return;
    }
    if (localStorage.getItem(STORAGE_KEY) === '1') {
      enablePerf();
      return;
    }
    if (localStorage.getItem(LEGACY_STORAGE_KEY) === '1') {
      localStorage.setItem(STORAGE_KEY, '1');
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      enablePerf();
    }
  } catch {
    /* SSR / restricted */
  }
}

export function recordRenderFrame(now: number, rendered: boolean, frameMs: number): void {
  if (!enabled) return;
  frameSamples.push({ t: now, rendered, ms: frameMs });
  if (rendered) renderCountWindow++;
  pruneSamples(now);
}

export function recordSimTick(tickMs: number, slowTick: boolean, workerPerf?: WorkerPerfSnapshot): void {
  if (!enabled) return;
  lastTickMs = tickMs;
  if (slowTick) {
    lastSlowTickMs =
      workerPerf?.economySlowMs ?? workerPerf?.tickMs ?? tickMs;
  }
  if (workerPerf) lastWorkerPerf = workerPerf;
  tickCountWindow++;
}

export function recordMeshRebuild(): void {
  if (!enabled) return;
  meshRebuildCountWindow++;
}

export function setVisibleChunks(count: number): void {
  if (!enabled) return;
  visibleChunks = count;
}

export function setRendererInfo(info: {
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
}): void {
  if (!enabled) return;
  rendererInfo = info;
}

function pruneSamples(now: number): void {
  const cutoff = now - 1000;
  while (frameSamples.length > 0 && frameSamples[0]!.t < cutoff) {
    frameSamples.shift();
  }
  if (windowStart < cutoff) {
    windowStart = cutoff;
  }
}

function windowSeconds(now: number): number {
  return Math.max(0.25, (now - windowStart) / 1000);
}

export function flushPerfDisplay(now = performance.now()): void {
  if (!enabled) return;
  pruneSamples(now);
  const sec = windowSeconds(now);

  const rafCount = frameSamples.length;
  const rendered = frameSamples.filter((s) => s.rendered);
  const renderCount = rendered.length;
  const avgFrameMs =
    rendered.length > 0
      ? rendered.reduce((a, s) => a + s.ms, 0) / rendered.length
      : 0;

  const mem = (
    performance as Performance & {
      memory?: { usedJSHeapSize: number };
    }
  ).memory;

  perfDisplay.set({
    rafFps: Math.round(rafCount / sec),
    renderFps: Math.round(renderCount / sec),
    frameMs: Math.round(avgFrameMs * 10) / 10,
    rendersPerSec: Math.round(renderCountWindow / sec),
    simHz: Math.round((tickCountWindow / sec) * 10) / 10,
    simHzTarget,
    lastTickMs: Math.round(lastTickMs * 10) / 10,
    lastSlowTickMs: lastSlowTickMs !== null ? Math.round(lastSlowTickMs * 10) / 10 : null,
    worker: lastWorkerPerf,
    triangles: rendererInfo?.triangles ?? 0,
    drawCalls: rendererInfo?.drawCalls ?? 0,
    geometries: rendererInfo?.geometries ?? 0,
    textures: rendererInfo?.textures ?? 0,
    heapMb: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
    visibleChunks,
    meshRebuildsPerSec: Math.round(meshRebuildCountWindow / sec),
  });

  renderCountWindow = 0;
  tickCountWindow = 0;
  meshRebuildCountWindow = 0;
  windowStart = now;
}
