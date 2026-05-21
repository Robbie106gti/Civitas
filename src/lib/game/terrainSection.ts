import { CHUNK_SIZE, SUB_CELL_WORLD_SIZE, TERRAIN_SURFACE_SUBDIV } from './constants';
import { subKey } from './chunkCoords';
import type { ChunkRecord } from './chunkManager';
import { cellJitter, fbm2D, hash01, ridged2D, sampleTerrainElevation } from './terrainNoise';
import type { FluidType } from './water';
import type { NaturalDeposit, NaturalDepositType } from './types';

/** Baked section file format version (see encodeTerrainSection). */
export const TERRAIN_SECTION_FORMAT = 2;

/** Normalized elevation below which terrain is considered a canyon floor. */
export const CANYON_ELEVATION_THRESHOLD = 0.32;

/** Normalized elevation above which terrain is considered a hill. */
export const HILL_ELEVATION_THRESHOLD = 0.55;

/** World size of one terrain surface micro-voxel (render + vertical steps). */
export const TERRAIN_VOXEL_WORLD_SIZE = SUB_CELL_WORLD_SIZE / TERRAIN_SURFACE_SUBDIV;

/** Quantized steps from normalized elevation; raise for steeper hills (sea level ~0.38). */
export const ELEVATION_STEP_SCALE = 28;

const ELEVATION_VOXEL = TERRAIN_VOXEL_WORLD_SIZE * 2;
const ELEVATION_SEA_LEVEL = 0.38;
export const TERRAIN_SECTION_MAGIC = 0x43535754; // 'TWSC' little-endian

/** Default radius for `npm run bake-terrain` around world origin chunk. */
export const TERRAIN_BAKE_RADIUS_CHUNKS = 10;

/** Chunks preloaded from `/terrain/{seed}/` on game start (camera neighborhood only). */
export const TERRAIN_PREFETCH_RADIUS_CHUNKS = 2;

/** Smaller radius for boot `preloadGameAssets` before first frame (GameCanvas uses full radius). */
export const BOOT_TERRAIN_PREFETCH_RADIUS_CHUNKS = 1;

const DEPOSIT_TYPES: NaturalDepositType[] = ['clay', 'rock', 'sand', 'trees', 'iron', 'gold'];

const DEPOSIT_CODE: Record<NaturalDepositType, number> = {
  clay: 1,
  rock: 2,
  sand: 3,
  trees: 4,
  iron: 5,
  gold: 6,
};

const CODE_DEPOSIT: Record<number, NaturalDepositType> = {
  1: 'clay',
  2: 'rock',
  3: 'sand',
  4: 'trees',
  5: 'iron',
  6: 'gold',
};

export interface TerrainSection {
  cx: number;
  cy: number;
  worldSeed: number;
  deposits: Map<string, NaturalDeposit>;
  fluids: Map<string, FluidType>;
  /** Per sub-cell normalized elevation in [0, 1]. */
  elevation: Map<string, number>;
}

export function quantizeElevation(elev: number): number {
  return Math.max(0, Math.min(254, Math.round(elev * 254)));
}

export function dequantizeElevation(q: number): number {
  return q / 254;
}

/** World-space Y offset for terrain surface voxels (sea level ~0.38). */
export function elevationWorldOffset(elev: number): number {
  const steps = Math.round((elev - ELEVATION_SEA_LEVEL) * ELEVATION_STEP_SCALE);
  return steps * ELEVATION_VOXEL;
}

/** Continuous world Y for rendering / smooth footing (no step quantization). */
export function elevationWorldOffsetSmooth(elev: number): number {
  return (elev - ELEVATION_SEA_LEVEL) * ELEVATION_STEP_SCALE * ELEVATION_VOXEL;
}

export function terrainElevationAt(
  sx: number,
  sz: number,
  worldSeed: number,
  stored?: number,
): number {
  if (stored !== undefined) return stored;
  const seed = sectionSeed(worldSeed, Math.floor(sx / CHUNK_SIZE), Math.floor(sz / CHUNK_SIZE));
  return sampleTerrainElevation(sx, sz, seed);
}

