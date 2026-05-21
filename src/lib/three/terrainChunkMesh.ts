import * as THREE from 'three';
import type { ChunkRecord } from '../game/chunkManager';
import { CHUNK_SIZE, SUB_CELL_WORLD_SIZE } from '../game/constants';
import { subKey } from '../game/chunkCoords';
import type { ElevationSampler } from '../game/terrainSurface';
import { sampleElevationBilinear, terrainSurfaceWorldYSmooth } from '../game/terrainSurface';
import { TERRAIN_VOXEL_WORLD_SIZE } from '../game/terrainSection';
import type { TerrainLayer } from '../game/terrain';
import { terrainLayerColorAt } from '../game/terrain';

export const TERRAIN_VOXEL_STEP = TERRAIN_VOXEL_WORLD_SIZE * 2;

/** Slight overlap at chunk edges so merged columns meet without sky gaps. */
export const TERRAIN_CHUNK_EDGE_OVERLAP = SUB_CELL_WORLD_SIZE * 0.004;

/**
 * Expected triangle budget (49 visible chunks, 32² cells):
 * ~12 tris/cell fill + ~4 tris/cell × surface layers → under ~2M at 5×5–7×7 view.
 */
export const TERRAIN_TRIS_PER_CELL_BUDGET = 18;

export function subCellFillExtent(
  lx: number,
  lz: number,
): { width: number; depth: number; centerOffsetX: number; centerOffsetZ: number } {
  let width = SUB_CELL_WORLD_SIZE;
  let depth = SUB_CELL_WORLD_SIZE;
  let centerOffsetX = 0;
  let centerOffsetZ = 0;
  const o = TERRAIN_CHUNK_EDGE_OVERLAP;
  if (lx === 0) {
    width += o;
    centerOffsetX -= o * 0.5;
  } else if (lx === CHUNK_SIZE - 1) {
    width += o;
    centerOffsetX += o * 0.5;
  }
  if (lz === 0) {
    depth += o;
    centerOffsetZ -= o * 0.5;
  } else if (lz === CHUNK_SIZE - 1) {
    depth += o;
    centerOffsetZ += o * 0.5;
  }
  return { width, depth, centerOffsetX, centerOffsetZ };
}

/** Corner world Y for one stratum step (shared by adjacent chunks at boundaries). */
export function stratumCornerWorldY(
  sx: number,
  sz: number,
  u: number,
  v: number,
  dugDepth: number,
  stackIndexFromTop: number,
  stackLayerCount: number,
  sample: ElevationSampler,
): number {
  const y = terrainSurfaceWorldYSmooth(sx, sz, u, v, sample, dugDepth);
  return y - (stackLayerCount - 1 - stackIndexFromTop) * TERRAIN_VOXEL_STEP;
}

/** Shared-edge bilinear samples match across adjacent sub-cells (chunk seam continuity). */
export function chunkEdgeCornerHeightContinuous(
  sample: ElevationSampler,
  edgeSx: number,
  edgeSz: number,
): boolean {
  const eastWest =
    Math.abs(
      sampleElevationBilinear(edgeSx, edgeSz, 1, 0.5, sample) -
        sampleElevationBilinear(edgeSx + 1, edgeSz, 0, 0.5, sample),
    ) < 1e-9;
  const northSouth =
    Math.abs(
      sampleElevationBilinear(edgeSx, edgeSz, 0.5, 1, sample) -
        sampleElevationBilinear(edgeSx, edgeSz + 1, 0.5, 0, sample),
    ) < 1e-9;
  return eastWest && northSouth;
}

function pushQuad(
  positions: number[],
  colors: number[],
  x0: number,
  y00: number,
  z0: number,
  x1: number,
  y10: number,
  z1: number,
  x2: number,
  y11: number,
  z2: number,
  x3: number,
  y01: number,
  z3: number,
  color: number,
): void {
  const c = new THREE.Color(color);
  const pushVert = (x: number, y: number, z: number) => {
    positions.push(x, y, z);
    colors.push(c.r, c.g, c.b);
  };
  pushVert(x0, y00, z0);
  pushVert(x1, y10, z1);
  pushVert(x2, y11, z2);
  pushVert(x0, y00, z0);
  pushVert(x2, y11, z2);
  pushVert(x3, y01, z3);
}

