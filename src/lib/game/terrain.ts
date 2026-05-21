import type { NaturalDeposit, NaturalDepositType } from './types';
import { hash01 } from './terrainNoise';
import {
  PLAIN_TERRAIN_STACK,
  terrainStackForDeposit,
  terrainStackForDepositType,
} from './terrainBlueprints';

export type TerrainLayer = 'grass' | 'dirt' | 'clay_layer' | 'rock' | 'sand';

/** Per-sub-cell terrain mutation (stack comes from deposit blueprint when unset). */
export interface TerrainCell {
  /** Top layers removed by digging; 0 = natural surface. */
  dugDepth: number;
}

const LAYER_COLORS: Record<TerrainLayer, number> = {
  grass: 0x5a8f3a,
  dirt: 0x8b6914,
  clay_layer: 0x9c6b4a,
  rock: 0x6b6b6b,
  sand: 0xc2b280,
};

export function terrainLayerColor(layer: TerrainLayer): number {
  return LAYER_COLORS[layer];
}

/** Per-sub-cell hue/value variation to break up flat strata bands. */
export function terrainLayerColorAt(
  layer: TerrainLayer,
  sx: number,
  sz: number,
  worldSeed = 0,
): number {
  const base = LAYER_COLORS[layer];
  const r0 = (base >> 16) & 0xff;
  const g0 = (base >> 8) & 0xff;
  const b0 = base & 0xff;
  const n = hash01(sx, sz, worldSeed ^ (layer.charCodeAt(0) * 131));
  const n2 = hash01(sx + 7, sz + 13, worldSeed ^ 0xdeadbeef);
  const dr = Math.floor((n - 0.5) * 22);
  const dg = Math.floor((n2 - 0.5) * 18);
  const db = Math.floor(((n + n2) * 0.5 - 0.5) * 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  return (clamp(r0 + dr) << 16) | (clamp(g0 + dg) << 8) | clamp(b0 + db);
}

export function defaultTerrainCell(): TerrainCell {
  return { dugDepth: 0 };
}

/** @deprecated Use terrainStackForDeposit; kept for deposit tint fallbacks. */
export function layerFromDeposit(deposit: NaturalDeposit | null | undefined): TerrainLayer {
  return surfaceLayer(terrainStackForDeposit(deposit), 0);
}

export function layerFromDepositType(type: NaturalDepositType): TerrainLayer {
  return surfaceLayer(terrainStackForDepositType(type), 0);
}

export function resolveTerrainStack(
  deposit: NaturalDeposit | null | undefined,
): readonly TerrainLayer[] {
  return terrainStackForDeposit(deposit);
}

export function visibleStackLayers(
  stack: readonly TerrainLayer[],
  dugDepth: number,
): TerrainLayer[] {
  const end = stack.length - dugDepth;
  if (end <= 0) return ['dirt'];
  return [...stack.slice(0, end)];
}

export function surfaceLayer(stack: readonly TerrainLayer[], dugDepth: number): TerrainLayer {
  const visible = visibleStackLayers(stack, dugDepth);
  return visible[visible.length - 1] ?? 'dirt';
}

export function digTerrainCell(
  cell: TerrainCell,
  stack: readonly TerrainLayer[],
): TerrainCell {
  const maxDig = stack.length;
  return { dugDepth: Math.min(cell.dugDepth + 1, maxDig) };
}

/** Uniform excavation depth for extractor footprints (strata removed from surface). */
export const EXTRACTOR_FOOTPRINT_DUG_DEPTH = 3;

export function extractorTargetDugDepth(stack: readonly TerrainLayer[]): number {
  return Math.min(EXTRACTOR_FOOTPRINT_DUG_DEPTH, stack.length);
}

export function flattenTerrainCell(_cell: TerrainCell): TerrainCell {
  return { dugDepth: 0 };
}

/** Migrate v4 cells that stored { layer, height }. */
export function normalizeTerrainCell(
  raw: Partial<TerrainCell> & { layer?: TerrainLayer; height?: number },
): TerrainCell {
  if (typeof raw.dugDepth === 'number') {
    return { dugDepth: Math.max(0, raw.dugDepth) };
  }
  const legacyHeight = raw.height ?? 0;
  const dugFromHeight = legacyHeight < 0 ? -legacyHeight : 0;
  return { dugDepth: dugFromHeight };
}

export { PLAIN_TERRAIN_STACK, terrainStackForDeposit, terrainStackForDepositType };
