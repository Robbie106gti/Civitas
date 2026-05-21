import type { Footprint } from './footprints';
import { getFootprint, isRoadType } from './footprints';
import type { GameGrid } from './grid';
import {
  elevationWorldOffset,
  elevationWorldOffsetSmooth,
  terrainElevationAt,
} from './terrainSection';
import { isSteepTerrainSlope } from './sim/passability';
import type { BuildingType } from './types';
import { SUB_CELL_WORLD_SIZE, TERRAIN_SURFACE_SUBDIV } from './constants';
import { TERRAIN_VOXEL_WORLD_SIZE } from './terrainSection';
export type ElevationSampler = (sx: number, sz: number) => number;

/** Bilinear blend of normalized elevation across sub-cell corners. */
export function sampleElevationBilinear(
  sx: number,
  sz: number,
  u: number,
  v: number,
  sample: ElevationSampler,
): number {
  const uu = Math.max(0, Math.min(1, u));
  const vv = Math.max(0, Math.min(1, v));
  const e00 = sample(sx, sz);
  const e10 = sample(sx + 1, sz);
  const e01 = sample(sx, sz + 1);
  const e11 = sample(sx + 1, sz + 1);
  const ex0 = e00 + (e10 - e00) * uu;
  const ex1 = e01 + (e11 - e01) * uu;
  return ex0 + (ex1 - ex0) * vv;
}

export function gridElevationSampler(grid: GameGrid): ElevationSampler {
  return (sx, sz) => grid.chunks.getElevationAt(sx, sz);
}

/** World-space terrain surface Y at sub-cell center (quantized steps, sim/placement). */
export function terrainSurfaceWorldYAt(
  sx: number,
  sz: number,
  sample: ElevationSampler,
  dugDepth = 0,
): number {
  const elev = sample(sx, sz);
  const lift = elevationWorldOffset(elev);
  const digDrop =
    dugDepth > 0
      ? dugDepth * (SUB_CELL_WORLD_SIZE / TERRAIN_SURFACE_SUBDIV) * 2
      : 0;
  return lift - digDrop;
}

/** Smooth world Y for rendering micro-terrain and building footing. */
export function terrainSurfaceWorldYSmooth(
  sx: number,
  sz: number,
  u: number,
  v: number,
  sample: ElevationSampler,
  dugDepth = 0,
): number {
  const elev = sampleElevationBilinear(sx, sz, u, v, sample);
  const lift = elevationWorldOffsetSmooth(elev);
  const digDrop =
    dugDepth > 0
      ? dugDepth * (SUB_CELL_WORLD_SIZE / TERRAIN_SURFACE_SUBDIV) * 2
      : 0;
  return lift - digDrop;
}

/** World-space height from y=0 up to the bottom of the visible voxel stack (0 if none). */
export function terrainColumnFillHeight(
  surfaceTopY: number,
  stackLayerCount: number,
  voxelStep: number,
): number {
  const limit = surfaceTopY - stackLayerCount * voxelStep;
  if (limit < voxelStep * 0.5) return 0;
  return limit;
}

/** World Y tops for fill voxels from bedrock (y=0) up to the bottom of the visible stack. */
export function terrainColumnFillVoxelTops(
  surfaceTopY: number,
  stackLayerCount: number,
  voxelStep: number,
): number[] {
  const limit = terrainColumnFillHeight(surfaceTopY, stackLayerCount, voxelStep);
  if (limit === 0) return [];
  const tops: number[] = [];
  for (let top = voxelStep; top <= limit + 1e-6; top += voxelStep) {
    tops.push(top);
  }
  return tops;
}

export interface FootprintSurfaceSample {
  /** Lowest corner Y (excavations / reference). */
  baseY: number;
  /** Highest corner Y (reference / slope checks). */
  footingY: number;
  /** Smooth surface Y at footprint center. */
  centerY: number;
  corners: { sx: number; sz: number; y: number }[];
  maxElevDelta: number;
}

/** Normalized elevation of the lowest sub-cell in a footprint (building pad target). */
export function footprintMinElevation(
  anchorSx: number,
  anchorSz: number,
  fp: Footprint,
  sample: ElevationSampler,
): number {
  let min = Infinity;
  for (let dz = 0; dz < fp.h; dz++) {
    for (let dx = 0; dx < fp.w; dx++) {
      min = Math.min(min, sample(anchorSx + dx, anchorSz + dz));
    }
  }
  return min;
}

