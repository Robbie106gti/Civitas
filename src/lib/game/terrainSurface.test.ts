import { describe, expect, it } from 'vitest';
import { GameGrid } from './grid';
import { getFootprint } from './footprints';
import { STEEP_TERRAIN_ELEVATION_DELTA } from './sim/passability';
import { applyCommand } from './applyCommand';
import { subKey } from './chunkCoords';
import {
  gridElevationSampler,
  isFootprintSlopeValid,
  sampleElevationBilinear,
  buildingFootingAnchorY,
  sampleFootprintSurface,
  terrainColumnFillHeight,
  terrainColumnFillVoxelTops,
  terrainSurfaceWorldYAt,
  terrainSurfaceWorldYSmooth,
  validateBuildingTerrain,
} from './terrainSurface';
import {
  elevationWorldOffset,
  elevationWorldOffsetSmooth,
  TERRAIN_VOXEL_WORLD_SIZE,
} from './terrainSection';
import { CHUNK_SIZE, MAX_MERGE_PRIMITIVES, TERRAIN_SURFACE_SUBDIV } from './constants';
import { visibleStackLayers, resolveTerrainStack } from './terrain';

const VOXEL_STEP = TERRAIN_VOXEL_WORLD_SIZE * 2;
const ELEVATION_SEA_LEVEL = 0.38;
const ELEVATION_STEP_SCALE = 28;

function smoothLift(elev: number): number {
  return (elev - ELEVATION_SEA_LEVEL) * ELEVATION_STEP_SCALE * VOXEL_STEP;
}

