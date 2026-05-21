# Agent onboarding (Civitas)

Read [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) **before** changing simulation, rendering, worker IPC, or chunk/mesh code.

**Boot bundle:** Three.js and `GameCanvas` load only when entering play (`App.svelte` / `GameShell.svelte` dynamic `import()`); the worker stays a separate chunk. `prefetchPlayBundles()` warms those chunks during loading/menu — see [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md) (Build / bundle).

## Key files

| Area | Path |
| ---- | ---- |
| Worker bridge / sim scheduling | `src/lib/game/workerBridge.ts` |
| Worker entry | `src/workers/game.worker.ts` |
| Sim tick + fast/slow tiers | `src/lib/game/sim/tick.ts` |
| Sim intervals (`SIM_TICK_HZ`, slow tick) | `src/lib/game/sim/simIntervals.ts` |
| Render-on-demand loop | `src/lib/game/loop/renderLoop.ts` |
| Chunk terrain/buildings | `src/lib/three/chunkRenderer.ts` |
| Game integration | `src/components/GameCanvas.svelte` |

Full index: [`docs/PERFORMANCE.md` § Key file index](docs/PERFORMANCE.md#key-file-index).

## Perf overlay

- URL: `?perf=1`
- Persist: `localStorage.setItem('civitas.perf', '1')`
- Toggle in-game: backtick `` ` ``

Details: [`docs/PERFORMANCE.md` §5](docs/PERFORMANCE.md#5-perf-overlay).

## Do not regress

- **Worker `walkers` TDZ** — do not shadow module `walkers` in `game.worker.ts`; wrong binding breaks citizen sim.
- **Shadow maps** — with `shadowMap.autoUpdate = false`, call `requestShadowMapUpdate` after static mesh rebuilds.
- **Terrain/water** — keep vertex-color merge batches; one mesh/material per sub-cell blows draw calls (~28k).
- **Sim vs render** — apply tick results in `bridge.onTickResult` only; do not run full `applySimSideEffects` + `syncCity` every rAF.
- **Buildings** — chunk rendering uses `InstancedMesh` + bake templates; not `cloneBakedGroup` per anchor.

More pitfalls: [`docs/PERFORMANCE.md` §6](docs/PERFORMANCE.md#6-pitfalls--do-not-regress).

## Future work

Open optimizations and status table: [`docs/PERFORMANCE.md` §7](docs/PERFORMANCE.md#7-future-work-brief).