export function sampleFootprintSurface(
  anchorSx: number,
  anchorSz: number,
  fp: Footprint,
  sample: ElevationSampler,
  dugAt: (sx: number, sz: number) => number,
): FootprintSurfaceSample {
  const cornerDefs = [
    { sx: anchorSx, sz: anchorSz, u: 0, v: 0 },
    { sx: anchorSx + fp.w - 1, sz: anchorSz, u: 1, v: 0 },
    { sx: anchorSx, sz: anchorSz + fp.h - 1, u: 0, v: 1 },
    { sx: anchorSx + fp.w - 1, sz: anchorSz + fp.h - 1, u: 1, v: 1 },
  ] as const;
  const corners: { sx: number; sz: number; y: number }[] = [];
  let minY = Infinity;
  let maxY = -Infinity;
  let minElev = Infinity;
  let maxElev = -Infinity;
  for (const def of cornerDefs) {
    const elev = sampleElevationBilinear(def.sx, def.sz, def.u, def.v, sample);
    minElev = Math.min(minElev, elev);
    maxElev = Math.max(maxElev, elev);
    const y = terrainSurfaceWorldYSmooth(
      def.sx,
      def.sz,
      def.u,
      def.v,
      sample,
      dugAt(def.sx, def.sz),
    );
    corners.push({ sx: def.sx, sz: def.sz, y });
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const centerX = anchorSx + (fp.w - 1) * 0.5;
  const centerZ = anchorSz + (fp.h - 1) * 0.5;
  const centerSx = Math.floor(centerX);
  const centerSz = Math.floor(centerZ);
  const centerY = terrainSurfaceWorldYSmooth(
    centerSx,
    centerSz,
    centerX - centerSx,
    centerZ - centerSz,
    sample,
    dugAt(centerSx, centerSz),
  );
  return {
    baseY: minY,
    footingY: maxY,
    centerY,
    corners,
    maxElevDelta: maxElev - minElev,
  };
}

/** Slight embed to avoid z-fighting with terrain quads. */
const BUILDING_FOOTING_SINK = TERRAIN_VOXEL_WORLD_SIZE * 0.35;

/**
 * World Y for instanced building anchor (footprint min corner).
 * Extractors sit on the lowest corner; standard buildings use footprint center.
 */
export function buildingFootingAnchorY(
  surface: FootprintSurfaceSample,
  isExtractor: boolean,
): number {
  if (isExtractor) return surface.baseY;
  return surface.centerY - BUILDING_FOOTING_SINK;
}

export function isFootprintSlopeValid(
  anchorSx: number,
  anchorSz: number,
  fp: Footprint,
  sample: ElevationSampler,
): boolean {
  for (let dz = 0; dz < fp.h; dz++) {
    for (let dx = 0; dx < fp.w; dx++) {
      const sx = anchorSx + dx;
      const sz = anchorSz + dz;
      const e = sample(sx, sz);
      if (dx + 1 < fp.w && isSteepTerrainSlope(e, sample(sx + 1, sz))) return false;
      if (dz + 1 < fp.h && isSteepTerrainSlope(e, sample(sx, sz + 1))) return false;
    }
  }
  return true;
}

export function validateBuildingTerrain(
  grid: GameGrid,
  anchorSx: number,
  anchorSz: number,
  type: BuildingType,
): { ok: true } | { ok: false; reason: string } {
  if (isRoadType(type)) return { ok: true };

  const fp = getFootprint(type);
  const sample = gridElevationSampler(grid);

  for (let dz = 0; dz < fp.h; dz++) {
    for (let dx = 0; dx < fp.w; dx++) {
      if (grid.hasWaterAt(anchorSx + dx, anchorSz + dz)) {
        return { ok: false, reason: 'Cannot build on water' };
      }
    }
  }

  if (!isFootprintSlopeValid(anchorSx, anchorSz, fp, sample)) {
    return { ok: false, reason: 'Terrain too steep' };
  }

  return { ok: true };
}

/** Procedural-only sampler (tests / tools without a grid). */
export function proceduralElevationSampler(worldSeed: number): ElevationSampler {
  return (sx, sz) => terrainElevationAt(sx, sz, worldSeed);
}
