import { GameGrid } from './grid';
import { DEFAULT_MACRO_SIZE, DEFAULT_WORLD_SEED, SUB_CELLS_PER_TILE } from './constants';
import { BOOT_TERRAIN_PREFETCH_RADIUS_CHUNKS } from './terrainSection';
import { prefetchBakedTerrainSections } from './terrainBakedStore';
import { subToChunk } from './chunkCoords';

/** Warm terrain near world center before the first game frame (building bakes load on demand). */
export async function preloadGameAssets(): Promise<void> {
  const grid = new GameGrid(DEFAULT_MACRO_SIZE, DEFAULT_MACRO_SIZE, DEFAULT_WORLD_SEED);
  const centerSx = Math.floor((grid.width * SUB_CELLS_PER_TILE) / 2);
  const centerSz = Math.floor((grid.height * SUB_CELLS_PER_TILE) / 2);
  const { cx, cy } = subToChunk(centerSx, centerSz);
  await prefetchBakedTerrainSections(
    grid.worldSeed,
    cx,
    cy,
    BOOT_TERRAIN_PREFETCH_RADIUS_CHUNKS,
  );
  grid.chunks.refreshTerrainFromBake(cx, cy, BOOT_TERRAIN_PREFETCH_RADIUS_CHUNKS + 1);
}
