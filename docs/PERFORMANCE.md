# Performance architecture (Civitas)

**Audience:** AI agents and maintainers. File paths are repo-relative from project root (`src/…`).

---

## 1. Executive summary

Civitas is a browser city-builder: **main thread** owns WebGL (Three.js), input, grid mutations, and mesh sync; **simulation** runs in `src/workers/game.worker.ts` via `WorkerBridge` (`src/lib/game/workerBridge.ts`).

**Threading:** Worker ticks are scheduled with `setTimeout` (not tied to `requestAnimationFrame`). Sim rate is **12 Hz** by default, **4 Hz** when `buildings.size ≤ 12` (`TINY_CITY_MAX_BUILDINGS` in `workerBridge.ts`). Render uses **render-on-demand** (`src/lib/game/loop/renderLoop.ts`): no `renderer.render()` unless the camera/controls move, `invalidate()` fires, or `needsFrame()` returns true.

**Main bottlenecks addressed:** (1) rebuilding all chunk meshes every frame; (2) one draw call per terrain/water sub-cell; (3) cloning baked building geometry per instance; (4) full-grid worker sync and full `SocietySnapshot` every tick; (5) unconditional shadow map updates; (6) running heavy civic/social/housing on every sim step.

**Design philosophy:** Pay mesh cost on **dirty chunks** only (`contentRevision`), batch static geometry (vertex colors + `mergeGeometries`, `InstancedMesh` for buildings), keep walkers on a separate root, cap pathfinding, split **fast** vs **slow** sim tiers, and ship **deltas** across the worker boundary. Prefer measurable dev overlays (`?perf=1`) over guessing.

### Build / bundle (`vite.config.ts`)

- **Boot:** `App.svelte` main entry stays small; `GameShell` / `GameCanvas` and `three` load only in play phase (dynamic `import()`).
- **Vendor chunks:** `manualChunks` isolates `three` (~530k) and `svelte` runtime from the app entry.
- **Prefetch:** `prefetchPlayBundles()` (`src/lib/bundlePrefetch.ts`) runs on the loading screen (and main menu) to warm play-phase chunks before the user taps Play.
- **Target:** `build.target: 'es2022'`; `modulePreload.polyfill: false` (modern browsers only).
- **Worker:** `game.worker.ts` is a separate asset; sim code is not in the main graph.

---

## 2. Architecture

### Main thread vs worker

| Layer | Location | Responsibility |
| ----- | -------- | ---------------- |
| UI / stores | `src/components/GameCanvas.svelte`, `src/lib/stores/*` | Placement, HUD, apply worker tick results |
| Grid | `src/lib/game/grid.ts`, `chunkManager.ts` | Authoritative world; `collectSimSyncDelta()` |
| Render | `src/lib/three/chunkRenderer.ts`, `renderLoop.ts` | Meshes, walkers, mist |
| Sim | `src/workers/game.worker.ts` → `runSimTick` (`sim/tick.ts`) | Production, walkers, economy, upkeep |

**Bridge:** `WorkerBridge` (`workerBridge.ts`) — `initGrid`, `syncCity` (full or partial), `startSimLoop` / `stopSimLoop`, `onTickResult` (sim snapshots, **not** rAF).

**Interpolation:** `SimClock` (`loop/simClock.ts`) holds `previous` / `last` tick results; `interpolationAlpha(now, simHz)` uses `simHzForBuildingCount()` for display smoothing (walkers updated from latest tick, not re-simulated on main thread).

### Fast vs slow sim tiers

| Constant | File | Value |
| -------- | ---- | ----- |
| `SIM_TICK_HZ` | `sim/simIntervals.ts` | `12` |
| `SLOW_TICK_INTERVAL_TICKS` | `sim/simIntervals.ts` | `SIM_TICK_HZ * 60` → **720 ticks ≈ 1 real-time minute** at 12 Hz |
| Adaptive sim | `workerBridge.ts` | `12` Hz or `4` Hz if `buildings ≤ 12` |

**Fast tick (every step):** production, traffic decay, walkers, animals, disasters, `runFastEconomyTick`, building upkeep, engineers.

**Slow tick** (`simTick % SLOW_TICK_INTERVAL_TICKS === 0` in `sim/tick.ts`): `runSlowEconomyTick`, full social/civic passes, `tickHousingEvolution`, `tickCivicEvolution`, `buildCityMetrics` refresh. Worker includes **`society` only when `slowTick`** (`protocol.ts` / `game.worker.ts`).

**`cityMetrics`:** Compact struct (`sim/cityMetrics.ts`) sent **every** tick for fast subsystems; recomputed from society on slow tick (`buildCityMetrics`).

### Render-on-demand

`startRenderLoop` (`renderLoop.ts`):

