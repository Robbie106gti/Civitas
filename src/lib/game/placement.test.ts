import { describe, expect, it } from 'vitest';
import { applyCommand } from './applyCommand';
import { GameGrid } from './grid';
import { subKey } from './chunkCoords';
import type { NaturalDeposit } from './types';

function seedDeposit(grid: GameGrid, sx: number, sz: number, deposit: NaturalDeposit): void {
  const chunk = grid.chunks.getChunkAtSub(sx, sz);
  chunk.deposits.set(subKey(sx, sz), deposit);
}

function clearDepositsInFootprint(
  grid: GameGrid,
  sx: number,
  sz: number,
  w: number,
  h: number,
): void {
  for (let dz = 0; dz < h; dz++) {
    for (let dx = 0; dx < w; dx++) {
      const csx = sx + dx;
      const csz = sz + dz;
      const chunk = grid.chunks.getChunkAtSub(csx, csz);
      chunk.deposits.delete(subKey(csx, csz));
      chunk.fluids.delete(subKey(csx, csz));
    }
  }
}

describe('placement', () => {
  it('places house on clear 10×10 footprint without deposits', () => {
    const grid = new GameGrid(16, 16, 99_001);
    const sx = 50;
    const sz = 50;
    clearDepositsInFootprint(grid, sx, sz, 10, 10);

    const result = applyCommand(grid, { type: 'placeBuilding', tool: 'house', sx, sz });
    expect(result).toEqual({ ok: true });
    expect(grid.getConstructionSite(sx, sz)?.building).toBe('house');
  });

  it('allows house over sparse deposits (no deposit gate for housing)', () => {
    const grid = new GameGrid(16, 16, 99_002);
    const sx = 80;
    const sz = 80;
    seedDeposit(grid, sx, sz, { type: 'clay', richness: 50 });

    const result = applyCommand(grid, { type: 'placeBuilding', tool: 'house', sx, sz });
    expect(result).toEqual({ ok: true });
  });

  it('requires clay deposit for clay_pit', () => {
    const grid = new GameGrid(16, 16, 99_003);
    let sx = 120;
    let sz = 120;
    for (let probe = 0; probe < 40; probe++) {
      sx = 40 + probe * 11;
      sz = 40 + probe * 13;
      clearDepositsInFootprint(grid, sx, sz, 10, 10);
      let hasClay = false;
      for (let dz = 0; dz < 10 && !hasClay; dz++) {
        for (let dx = 0; dx < 10; dx++) {
          if (grid.getDeposit(sx + dx, sz + dz)?.type === 'clay') hasClay = true;
        }
      }
      if (!hasClay) break;
    }

    const fail = applyCommand(grid, { type: 'placeBuilding', tool: 'clay_pit', sx, sz });
    expect(fail).toEqual({
      ok: false,
      reason: 'Requires clay deposit under footprint',
    });

    seedDeposit(grid, sx + 2, sz + 2, { type: 'clay', richness: 80 });
    const ok = applyCommand(grid, { type: 'placeBuilding', tool: 'clay_pit', sx, sz });
    expect(ok).toEqual({ ok: true });
  });

  it('requires water adjacent for dock', () => {
    const grid = new GameGrid(16, 16, 99_004);
    const sx = 160;
    const sz = 160;
    clearDepositsInFootprint(grid, sx, sz, 10, 10);
    for (let dz = -1; dz <= 10; dz++) {
      for (let dx = -1; dx <= 10; dx++) {
        const csx = sx + dx;
        const csz = sz + dz;
        grid.chunks.getChunkAtSub(csx, csz).fluids.delete(subKey(csx, csz));
      }
    }

    const fail = applyCommand(grid, { type: 'placeBuilding', tool: 'dock', sx, sz });
    expect(fail).toEqual({ ok: false, reason: 'Dock must be adjacent to water' });

    const chunk = grid.chunks.getChunkAtSub(sx, sz);
    chunk.fluids.set(subKey(sx + 10, sz + 5), 'water');

    const ok = applyCommand(grid, { type: 'placeBuilding', tool: 'dock', sx, sz });
    expect(ok).toEqual({ ok: true });
  });
});
