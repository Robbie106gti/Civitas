# Civitas

Roman city-builder for the web — offline v0 with Three.js micro-grid voxels, chunked infinite terrain, Web Worker sim, and PWA shell. Inspired by classic Caesar-style city builders; not affiliated with any commercial title.

## Requirements

- Node.js 20+
- npm 10+

## Commands

| Script                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `npm run dev`           | Start Vite dev server                    |
| `npm run dev -- --host` | Dev server on LAN (test on phone)        |
| `npm run build`         | Production build + service worker        |
| `npm run preview`       | Serve production build (test PWA caches) |
| `npm run check`         | `svelte-check` + TypeScript              |
| `npm run lint`          | ESLint                                   |
| `npm run format`        | Prettier write                           |
| `npm run format:check`  | Prettier CI check                        |
| `npm run test`          | Vitest unit tests                        |

## Architecture (v0.2)

### Micro-grid

- **`SUB_CELLS_PER_TILE = 10`** — one legacy macro tile = 10×10 sub-cells (`SUB_CELL_WORLD_SIZE = 0.1` world units).
- Buildings use **footprints** (`src/lib/game/footprints.ts`) and **blueprints** (`src/lib/game/blueprints.ts`).
- Meshes are composed from small cubes via `src/lib/three/buildingComposer.ts` (`BufferGeometryUtils.mergeGeometries` per color).

| Building        | Footprint (sub-cells) |
| --------------- | --------------------- |
| House           | 10×10                 |
| Forum           | 20×20                 |
| Extractors/farm | 10×10                 |
| Roads           | 1×1 per cell          |

### Chunks

- **`CHUNK_SIZE = 32`** sub-cells per chunk edge.
- `ChunkManager` (`src/lib/game/chunkManager.ts`) loads procedural deposits per chunk from `worldSeed`.
- **`ACTIVE_CHUNK_RADIUS = 2`** → 5×5 chunks kept in memory around the camera.
- **`RENDER_CHUNK_RADIUS = 3`** — geometry only for nearby chunks (`src/lib/three/chunkRenderer.ts`).

### Fog & exploration

- Exponential fog in `createScene.ts` (Roman sky palette).
- Unexplored chunks get a mist plane until the camera visits them (`exploredChunks` set).
- Distant chunks are not meshed beyond render radius.

### Sims & traffic

- Up to **`MAX_WALKERS = 50`** citizens pathfind on passable sub-cells (roads/plazas) in the worker (`sim/walkers.ts`, `sim/pathfind.ts`).
- **Traffic heat** per sub-cell decays each tick; thresholds auto-place `dirt_path` → `road` → `highway` (`sim/traffic.ts`).

### Animals & disasters

- **Animals:** stub wander near tree deposits (`sim/animals.ts`).
- **Disasters:** random events (`sim/disasters.ts`); **fire** removes buildings; earthquake/flood/plague show banners (stub effects).
- UI disaster toast in the app header region.

### Worker / save

- Dual-loop: main thread render @ display rate, worker sim @ 12 Hz.
- **Save format v4** (`SAVE_FORMAT_VERSION = 4`): sparse `placements`, road `cells`, `deposits`, `traffic`, `exploredChunks`. v3 macro saves auto-migrate (×10 sub-grid).

## v0 features

- Chunked “infinite” map with orbit camera pan/zoom
- Grouped toolbar — tools place sub-grid footprints
- Natural deposits seeded per chunk
- Supply-chain + governance (religion, taxes, politics, trade)
- PWA with Workbox caches for `/models/**`

## Economy & society

Each sim tick (~12 Hz), the worker runs **production**, **walkers/traffic**, **animals/disasters**, then **economy**.

See prior sections in this README for religion, taxes, politics, and trade rules. Placement still does not deduct build costs (testing).

### Placement rules

- **Housing / civic / factories** — need empty footprint (no existing building); may overlap natural deposits.
- **Farms** — same; deposits allowed.
- **Extractors** — require matching deposit under the 10×10 footprint; placing one **digs** terrain down on matching cells.
- **Roads** — flatten terrain to surface height on that sub-cell.

### Performance

See [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) for the performance architecture: worker sim on a timer (12 Hz, 4 Hz for tiny cities), render-on-demand on the main thread, chunk dirty-rebuild rules, worker IPC deltas, pitfalls to avoid, and the dev overlay (`?perf=1`, backtick toggle, or `localStorage` key `civitas.perf`). AI agents and contributors should also read [`AGENTS.md`](AGENTS.md).

### Terrain

Per sub-cell **layer** (grass, dirt, clay, rock, sand) and **height** (0 = surface, negative = dug). Chunk terrain meshes rebuild only when that chunk’s `contentRevision` changes.

## Environment

Copy `.env.example` to `.env.local` when wiring Supabase (Online-1).

## Versioning

`package.json` `version` is the single source of truth (`APP_VERSION` / Workbox cache names).

## Roadmap

- **Online-1** — Supabase auth, city save/load
- **Online-2** — Companion mode (phone toolbar + QR join)
- **Online-3** — Symmetric co-op via op log