- Schedules rAF only when `pending`, camera moved, or `needsFrame()`.
- `GameCanvas` sets `renderFrameNeeded` and calls `renderLoop.invalidate()` after placement, sim-driven world changes, or walker motion.

`onBeforeRender` in `GameCanvas.svelte` calls `refreshMeshes` when a frame is actually drawn (camera-driven chunk visibility + LOD), with early-out (see §3).

### Chunk / world scope

Defined in `src/lib/game/constants.ts`:

| Constant | Value | Effect |
| -------- | ----- | ------ |
| `CHUNK_SIZE` | `32` | Sub-cells per chunk edge |
| `ACTIVE_CHUNK_RADIUS` | `2` | Load/evict resident chunks → **5×5** around camera |
| `RENDER_CHUNK_RADIUS` | `2` | `visibleChunks(..., radius)` for mesh sync → **5×5** drawn |
| `EXPLORE_CHUNK_RADIUS` | `1` | Fog-of-war explore ring (mist) |

`grid.updateActiveChunks` / `chunkManager.updateActiveChunks` evict chunks outside the active square.

---

## 3. Rendering

### Scene graph (`GameCanvas.svelte`)

- `worldRoot` — terrain, water, buildings (static chunk sync).
- `walkersRoot` — citizen/engineer instanced spheres (`syncWalkerMeshes`).
- `mistRoot` — unexplored overlays.

### Terrain / water: vertex-color batching (not per-cell groups)

**Problem:** One `Mesh` per sub-cell × 32×32 cells × many chunks → **~25k+ draw calls** (order of magnitude “28k” at 5×5 chunks).

**Solution** (`chunkRenderer.ts` → `syncChunkTerrain`, `syncChunkWater`):

1. For each sub-cell, append a small `BoxGeometry` with **per-vertex colors** (`setBoxVertexColors` + shared `MeshStandardMaterial` with `vertexColors: true`).
2. Batch into merged meshes via `appendPrimitiveBatch` / `flushPrimitiveBatches`, capped by `MAX_MERGE_PRIMITIVES` (**2048**) per batch in `constants.ts`.
3. Deposit surface tint: separate merged mesh per deposit **type**, not per cell overlay cubes.

Water uses the same pattern (`waterVertexColorMaterial`, procedural `waterColorAt`).

Rebuild triggers: `chunk.contentRevision` change (`ChunkManager.bumpChunkContent`), not every frame.

### Buildings: `InstancedMesh` per chunk

`syncChunkContents` → `buildInstancedBuildingGroup`:

- One template per bake key / LOD (`buildingBakedStore`, `templateForPlacement`).
- Traverse template meshes → buckets of `(geometry, material)` → **`InstancedMesh`** per bucket for all anchors in the chunk.
- **LOD:** `BUILDING_LOD_NEAR_SUB` (**55** sub-cells) full voxels; farther = simple box (`buildingLodForDistance`). LOD bucket: `BUILDING_LOD_BUCKET_SUB` (**32**) — rebuild buildings only when bucket changes, not every sub-cell of camera motion.

Extractors use shared pit meshes (`extractorVisuals.ts`), not solid voxel towers.

### Shadows

`createScene.ts`:

- **Off by default.** Opt in: `localStorage.setItem('civitas.shadows', '1')` then reload.
- When enabled: `renderer.shadowMap.autoUpdate = false` (manual updates).
- **Must** set `renderer.shadowMap.needsUpdate = true` after world mesh changes via `requestShadowMapUpdate(ctx)` — otherwise WebGL samples an invalid shadow map (errors, high CPU).
- `GameCanvas.refreshMeshes` calls `requestShadowMapUpdate` when `shadowsEnabled` after chunk rebuild.

### Other GPU guards

- `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))` (`createScene.ts`).
- Chunk groups: `frustumCulled = true` (walker instancing sets `frustumCulled = false` on citizen mesh — few instances).

### Materials

Shared caches: terrain/water materials, LOD colors (`buildingComposer.ts` `lodColorCache`), deposit tints, extractor materials. Avoid `new MeshStandardMaterial` per voxel color.

---

## 4. Worker IPC

### Main → worker

| Message | When | Notes |
| ------- | ---- | ----- |
| `initGrid` | Session start | Full maps + optional society/housing/upkeep |
| `syncCity` | After placement/erase/dig | Prefer **partial** delta |
| `sim.tick` | `WorkerBridge.scheduleSimTick` | `deltaMs = 1000 / simHz` |
| `governance.*` | UI actions | Tax, edict, trade |

**Delta sync:** `grid.collectSimSyncDelta()` (`chunkManager.ts`) returns dirty building/deposit/traffic/occupancy keys only; `WorkerBridge.syncCity` sets `partial: true`. Worker `applySync(..., partial)` merges into maps instead of replacing.

