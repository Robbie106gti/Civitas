<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { applyCommand } from '../lib/game/applyCommand';
  import { GameGrid } from '../lib/game/grid';
  import type { WorkerSimTickResultMessage } from '../lib/game/protocol';
  import { startRenderLoop } from '../lib/game/loop/renderLoop';
  import {
    isPerfEnabled,
    recordMeshRebuild,
    recordSimTick,
    setSimHzTarget,
    setVisibleChunks,
  } from '../lib/perf/perfMonitor';
  import { simHzForBuildingCount } from '../lib/game/workerBridge';
  import { SimClock } from '../lib/game/loop/simClock';
  import { WorkerBridge } from '../lib/game/workerBridge';
  import { clientToNdc } from '../lib/input/pointerToTile';
  import {
    createScene,
    requestShadowMapUpdate,
    resizeRenderer,
    cameraSubCenter,
  } from '../lib/three/createScene';
  import { pickTile } from '../lib/three/pickTile';
  import {
    createPlacementHighlight,
    hidePlacementHighlight,
    updatePlacementHighlight,
  } from '../lib/three/placementHighlight';
  import { syncChunkWorld, syncWalkerMeshes } from '../lib/three/chunkRenderer';
  import { prefetchBakedBuildings } from '../lib/three/buildingComposer';
  import { subToChunk } from '../lib/game/chunkCoords';
  import { activeTool } from '../lib/stores/buildToolStore';
  import { workerBridgeRef } from '../lib/stores/governanceStore';
  import { BUILDING_LOD_BUCKET_SUB } from '../lib/game/constants';
  import {
    activeDisaster,
    activeSocialEvent,
    cityInventory,
    denarii,
    gameGrid,
    governanceError,
    placementError,
    simTimeDisplay,
    society,
  } from '../lib/stores/gameStore';
  import { ensureSocialState } from '../lib/game/society';
  import type { SocietySnapshot, ToolId } from '../lib/game/types';
  import * as THREE from 'three';

  let canvasEl: HTMLCanvasElement | undefined = $state();

  let bridge: WorkerBridge | null = null;
  let renderLoop: ReturnType<typeof startRenderLoop> | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let renderFrameNeeded = false;
  let lastHudFlushMs = 0;
  const HUD_FLUSH_MS = 250;

  const simClock = new SimClock();
  const worldRoot = new THREE.Group();
  const mistRoot = new THREE.Group();
  const walkersRoot = new THREE.Group();
  let placementHighlight: THREE.Group | null = null;

  let grid = $state(new GameGrid());
  let pointerDownPos: { x: number; y: number } | null = null;
  const PLACE_THRESHOLD_PX = 8;
  let lastMeshRevision = -1;
  let lastCameraChunkKey = '';
  let lastLodCenterKey = '';
  let lastSimRevision = -1;

  function syncWorkerState(): void {
    if (!bridge) return;
    bridge.syncCity(grid, get(cityInventory), get(society));
  }

  function refreshMeshes(centerSx: number, centerSz: number, force = false): void {
    const { cx, cy } = subToChunk(centerSx, centerSz);
    const camKey = `${cx},${cy}`;
    const lodKey = `${Math.floor(centerSx / BUILDING_LOD_BUCKET_SUB)},${Math.floor(centerSz / BUILDING_LOD_BUCKET_SUB)}`;
    const rev = grid.revision;
    if (
      !force &&
      rev === lastMeshRevision &&
      camKey === lastCameraChunkKey &&
      lodKey === lastLodCenterKey
    ) {
      return;
    }
    grid.updateActiveChunks(centerSx, centerSz);
    lastMeshRevision = rev;
    lastCameraChunkKey = camKey;
    lastLodCenterKey = lodKey;
    syncChunkWorld(worldRoot, grid, centerSx, centerSz, mistRoot, centerSx, centerSz);
    if (isPerfEnabled()) {
      recordMeshRebuild();
      setVisibleChunks(grid.chunks.loadedChunkCount());
    }
    if (sceneCtx?.shadowsEnabled) {
      requestShadowMapUpdate(sceneCtx);
    }
  }

  function updatePlacementPreview(clientX: number, clientY: number): void {
    if (!canvasEl || !sceneCtx || !placementHighlight) return;
    const rect = canvasEl.getBoundingClientRect();
    const ndc = clientToNdc(clientX, clientY, rect);
    const cell = pickTile(ndc, sceneCtx.camera, sceneCtx.ground);
    if (!cell) {
      hidePlacementHighlight(placementHighlight);
      return;
    }
    updatePlacementHighlight(
      placementHighlight,
      grid,
      get(activeTool),
      cell.sx,
      cell.sz,
    );
  }

  function handlePlacement(clientX: number, clientY: number, tool: ToolId): void {
    if (!canvasEl) return;
    const ctx = sceneCtx;
    if (!ctx) return;

    const rect = canvasEl.getBoundingClientRect();
    const ndc = clientToNdc(clientX, clientY, rect);
    const cell = pickTile(ndc, ctx.camera, ctx.ground);
    if (!cell) return;

    const command =
      tool === 'erase'
        ? { type: 'eraseBuilding' as const, sx: cell.sx, sz: cell.sz }
        : { type: 'placeBuilding' as const, tool, sx: cell.sx, sz: cell.sz };

    const result = applyCommand(grid, command);
    if (!result.ok) {
      placementError.set(result.reason);
      return;
    }

    placementError.set(null);
    gameGrid.set(grid);
    const { sx, sz } = cameraSubCenter(ctx);
    refreshMeshes(sx, sz, true);
    requestRenderFrame();
    syncWorkerState();
  }

  let sceneCtx: ReturnType<typeof createScene> | null = null;

  function applySocietyFromWorker(snap: SocietySnapshot): void {
    ensureSocialState(snap);
    society.set(snap);
    denarii.set(snap.tax.treasury);
  }

  function applySimSideEffects(snapshot: WorkerSimTickResultMessage): boolean {
    const walkerList: {
      id: number;
      sx: number;
      sz: number;
      role: 'citizen' | 'engineer';
    }[] = [];
    for (const w of snapshot.walkers ?? []) {
      walkerList.push({ id: w.id, sx: w.sx, sz: w.sz, role: 'citizen' });
    }
    for (const e of snapshot.engineers ?? []) {
      walkerList.push({
        id: e.id + 100_000,
        sx: e.sx,
        sz: e.sz,
        role: 'engineer',
      });
    }
    if (walkerList.length) {
      syncWalkerMeshes(walkersRoot, walkerList);
    }

    let housingMeshDirty = false;
    if (snapshot.housingUpdates?.length) {
      housingMeshDirty = grid.applyHousingUpdates(snapshot.housingUpdates);
    }

    let upkeepMeshDirty = false;
    if (snapshot.upkeepUpdates?.length) {
      upkeepMeshDirty = grid.applyUpkeepUpdates(
        snapshot.upkeepUpdates,
        snapshot.civicEvolution,
      );
    }

    const construction = grid.tickConstruction();
    let constructionMeshDirty = construction.meshDirty;
    if (construction.completed.length > 0) {
      syncWorkerState();
      constructionMeshDirty = true;
    }

    const hasWorldDelta =
      (snapshot.trafficRoads?.length ?? 0) > 0 ||
      (snapshot.disasters?.length ?? 0) > 0 ||
      (snapshot.extractorDigAnchors?.length ?? 0) > 0 ||
      housingMeshDirty ||
      upkeepMeshDirty ||
      constructionMeshDirty;
    if (snapshot.revision === lastSimRevision && !hasWorldDelta) return false;
    lastSimRevision = snapshot.revision;

    if (snapshot.deposits?.length) {
      grid.patchDeposits(snapshot.deposits);
    }
    if (snapshot.trafficRoads?.length) {
      for (const { key, building } of snapshot.trafficRoads) {
        const [xs, zs] = key.split(',');
        const sx = Number(xs);
        const sz = Number(zs);
        if (!Number.isNaN(sx) && !Number.isNaN(sz)) {
          grid.applyTrafficRoad(sx, sz, building);
        }
      }
    }
    if (snapshot.extractorDigAnchors?.length) {
      const digs = snapshot.extractorDigAnchors.map(({ key, building }) => {
        const [xs, zs] = key.split(',');
        return { sx: Number(xs), sz: Number(zs), tool: building };
      });
      grid.digExtractorTick(
        digs.filter((d) => !Number.isNaN(d.sx) && !Number.isNaN(d.sz)),
      );
    }
    if (snapshot.disasters?.length) {
      const latest = snapshot.disasters[snapshot.disasters.length - 1]!;
      activeDisaster.set(latest);
      if (latest.type === 'fire') {
        grid.applyWorkerBuildingRemoval(latest.sx, latest.sz);
      }
    }
    if (snapshot.socialEvents?.length) {
      activeSocialEvent.set(snapshot.socialEvents[snapshot.socialEvents.length - 1]!);
    }
    return true;
  }

  function requestRenderFrame(): void {
    renderFrameNeeded = true;
    renderLoop?.invalidate();
  }

  function flushHudStores(snapshot: WorkerSimTickResultMessage, force = false): void {
    const now = performance.now();
    if (!force && !snapshot.slowTick && now - lastHudFlushMs < HUD_FLUSH_MS) return;
    lastHudFlushMs = now;
    denarii.set(snapshot.resources.denarii);
    cityInventory.set(snapshot.resources.inventory);
    simTimeDisplay.set(snapshot.simTime);
    if (snapshot.society) {
      applySocietyFromWorker(snapshot.society);
    }
  }

  function onSimSnapshot(snapshot: WorkerSimTickResultMessage | null): void {
    if (!snapshot) return;
    flushHudStores(snapshot);
    const worldChanged = applySimSideEffects(snapshot);
    if (worldChanged && sceneCtx) {
      const { sx, sz } = cameraSubCenter(sceneCtx);
      refreshMeshes(sx, sz);
      requestRenderFrame();
    } else if ((snapshot.walkers?.length ?? 0) > 0 || (snapshot.engineers?.length ?? 0) > 0) {
      requestRenderFrame();
    }
  }

  onMount(() => {
    if (!canvasEl) return;

    grid = get(gameGrid);
    const inventory = get(cityInventory);
    const societyState = get(society);
    sceneCtx = createScene(canvasEl, grid);
    placementHighlight = createPlacementHighlight();
    sceneCtx.scene.add(mistRoot, worldRoot, walkersRoot, placementHighlight);

    const { sx, sz } = cameraSubCenter(sceneCtx);
    void Promise.all([
      GameGrid.prefetchTerrain(grid, sx, sz),
      prefetchBakedBuildings(),
    ]).then(() => refreshMeshes(sx, sz, true));
    refreshMeshes(sx, sz);

    const { width, height } = canvasEl.getBoundingClientRect();
    resizeRenderer(sceneCtx, width, height);

    bridge = new WorkerBridge();
    workerBridgeRef.set(bridge);
    bridge.initGrid(grid, inventory, societyState);
    bridge.startSimLoop(() => grid.chunks.simBuildingCount());
    bridge.ping();

    bridge.onTickResult((fresh) => {
      simClock.pushSnapshot(fresh, performance.now());
      if (isPerfEnabled()) {
        const buildingCount = grid.chunks.simBuildingCount();
        setSimHzTarget(simHzForBuildingCount(buildingCount));
        recordSimTick(fresh.perf?.tickMs ?? 0, fresh.slowTick, fresh.perf);
        setVisibleChunks(grid.chunks.loadedChunkCount());
      }
      onSimSnapshot(fresh);
    });

    renderLoop = startRenderLoop({
      renderer: sceneCtx.renderer,
      scene: sceneCtx.scene,
      camera: sceneCtx.camera,
      controls: sceneCtx.controls,
      simClock,
      needsFrame: () => {
        if (!renderFrameNeeded) return false;
        renderFrameNeeded = false;
        return true;
      },
      onBeforeRender: () => {
        if (!sceneCtx) return;
        const center = cameraSubCenter(sceneCtx);
        refreshMeshes(center.sx, center.sz);
      },
    });
    requestRenderFrame();

    bridge.onMessage((message) => {
      if (message.type === 'governance.ack') {
        applySocietyFromWorker(message.society);
        if (message.inventory) {
          cityInventory.set(message.inventory);
        }
        governanceError.set(null);
      } else if (message.type === 'governance.error') {
        governanceError.set(message.reason);
      }
    });

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || !sceneCtx || !canvasEl) return;
      const { width: w, height: h } = entry.contentRect;
      resizeRenderer(sceneCtx, w, h);
      requestRenderFrame();
    });
    resizeObserver.observe(canvasEl);

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerDownPos) return;
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      pointerDownPos = null;
      if (Math.hypot(dx, dy) > PLACE_THRESHOLD_PX) return;
      const tool = get(activeTool);
      handlePlacement(e.clientX, e.clientY, tool);
    };

    const onPointerMove = (e: PointerEvent) => {
      updatePlacementPreview(e.clientX, e.clientY);
      requestRenderFrame();
    };

    const onPointerLeave = () => {
      if (placementHighlight) hidePlacementHighlight(placementHighlight);
      requestRenderFrame();
    };

    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointerup', onPointerUp);
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('pointerleave', onPointerLeave);

    return () => {
      canvasEl?.removeEventListener('pointerdown', onPointerDown);
      canvasEl?.removeEventListener('pointerup', onPointerUp);
      canvasEl?.removeEventListener('pointermove', onPointerMove);
      canvasEl?.removeEventListener('pointerleave', onPointerLeave);
    };
  });

  onDestroy(() => {
    resizeObserver?.disconnect();
    renderLoop?.stop();
    workerBridgeRef.set(null);
    bridge?.terminate();
    sceneCtx?.renderer.dispose();
  });
</script>

<div class="game-canvas-wrapper relative min-h-0 flex-1">
  <canvas
    bind:this={canvasEl}
    class="block h-full w-full touch-none"
    aria-label="City builder canvas"
  ></canvas>
  {#if $placementError}
    <p
      class="bg-stone-dark/90 pointer-events-none absolute right-2 bottom-2 left-2 rounded px-2 py-1 text-center text-xs text-white"
    >
      {$placementError}
    </p>
  {/if}
</div>

<style>
  .game-canvas-wrapper {
    touch-action: none;
  }
</style>
