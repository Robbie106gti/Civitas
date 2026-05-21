import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { buildTicksFor } from './construction';
import { getFootprint } from './footprints';
import { GameGrid } from './grid';
import { subKey } from './chunkCoords';
import { gridElevationSampler } from './terrainSurface';

function clearFootprint(grid: GameGrid, sx: number, sz: number, w: number, h: number): void {
  for (let dz = 0; dz < h; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const csx = sx + dx;
      const csz = sz + dz;
      const chunk = grid.chunks.getChunkAtSub(csx, csz);
      chunk.deposits.delete(subKey(csx, csz));
      chunk.fluids.delete(subKey(csx, csz));
      chunk.elevation.set(subKey(csx, csz), 0.35);
    }
  }
}

describe('construction', () => {
  it('place creates site at progress 0, not finished building', () => {
    const grid = new GameGrid(16, 16, 88_001);
    const sx = 50;
    const sz = 50;
    clearFootprint(grid, sx, sz, 10, 10);

    const result = applyCommand(grid, { type: 'placeBuilding', tool: 'house', sx, sz });
    expect(result).toEqual({ ok: true });
    expect(grid.getBuilding(sx, sz)).toBeNull();
    const site = grid.getConstructionSite(sx, sz);
    expect(site?.building).toBe('house');
    expect(site?.progress).toBe(0);
    expect(site?.ticksElapsed).toBe(0);
    expect(site?.phase).toBe('leveling');
  });

  it('levels footprint to lowest elevation before building', () => {
    const grid = new GameGrid(16, 16, 88_010);
    const sx = 90;
    const sz = 90;
    const fp = getFootprint('house');
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const csx = sx + dx;
        const csz = sz + dz;
        const chunk = grid.chunks.getChunkAtSub(csx, csz);
        chunk.deposits.delete(subKey(csx, csz));
        chunk.fluids.delete(subKey(csx, csz));
        chunk.elevation.set(subKey(csx, csz), 0.35 + dx * 0.025 + dz * 0.01);
      }
    }
    const sample = gridElevationSampler(grid);
    let minElev = Infinity;
    let maxElev = -Infinity;
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const elev = sample(sx + dx, sz + dz);
        minElev = Math.min(minElev, elev);
        maxElev = Math.max(maxElev, elev);
      }
    }
    expect(maxElev).toBeGreaterThan(minElev + 0.001);

    applyCommand(grid, { type: 'placeBuilding', tool: 'house', sx, sz });
    const site = grid.getConstructionSite(sx, sz)!;
    expect(site.phase).toBe('leveling');

    for (let i = 0; i < site.levelingTicks; i++) {
      grid.tickConstruction();
    }

    expect(site.phase).toBe('building');
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        expect(grid.chunks.getElevationAt(sx + dx, sz + dz)).toBeCloseTo(
          site.targetElev,
          4,
        );
      }
    }
  });

  it('completes house after buildTicks', () => {
    const grid = new GameGrid(16, 16, 88_002);
    const sx = 60;
    const sz = 60;
    clearFootprint(grid, sx, sz, 10, 10);

    expect(applyCommand(grid, { type: 'placeBuilding', tool: 'house', sx, sz })).toEqual({
      ok: true,
    });
    const ticks = buildTicksFor('house');
    expect(ticks).toBeGreaterThan(0);
    expect(grid.getConstructionSite(sx, sz)).not.toBeNull();

    for (let i = 0; i < ticks; i++) {
      grid.tickConstruction();
    }

    expect(grid.getBuilding(sx, sz)).toBe('house');
    expect(grid.getConstructionSite(sx, sz)).toBeNull();
  });

  it('erase removes construction site', () => {
    const grid = new GameGrid(16, 16, 88_003);
    const sx = 70;
    const sz = 70;
    clearFootprint(grid, sx, sz, 10, 10);

    applyCommand(grid, { type: 'placeBuilding', tool: 'house', sx, sz });
    const erased = applyCommand(grid, { type: 'eraseBuilding', sx, sz });
    expect(erased).toEqual({ ok: true });
    expect(grid.getConstructionSite(sx, sz)).toBeNull();
    expect(grid.getBuilding(sx, sz)).toBeNull();
  });
});