**Do not** send full `syncCity` every sim tick — only on init and when no delta is queued (placement should mark dirty keys).

### Worker → main (`sim.tickResult`)

| Field | Frequency |
| ----- | ----------- |
| `metrics` | Every tick |
| `resources` (inventory, denarii) | Every tick; HUD throttled 250 ms unless `slowTick` |
| `society` | **Slow tick only** |
| `deposits` | When production changed deposits |
| `walkers` | When non-empty; **paths stripped** (`path` omitted in worker) |
| `trafficRoads`, `extractorDigAnchors`, `housingUpdates`, `upkeepUpdates`, `engineers`, `disasters`, `socialEvents` | When applicable |

Main thread `applySimSideEffects` (`GameCanvas.svelte`) skips grid patches when `revision` unchanged **unless** traffic/disaster/dig/housing/upkeep deltas exist; walkers still update meshes.

### Pathfinding caps

| Constant | File | Value |
| -------- | ---- | ----- |
| `MAX_PATHFINDS_PER_TICK` | `sim/walkers.ts` | `5` |
| `maxSteps` (A*) | `sim/pathfind.ts` | default `120` |
| `MAX_WALKERS` | `constants.ts` | `50` |

Walkers cache `walker.path` and consume steps per tick; excess movement falls back to straight-line nudge.

### Road cache

`sim/roadsCache.ts`: `collectRoadCells` builds `{sx,sz}[]` from road buildings. `WalkerSimState` / `EngineerSimState` keep `roadCells` + `roadsDirty`; invalidated when `trafficRoads` upgrades roads (`invalidateWalkerRoads`, `invalidateEngineerRoads` in `tick.ts`).

### What NOT to send every tick

- Full `SocietySnapshot` (large nested clone) — slow tick only.
- Full building/deposit maps — use `collectSimSyncDelta`.
- Walker A* paths — main only needs positions/roles for instancing.
- Full grid `revision` mesh rebuild on main — use `contentRevision` per chunk + `refreshMeshes` early-out.

---

## 5. Perf overlay

**Enable:**