function sectionSeed(worldSeed: number, cx: number, cy: number): number {
  return (worldSeed ^ (cx * 374761393) ^ (cy * 668265263)) >>> 0;
}

function richnessFor(type: NaturalDepositType, sx: number, sz: number, seed: number): number {
  const base = hash01(sx, sz, seed ^ 0x27d4eb2d);
  const ranges: Record<NaturalDepositType, [number, number]> = {
    clay: [40, 120],
    rock: [50, 150],
    sand: [30, 100],
    trees: [60, 180],
    iron: [25, 80],
    gold: [15, 50],
  };
  const [min, max] = ranges[type];
  return Math.floor(min + base * (max - min + 1));
}

function pickDepositType(
  sx: number,
  sz: number,
  elev: number,
  moist: number,
  rockiness: number,
  seed: number,
): NaturalDepositType | null {
  const scatter = fbm2D(sx * 0.11, sz * 0.11, seed + 17, 2);
  if (scatter < 0.44) return null;

  const j = cellJitter(sx, sz, seed, 0.12);
  const e = elev + j;
  const m = moist + j * 0.5;
  const r = rockiness + j;

  if (r > 0.62 && e > 0.42) return 'rock';
  if (m > 0.58 && e < 0.42) return 'clay';
  if (m > 0.5 && e < 0.55 && fbm2D(sx * 0.2, sz * 0.2, seed + 31, 2) > 0.45) return 'sand';
  if (m > 0.48 && fbm2D(sx * 0.15, sz * 0.15, seed + 43, 2) > 0.5) return 'trees';
  if (r > 0.7 && e > 0.5 && hash01(sx, sz, seed + 7) > 0.82) return 'iron';
  if (r > 0.75 && hash01(sx, sz, seed + 11) > 0.94) return 'gold';
  return null;
}

function isWaterAt(sx: number, sz: number, seed: number, elev: number): boolean {
  const moist = fbm2D(sx * 0.014, sz * 0.014, seed ^ 0x517cc1b7, 4);
  const jitter = cellJitter(sx, sz, seed ^ 3, 0.06);

  const lake = elev + jitter < CANYON_ELEVATION_THRESHOLD;
  const ridge = ridged2D(sx * 0.019, sz * 0.019, seed ^ 0x6a09e667, 4);
  const river = ridge > 0.68 && elev > 0.28 && elev < 0.5 && moist > 0.35;

  const edgeDist = Math.min(Math.abs(sx), Math.abs(sz));
  const coastWarp = fbm2D(sx * 0.004, sz * 0.004, seed ^ 0xbb67ae85, 3) * 28;
  const coast = edgeDist < 36 + coastWarp && elev < ELEVATION_SEA_LEVEL + jitter;

  return lake || river || coast;
}

/**
 * Procedural terrain section for one chunk (deposits + fluids).
 * Single source for organic world gen; bake with `npm run bake-terrain`.
 */
export function generateTerrainSection(
  cx: number,
  cy: number,
  worldSeed: number,
): TerrainSection {
  const seed = sectionSeed(worldSeed, cx, cy);
  const deposits = new Map<string, NaturalDeposit>();
  const fluids = new Map<string, FluidType>();
  const elevation = new Map<string, number>();
  const minSx = cx * CHUNK_SIZE;
  const minSz = cy * CHUNK_SIZE;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const sx = minSx + lx;
      const sz = minSz + lz;
      const key = subKey(sx, sz);

      const elev = sampleTerrainElevation(sx, sz, seed);
      elevation.set(key, elev);
      const moist = fbm2D(sx * 0.016 + 50, sz * 0.016, seed + 1, 3);
      const rockiness = fbm2D(sx * 0.022, sz * 0.022, seed + 2, 3);

      if (isWaterAt(sx, sz, seed, elev)) {
        fluids.set(key, 'water');
        continue;
      }

      const type = pickDepositType(sx, sz, elev, moist, rockiness, seed);
      if (type) {
        deposits.set(key, { type, richness: richnessFor(type, sx, sz, seed) });
      }
    }
  }

  return { cx, cy, worldSeed, deposits, fluids, elevation };
}