export function buildStratumQuadGeometry(
  chunk: ChunkRecord,
  stackIndexFromTop: number,
  worldSeed: number,
  sample: ElevationSampler,
  isWater: (sx: number, sz: number) => boolean,
  layerAt: (sx: number, sz: number, stackIndexFromTop: number) => TerrainLayer | null,
  stackLayerCountAt: (sx: number, sz: number) => number,
  dugDepthAt: (sx: number, sz: number) => number,
): THREE.BufferGeometry | null {
  const minSx = chunk.cx * CHUNK_SIZE;
  const minSz = chunk.cy * CHUNK_SIZE;
  const positions: number[] = [];
  const colors: number[] = [];

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const sx = minSx + lx;
      const sz = minSz + lz;
      if (isWater(sx, sz)) continue;
      const stackLayers = stackLayerCountAt(sx, sz);
      if (stackIndexFromTop >= stackLayers) continue;
      const layer = layerAt(sx, sz, stackIndexFromTop);
      if (!layer) continue;

      const dug = dugDepthAt(sx, sz);
      const x0 = sx * SUB_CELL_WORLD_SIZE;
      const z0 = sz * SUB_CELL_WORLD_SIZE;
      const x1 = x0 + SUB_CELL_WORLD_SIZE;
      const z1 = z0 + SUB_CELL_WORLD_SIZE;
      const y00 = stratumCornerWorldY(sx, sz, 0, 0, dug, stackIndexFromTop, stackLayers, sample);
      const y10 = stratumCornerWorldY(sx, sz, 1, 0, dug, stackIndexFromTop, stackLayers, sample);
      const y01 = stratumCornerWorldY(sx, sz, 0, 1, dug, stackIndexFromTop, stackLayers, sample);
      const y11 = stratumCornerWorldY(sx, sz, 1, 1, dug, stackIndexFromTop, stackLayers, sample);
      const col = terrainLayerColorAt(layer, sx, sz, worldSeed);
      pushQuad(positions, colors, x0, y00, z0, x1, y10, z0, x1, y11, z1, x0, y01, z1, col);
    }
  }

  if (!positions.length) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  return geom;
}

export function buildWaterSurfaceGeometry(
  chunk: ChunkRecord,
  worldSeed: number,
  sample: ElevationSampler,
  waterColorAt: (sx: number, sz: number) => number,
  isWater: (sx: number, sz: number) => boolean,
  dugDepthAt: (sx: number, sz: number) => number,
  surfaceOffset: number,
): THREE.BufferGeometry | null {
  const minSx = chunk.cx * CHUNK_SIZE;
  const minSz = chunk.cy * CHUNK_SIZE;
  const positions: number[] = [];
  const colors: number[] = [];

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const sx = minSx + lx;
      const sz = minSz + lz;
      if (!isWater(sx, sz)) continue;
      const dug = dugDepthAt(sx, sz);
      if (dug > 0) continue;
      const x0 = sx * SUB_CELL_WORLD_SIZE;
      const z0 = sz * SUB_CELL_WORLD_SIZE;
      const x1 = x0 + SUB_CELL_WORLD_SIZE;
      const z1 = z0 + SUB_CELL_WORLD_SIZE;
      const y00 = terrainSurfaceWorldYSmooth(sx, sz, 0, 0, sample, dug) + surfaceOffset;
      const y10 = terrainSurfaceWorldYSmooth(sx, sz, 1, 0, sample, dug) + surfaceOffset;
      const y01 = terrainSurfaceWorldYSmooth(sx, sz, 0, 1, sample, dug) + surfaceOffset;
      const y11 = terrainSurfaceWorldYSmooth(sx, sz, 1, 1, sample, dug) + surfaceOffset;
      const col = waterColorAt(sx, sz);
      pushQuad(positions, colors, x0, y00, z0, x1, y10, z0, x1, y11, z1, x0, y01, z1, col);
    }
  }

  if (!positions.length) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.computeVertexNormals();
  return geom;
}

export function minStackBaseY(
  sx: number,
  sz: number,
  dugDepth: number,
  stackLayerCount: number,
  sample: ElevationSampler,
): number {
  let min = Infinity;
  for (const [u, v] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    const y = terrainSurfaceWorldYSmooth(sx, sz, u, v, sample, dugDepth);
    const base = y - stackLayerCount * TERRAIN_VOXEL_STEP;
    if (base < min) min = base;
  }
  return min;
}