- URL: `?perf=1`
- Persist: `localStorage.setItem('civitas.perf', '1')`
- Toggle: backtick `` ` `` (`GameShell.svelte` → `togglePerf()`)

**UI:** `src/components/PerfOverlay.svelte` — reads `perfDisplay` store (`perf/perfMonitor.ts`).

**Metrics:**

| Label | Meaning |
| ----- | ------- |
| **rafFps** | `requestAnimationFrame` callbacks per second (loop wakeups) |
| **renderFps** | Frames that actually called `renderer.render` |
| **frameMs** | GPU/JS time for rendered frames only |
| **rendersPerSec** | Same as render draws per window |
| **simHz / simHzTarget** | Worker ticks measured vs `simHzForBuildingCount` |
| **lastTickMs** | Last worker tick duration |
| **lastSlowTickMs** | Last slow-tick subsystem cost (`economySlowMs` preferred) |
| **tri / dc / geo / tex** | `renderer.info` after a render |
| **vis / rebuild** | Loaded chunks; `recordMeshRebuild()` count from `refreshMeshes` |
| **worker breakdown** | `productionMs`, `walkersMs`, `economyFastMs`, etc. (only when perf mode posts `sim.tick` with `perf: true`) |

**Interpretation:** High **rafFps** with low **renderFps** is healthy (render-on-demand). If both are high and **dc** explodes, chunk rebuild or per-cell regression. **simHz** below target → worker overload (check `lastSlowTickMs` and pathfind).

---

## 6. Pitfalls / do not regress

### TDZ: `walkers` shadowing in worker

`game.worker.ts` holds module state `let walkers = createWalkerState()`. `runSimTick` uses `const walkers = input.walkers ?? …` (`sim/tick.ts`). **Never** introduce another `const walkers` in the worker message handler that references the module binding before initialization, or pass the wrong object back to `runSimTick` — mutating a fresh empty state breaks citizen sim. Prefer explicit names (`walkerState`) when refactoring.

### `shadowMap.autoUpdate = false` without `needsUpdate`

Always pair manual shadow maps with `requestShadowMapUpdate` after static mesh rebuilds. Missing update → shader errors and CPU spin.

### Per-cell color → ~28k draw calls

Do not assign one material/mesh group per terrain/water cell. Keep vertex-color merge batches.

### `onSimSnapshot` every rAF

Process tick results in `bridge.onTickResult` only. Do not re-run full `applySimSideEffects` + `syncCity` inside the render loop.

**Note:** `onBeforeRender` may call `refreshMeshes` for camera chunk/LOD — that is throttled by `grid.revision`, camera chunk key, and LOD bucket (`GameCanvas.refreshMeshes`).

### `cloneBakedGroup` per building

`buildingComposer.ts` `cloneBakedGroup` duplicates mesh children — OK for **template authoring**, not per-instance rendering. Chunk path must use `getOrCreateBakeTemplate` + `InstancedMesh` (`chunkRenderer.ts`). Regressing to clone-per-anchor allocates geometry and kills draw-call budget.

### `grid.ts` `dx++` in erase loops

Footprint clears must use bounded loops, e.g. `for (let dx = 0; dx < fp.w; dx++)`. Using `dx++` as the **for-loop update** with `dx <= fp.w` (or similar) clears a single column and leaves ghost occupancy — breaks sim/render sync.

### Other historical traps (still relevant)

| Issue | Correct approach |
| ----- | ---------------- |
| `syncChunkWorld` every frame unconditionally | Dirty `contentRevision` + `refreshMeshes` early-out |
| Deposit overlay cube per cell | Deposit tint merged into terrain batch |
| New material per blueprint voxel color | Shared / cached materials |
| Re-applying deposits on duplicate tick revision | `lastSimRevision` + delta checks in `applySimSideEffects` |
| Solid extractor voxel stacks | `extractorVisuals` pit meshes |

---

## 7. Future work (brief)

| Idea | Benefit | Status |
| ---- | ------- | ------ |
| **`mapHasRoad` cache** | `ProductionState.roadCellCount` + incremental `adjustRoadCellCount` on sync/traffic (`roadsCache.ts`, `production.ts`, `tick.ts`, `game.worker.ts`) | **Done** |
| **`tickBuildingUpkeep` incremental scan** | Upkeep entropy only iterates `state.buildings`; `syncUpkeepMap` on placement sync only (`buildingUpkeep.ts`) | **Done** |
| **`lowestConditionAnchor` index** | Sorted `needyList` rebuilt when stale (`buildingUpkeep.ts`, `engineers.ts`) | **Done** |
| **Instance matrix pool** | Reused `Matrix4` pool in `buildInstancedBuildingGroup` (`chunkRenderer.ts`) | **Done** |
| **Bake template eviction** | LRU cap 32 in `buildingBakedStore.ts` + composed `buildingTemplateCache` (`lruMap.ts`) | **Done** |
| **Production tick index** | `productionKeys` set; early exit when empty (`production.ts`) | **Done** |
| **Boot prefetch scope** | `BOOT_TERRAIN_PREFETCH_RADIUS_CHUNKS = 1`; loading screen skips full building bake prefetch (`preloadAssets.ts`) | **Done** |
| **Geometry worker** | Off main thread: terrain merge, bake expansion, optional meshopt | Open |
| **Terrain heightfield LOD** | Far chunks: single merged heightfield mesh per chunk (beyond surface-only stratum LOD in `chunkRenderer.ts`) | Open |
| **SharedArrayBuffer** | Zero-copy walker positions / traffic heat between threads (needs COOP/COEP headers) | Open |
| Transferable snapshot buffers | Smaller `postMessage` copies for large maps | Open |
| Fluid flow sim | Optional; static water v0 in `water.ts` / `ChunkRecord.fluids` | Open |
| **Mist radius** | Align `syncMistOverlays` with `RENDER_CHUNK_RADIUS` (today `+1` for a 7×7 ring) | Open |
| **Dug-terrain LOD** | Surface-only far LOD hides subsurface layers when `dugDepth > 0` at chunk edge | Open |

---

## Key file index

| Topic | Path |
| ----- | ---- |
| Sim loop driver | `src/lib/game/workerBridge.ts` |
| Worker entry | `src/workers/game.worker.ts` |
| Tick orchestration | `src/lib/game/sim/tick.ts` |
| Intervals / slow tick | `src/lib/game/sim/simIntervals.ts` |
| Metrics | `src/lib/game/sim/cityMetrics.ts` |
| Render loop | `src/lib/game/loop/renderLoop.ts` |
| Chunk render | `src/lib/three/chunkRenderer.ts` |
| Scene / shadows | `src/lib/three/createScene.ts` |
| Constants | `src/lib/game/constants.ts` |
| Protocol | `src/lib/game/protocol.ts` |
| Perf HUD | `src/lib/perf/perfMonitor.ts`, `src/components/PerfOverlay.svelte` |
| Game integration | `src/components/GameCanvas.svelte` |

---

## Changelog (optimization themes)

Early perf doc items still apply in spirit: per-chunk `contentRevision`, dirty terrain/building rebuild, throttled `refreshMeshes`, snapshot side-effect deduping, shared materials, static/dynamic split (`worldRoot` vs `walkersRoot`), deposit tint in terrain mesh, extractor pits, `MAX_MERGE_PRIMITIVES`, shortened civic blueprints. Instanced buildings and vertex-color terrain supersede “one InstancedMesh per block type” as a single future item.