export function applyTerrainSectionToChunk(chunk: ChunkRecord, section: TerrainSection): void {
  chunk.deposits = section.deposits;
  chunk.fluids = section.fluids;
  chunk.elevation = section.elevation;
}

export function terrainSectionFileName(cx: number, cy: number): string {
  return `${cx}_${cy}.bin`;
}

/** URL path served from `public/terrain/{seed}/`. */
export function bakedTerrainUrl(worldSeed: number, cx: number, cy: number): string {
  return `/terrain/${worldSeed}/${terrainSectionFileName(cx, cy)}`;
}

export function encodeTerrainSection(section: TerrainSection): Uint8Array {
  const n = CHUNK_SIZE * CHUNK_SIZE;
  const out = new Uint8Array(12 + n * 3);
  const view = new DataView(out.buffer);
  view.setUint32(0, TERRAIN_SECTION_MAGIC, true);
  view.setUint8(4, TERRAIN_SECTION_FORMAT);
  view.setInt16(5, section.cx, true);
  view.setInt16(7, section.cy, true);
  view.setUint32(9, section.worldSeed >>> 0, true);

  const minSx = section.cx * CHUNK_SIZE;
  const minSz = section.cy * CHUNK_SIZE;
  const seed = sectionSeed(section.worldSeed, section.cx, section.cy);
  let o = 12;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const sx = minSx + lx;
      const sz = minSz + lz;
      const key = subKey(sx, sz);
      const dep = section.deposits.get(key);
      const water = section.fluids.get(key) === 'water';
      const code = dep ? (DEPOSIT_CODE[dep.type] ?? 0) : 0;
      const elev =
        section.elevation.get(key) ?? sampleTerrainElevation(sx, sz, seed);
      out[o] = code | (water ? 0x80 : 0);
      out[o + 1] = dep?.richness ?? 0;
      out[o + 2] = quantizeElevation(elev);
      o += 3;
    }
  }

  return out;
}

export function decodeTerrainSection(bytes: Uint8Array): TerrainSection | null {
  if (bytes.byteLength < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== TERRAIN_SECTION_MAGIC) return null;

  const format = view.getUint8(4);
  if (format !== 1 && format !== TERRAIN_SECTION_FORMAT) return null;

  const cellStride = format === 1 ? 2 : 3;
  if (bytes.byteLength < 12 + CHUNK_SIZE * CHUNK_SIZE * cellStride) return null;

  const cx = view.getInt16(5, true);
  const cy = view.getInt16(7, true);
  const worldSeed = view.getUint32(9, true);
  const deposits = new Map<string, NaturalDeposit>();
  const fluids = new Map<string, FluidType>();
  const elevation = new Map<string, number>();
  const seed = sectionSeed(worldSeed, cx, cy);

  const minSx = cx * CHUNK_SIZE;
  const minSz = cy * CHUNK_SIZE;
  let o = 12;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const sx = minSx + lx;
      const sz = minSz + lz;
      const key = subKey(sx, sz);
      const b0 = bytes[o]!;
      const richness = bytes[o + 1]!;
      const elevQ = format === 1 ? null : bytes[o + 2]!;
      o += cellStride;

      const elev =
        elevQ === null
          ? sampleTerrainElevation(sx, sz, seed)
          : dequantizeElevation(elevQ);
      elevation.set(key, elev);

      if (b0 & 0x80) fluids.set(key, 'water');

      const code = b0 & 0x7f;
      if (code > 0) {
        const type = CODE_DEPOSIT[code];
        if (type && DEPOSIT_TYPES.includes(type)) {
          deposits.set(key, { type, richness: richness || richnessFor(type, sx, sz, worldSeed) });
        }
      }
    }
  }

  return { cx, cy, worldSeed, deposits, fluids, elevation };
}