describe('terrainSurface', () => {
  it('bilinear interpolation blends corner elevations', () => {
    const sample = (sx: number, sz: number) => {
      if (sx === 0 && sz === 0) return 0.2;
      if (sx === 1 && sz === 0) return 0.4;
      if (sx === 0 && sz === 1) return 0.3;
      return 0.5;
    };
    expect(sampleElevationBilinear(0, 0, 0.5, 0.5, sample)).toBeCloseTo(0.35, 5);
  });

  it('smooth world offset is continuous across small elevation deltas', () => {
    const a = elevationWorldOffsetSmooth(0.4);
    const b = elevationWorldOffsetSmooth(0.41);
    expect(Math.abs(b - a)).toBeLessThan(elevationWorldOffset(0.5) - elevationWorldOffset(0.4));
  });

  it('bedrock fill spans from ground to stack base on hills', () => {
    const voxelStep = 0.04;
    const tops = terrainColumnFillVoxelTops(0.5, 2, voxelStep);
    expect(tops.length).toBeGreaterThan(5);
    expect(tops[0]).toBe(voxelStep);
    expect(tops[tops.length - 1]).toBeLessThanOrEqual(0.5 - 2 * voxelStep + 1e-6);
  });

  it('no bedrock fill at sea level with shallow stack', () => {
    const voxelStep = 0.04;
    expect(terrainColumnFillVoxelTops(0, 2, voxelStep)).toEqual([]);
  });

  it('fill depth scales with hill, plain rise, and valley elevation', () => {
    const stackLayers = visibleStackLayers(resolveTerrainStack(null), 0).length;
    const hill = terrainColumnFillVoxelTops(smoothLift(0.68), stackLayers, VOXEL_STEP);
    const plainRise = terrainColumnFillVoxelTops(smoothLift(0.52), stackLayers, VOXEL_STEP);
    const valley = terrainColumnFillVoxelTops(smoothLift(0.3), stackLayers, VOXEL_STEP);
    expect(hill.length).toBeGreaterThan(5);
    expect(plainRise.length).toBeGreaterThan(0);
    expect(hill.length).toBeGreaterThan(plainRise.length);
    expect(valley).toEqual([]);
    expect(hill[0]).toBe(VOXEL_STEP);
    expect(hill[hill.length - 1]!).toBeLessThanOrEqual(
      smoothLift(0.68) - stackLayers * VOXEL_STEP + 1e-6,
    );
  });

  it('fill height matches stacked voxel tops span', () => {
    const stackLayers = visibleStackLayers(resolveTerrainStack(null), 0).length;
    const lift = smoothLift(0.55);
    const fillH = terrainColumnFillHeight(lift, stackLayers, VOXEL_STEP);
    const tops = terrainColumnFillVoxelTops(lift, stackLayers, VOXEL_STEP);
    expect(fillH).toBeGreaterThan(0);
    expect(tops[tops.length - 1]).toBeLessThanOrEqual(fillH + 1e-6);
  });

  it('corner-quad terrain uses O(stack) surface prims per cell, not subdiv² voxels', () => {
    const stackLayers = visibleStackLayers(resolveTerrainStack(null), 0).length;
    const lift = smoothLift(0.68);
    const fillVoxels = terrainColumnFillVoxelTops(lift, stackLayers, VOXEL_STEP).length;
    expect(fillVoxels).toBeGreaterThan(4);
    const legacyMicroPerCell =
      TERRAIN_SURFACE_SUBDIV * TERRAIN_SURFACE_SUBDIV * (fillVoxels + stackLayers);
    const cornerQuadPerCell = 1 + stackLayers;
    const primitivesPerChunk = CHUNK_SIZE * CHUNK_SIZE * cornerQuadPerCell;
    expect(legacyMicroPerCell).toBeGreaterThan(cornerQuadPerCell * 8);
    expect(primitivesPerChunk).toBeLessThan(12_000);
    expect(primitivesPerChunk).toBeLessThan(MAX_MERGE_PRIMITIVES * 2);
  });

  it('footprint baseY uses lowest corner and footingY highest', () => {
    const sample = (sx: number, sz: number) => (sx + sz) * 0.05 + 0.4;
    const fp = getFootprint('house');
    const surface = sampleFootprintSurface(10, 10, fp, sample, () => 0);
    const ys = surface.corners.map((c) => c.y);
    expect(surface.baseY).toBe(Math.min(...ys));
    expect(surface.footingY).toBe(Math.max(...ys));
  });

  it('building anchor uses center Y on slopes, not max corner', () => {
    const sample = (sx: number, sz: number) => 0.42 + sx * 0.012 + sz * 0.009;
    const fp = getFootprint('quarry');
    const anchorSx = 30;
    const anchorSz = 40;
    const surface = sampleFootprintSurface(anchorSx, anchorSz, fp, sample, () => 0);
    const centerX = anchorSx + (fp.w - 1) * 0.5;
    const centerZ = anchorSz + (fp.h - 1) * 0.5;
    const csx = Math.floor(centerX);
    const csz = Math.floor(centerZ);
    const terrainCenterY = terrainSurfaceWorldYSmooth(
      csx,
      csz,
      centerX - csx,
      centerZ - csz,
      sample,
      0,
    );
    expect(surface.centerY).toBeCloseTo(terrainCenterY, 4);
    const anchorY = buildingFootingAnchorY(surface, false);
    expect(surface.footingY).toBeGreaterThan(terrainCenterY + 0.02);
    expect(anchorY).toBeLessThan(surface.footingY);
    expect(anchorY).toBeLessThan(surface.centerY);
    expect(anchorY + VOXEL_STEP * 0.35 * 0.5).toBeCloseTo(surface.centerY, 2);
  });

  it('extractor anchor uses lowest corner', () => {
    const sample = (sx: number, sz: number) => 0.4 + sx * 0.01;
    const fp = getFootprint('clay_pit');
    const surface = sampleFootprintSurface(5, 5, fp, sample, () => 0);
    expect(buildingFootingAnchorY(surface, true)).toBe(surface.baseY);
  });

  it('rejects steep footprint placement', () => {
    const grid = new GameGrid(16, 16, 88_001);
    const sx = 50;
    const sz = 50;
    const chunk = grid.chunks.getChunkAtSub(sx, sz);
    const key = (x: number, z: number) => subKey(x, z);
    chunk.fluids.delete(key(sx, sz));
    chunk.fluids.delete(key(sx + 1, sz));
    chunk.elevation.set(key(sx, sz), 0.35);
    chunk.elevation.set(key(sx + 1, sz), 0.35 + STEEP_TERRAIN_ELEVATION_DELTA + 0.05);

    const check = validateBuildingTerrain(grid, sx, sz, 'house');
    expect(check).toEqual({ ok: false, reason: 'Terrain too steep' });
  });

  it('allows gentle slopes and places building with aligned footing', () => {
    const grid = new GameGrid(16, 16, 88_002);
    const sx = 200;
    const sz = 200;
    const fp = getFootprint('house');
    const flatElev = 0.45;
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const csx = sx + dx;
        const csz = sz + dz;
        const cellChunk = grid.chunks.getChunkAtSub(csx, csz);
        cellChunk.fluids.delete(subKey(csx, csz));
        cellChunk.elevation.set(subKey(csx, csz), flatElev + dx * 0.008);
      }
    }
    expect(isFootprintSlopeValid(sx, sz, fp, gridElevationSampler(grid))).toBe(true);

    const sample = gridElevationSampler(grid);
    const beforeSurface = sampleFootprintSurface(sx, sz, fp, sample, (x, z) =>
      grid.getTerrain(x, z).dugDepth,
    );
    const beforeAnchor = buildingFootingAnchorY(beforeSurface, false);
    const result = applyCommand(grid, { type: 'placeBuilding', tool: 'house', sx, sz });
    expect(result).toEqual({ ok: true });
    const surface = sampleFootprintSurface(sx, sz, fp, sample, (x, z) =>
      grid.getTerrain(x, z).dugDepth,
    );
    expect(buildingFootingAnchorY(surface, false)).toBeCloseTo(beforeAnchor, 2);
  });
});
