import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { buildTicksFor } from './construction';
import { subKey } from './chunkCoords';
import { GameGrid } from './grid';
import { getFootprint } from './footprints';
import { CLAY_TERRAIN_STACK } from './terrainBlueprints';
import {
  EXTRACTOR_FOOTPRINT_DUG_DEPTH,
  visibleStackLayers,
  surfaceLayer,
  resolveTerrainStack,
  extractorTargetDugDepth,
} from './terrain';
import { createEmptyInventory } from './inventory';
import type { NaturalDeposit } from './types';

function seedDeposit(grid: GameGrid, sx: number, sz: number, deposit: NaturalDeposit): void {
  const chunk = grid.chunks.getChunkAtSub(sx, sz);
  chunk.deposits.set(subKey(sx, sz), deposit);
}

describe('terrain matrix', () => {
  it('clay deposit uses layered stack with grass surface', () => {
    const stack = resolveTerrainStack({ type: 'clay', richness: 50 });
    expect(stack).toEqual(CLAY_TERRAIN_STACK);
    expect(surfaceLayer(stack, 0)).toBe('grass');
  });

  it('digging exposes underlying stratum', () => {
    const stack = CLAY_TERRAIN_STACK;
    expect(surfaceLayer(stack, 1)).toBe('dirt');
    expect(visibleStackLayers(stack, 2)).toEqual(['rock', 'clay_layer', 'clay_layer']);
  });

  it('clay_pit placement digs entire footprint uniformly', () => {
    const grid = new GameGrid(16, 16, 77_001);
    const sx = 40;
    const sz = 40;
    const fp = getFootprint('clay_pit');
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        seedDeposit(grid, sx + dx, sz + dz, { type: 'clay', richness: 80 });
      }
    }
    const target = extractorTargetDugDepth(resolveTerrainStack({ type: 'clay', richness: 80 }));

    const result = applyCommand(grid, { type: 'placeBuilding', tool: 'clay_pit', sx, sz });
    expect(result).toEqual({ ok: true });
    const ticks = buildTicksFor('clay_pit');
    for (let i = 0; i < ticks; i++) grid.tickConstruction();
    expect(target).toBe(EXTRACTOR_FOOTPRINT_DUG_DEPTH);
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        expect(grid.getTerrain(sx + dx, sz + dz).dugDepth).toBe(target);
      }
    }
  });

  it('digTerrain command lowers sub-cell', () => {
    const grid = new GameGrid(16, 16, 77_002);
    const sx = 200;
    const sz = 200;
    const chunk = grid.chunks.getChunkAtSub(sx, sz);
    chunk.fluids.delete(subKey(sx, sz));
    const before = grid.getTerrain(sx, sz).dugDepth;
    const result = applyCommand(grid, { type: 'digTerrain', sx, sz });
    expect(result).toEqual({ ok: true });
    expect(grid.getTerrain(sx, sz).dugDepth).toBe(before + 1);
  });

  it('persists dug terrain in snapshot round-trip', () => {
    const grid = new GameGrid(8, 8, 77_003);
    const sx = 20;
    const sz = 20;
    grid.chunks.getChunkAtSub(sx, sz).fluids.delete(subKey(sx, sz));
    applyCommand(grid, { type: 'digTerrain', sx, sz });

    const snap = grid.toSnapshot({ denarii: 0, inventory: createEmptyInventory() });
    const loaded = GameGrid.fromSnapshot(snap);
    expect(loaded.getTerrain(sx, sz).dugDepth).toBe(1);
  });
});
