import { describe, expect, it } from 'vitest';
import { SUB_CELL_WORLD_SIZE, SUB_CELLS_PER_TILE } from './constants';
import {
  CANYON_ELEVATION_THRESHOLD,
  decodeTerrainSection,
  elevationWorldOffset,
  elevationWorldOffsetSmooth,
  encodeTerrainSection,
  generateTerrainSection,
  HILL_ELEVATION_THRESHOLD,
} from './terrainSection';
import { sampleElevationBilinear } from './terrainSurface';

describe('terrainSection', () => {
  it('encode/decode round-trips deposits and water', () => {
    const section = generateTerrainSection(2, -1, 42_069);
    const bytes = encodeTerrainSection(section);
    const decoded = decodeTerrainSection(bytes);
    expect(decoded).not.toBeNull();
    expect(decoded!.cx).toBe(2);
    expect(decoded!.cy).toBe(-1);
    expect(decoded!.worldSeed).toBe(42_069);
    expect(decoded!.deposits.size).toBe(section.deposits.size);
    expect(decoded!.fluids.size).toBe(section.fluids.size);
    expect(decoded!.elevation.size).toBe(section.elevation.size);
  });

  it('generation is deterministic for a seed', () => {
    const a = generateTerrainSection(0, 0, 99);
    const b = generateTerrainSection(0, 0, 99);
    expect(a.deposits.size).toBe(b.deposits.size);
    expect(a.fluids.size).toBe(b.fluids.size);
  });

  it('avoids interior sin-band rivers (full-width horizontal stripes)', () => {
    const section = generateTerrainSection(0, 0, 42_069);
    let heavyInteriorRows = 0;
    for (let lz = 6; lz < 26; lz++) {
      let waterInRow = 0;
      for (let lx = 0; lx < 32; lx++) {
        if (section.fluids.get(`${lx},${lz}`) === 'water') waterInRow++;
      }
      if (waterInRow >= 28) heavyInteriorRows++;
    }
    expect(heavyInteriorRows).toBeLessThan(2);
  });

  it('elevation varies across a section (not flat)', () => {
    const section = generateTerrainSection(0, 0, 42_069);
    const values = [...section.elevation.values()];
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(max - min).toBeGreaterThan(0.15);
  });

  it('bilinear smoothing reduces plateau steps between neighbors', () => {
    const section = generateTerrainSection(0, 0, 42_069);
    const sample = (sx: number, sz: number) =>
      section.elevation.get(`${sx},${sz}`) ?? section.elevation.get('0,0')!;
    let quantizedSteps = 0;
    let smoothRange = 0;
    for (let lz = 1; lz < 30; lz++) {
      for (let lx = 1; lx < 30; lx++) {
        const sx = lx;
        const sz = lz;
        const e = sample(sx, sz);
        const y0 = elevationWorldOffset(e);
        const y1 = elevationWorldOffset(sample(sx + 1, sz));
        if (y0 === y1 && e !== sample(sx + 1, sz)) quantizedSteps++;
        const mid = sampleElevationBilinear(sx, sz, 0.5, 0.5, sample);
        const yMid = elevationWorldOffsetSmooth(mid);
        const yCorner = elevationWorldOffsetSmooth(e);
        smoothRange = Math.max(smoothRange, Math.abs(yMid - yCorner));
      }
    }
    expect(quantizedSteps).toBeGreaterThan(10);
    expect(smoothRange).toBeGreaterThan(0);
  });

  it('includes canyon floors and hill tops', () => {
    const section = generateTerrainSection(0, 0, 42_069);
    const values = [...section.elevation.values()];
    const canyons = values.filter((e) => e < CANYON_ELEVATION_THRESHOLD).length;
    const hills = values.filter((e) => e > HILL_ELEVATION_THRESHOLD).length;
    expect(canyons).toBeGreaterThan(35);
    expect(hills).toBeGreaterThan(40);
  });

  it('maps elevation span to roughly one housing tile of vertical relief', () => {
    const section = generateTerrainSection(0, 0, 42_069);
    const values = [...section.elevation.values()];
    const tileWorld = SUB_CELLS_PER_TILE * SUB_CELL_WORLD_SIZE;
    const offsets = values.map((e) => elevationWorldOffset(e));
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeGreaterThan(tileWorld * 0.4);
    expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(tileWorld * 1.4);
  });
});
