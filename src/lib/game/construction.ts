import { getBuildingDef } from './buildings';
import { getFootprint, isRoadType } from './footprints';
import type { BuildingCategory, BuildingType } from './types';
import { footprintMinElevation, type ElevationSampler } from './terrainSurface';
import type { GameGrid } from './grid';
import { flattenTerrainCell } from './terrain';

export type ConstructionPhase = 'leveling' | 'building';

export interface ConstructionSite {
  sx: number;
  sz: number;
  building: BuildingType;
  /** 0–1 display progress (leveling then structure). */
  progress: number;
  /** Total sim ticks (leveling + building). */
  ticksElapsed: number;
  totalTicks: number;
  phase: ConstructionPhase;
  /** Ticks spent in the current phase. */
  phaseTicksElapsed: number;
  levelingTicks: number;
  buildingTicks: number;
  /** Normalized elevation for a leveled footprint pad. */
  targetElev: number;
}

/** Share of total build time for ground leveling (remainder = structure). */
export const CONSTRUCTION_LEVELING_FRACTION = 0.35;

/** Sim ticks between mesh refreshes while a site is building (limits chunk rebuilds). */
export const CONSTRUCTION_MESH_REFRESH_TICKS = 4;

const CATEGORY_BUILD_TICKS: Record<BuildingCategory, number> = {
  road: 0,
  decorative: 12,
  housing: 36,
  natural_extractor: 48,
  farm: 36,
  factory: 48,
  civic: 72,
  religion: 84,
  trade: 60,
  storage: 60,
};

/** Sim ticks to finish construction at 12 Hz (override per type via `BuildingDef.buildTicks`). */
export function buildTicksFor(type: BuildingType): number {
  const def = getBuildingDef(type);
  if (def.buildTicks != null) return def.buildTicks;
  if (isRoadType(type)) return 0;
  return CATEGORY_BUILD_TICKS[def.category];
}

export function needsConstruction(type: BuildingType): boolean {
  return buildTicksFor(type) > 0;
}

export function constructionLevelingProgress(site: ConstructionSite): number {
  if (site.levelingTicks <= 0) return 1;
  return Math.min(1, site.phaseTicksElapsed / site.levelingTicks);
}

export function constructionBuildingProgress(site: ConstructionSite): number {
  if (site.buildingTicks <= 0) return 1;
  return Math.min(1, site.phaseTicksElapsed / site.buildingTicks);
}

export function constructionProgress(site: ConstructionSite): number {
  if (site.totalTicks <= 0) return 1;
  const levelingWeight = site.levelingTicks / site.totalTicks;
  if (site.phase === 'leveling') {
    return constructionLevelingProgress(site) * levelingWeight;
  }
  return (
    levelingWeight +
    constructionBuildingProgress(site) * (1 - levelingWeight)
  );
}

export function splitConstructionTicks(totalTicks: number): {
  levelingTicks: number;
  buildingTicks: number;
} {
  if (totalTicks <= 0) return { levelingTicks: 0, buildingTicks: 0 };
  const levelingTicks = Math.max(
    4,
    Math.min(totalTicks - 4, Math.ceil(totalTicks * CONSTRUCTION_LEVELING_FRACTION)),
  );
  return { levelingTicks, buildingTicks: totalTicks - levelingTicks };
}

export function createConstructionSite(
  sx: number,
  sz: number,
  building: BuildingType,
  sample?: ElevationSampler,
): ConstructionSite {
  const totalTicks = buildTicksFor(building);
  const { levelingTicks, buildingTicks } = splitConstructionTicks(totalTicks);
  const fp = getFootprint(building);
  const elevSample = sample ?? (() => 0.4);
  const targetElev = footprintMinElevation(sx, sz, fp, elevSample);
  return {
    sx,
    sz,
    building,
    progress: 0,
    ticksElapsed: 0,
    totalTicks,
    phase: 'leveling',
    phaseTicksElapsed: 0,
    levelingTicks,
    buildingTicks,
    targetElev,
  };
}

/** Interpolate footprint elevations toward `targetElev` and clear dig depth. */
export function applyFootprintLeveling(
  grid: GameGrid,
  site: ConstructionSite,
  t: number,
): boolean {
  const fp = getFootprint(site.building);
  const eased = Math.min(1, t);
  const target = site.targetElev;
  let dirty = false;
  const touchedChunks = new Set<ReturnType<GameGrid['chunks']['getChunkAtSub']>>();

  for (let dz = 0; dz < fp.h; dz++) {
    for (let dx = 0; dx < fp.w; dx++) {
      const sx = site.sx + dx;
      const sz = site.sz + dz;
      const chunk = grid.chunks.getChunkAtSub(sx, sz);
      touchedChunks.add(chunk);
      const current = grid.chunks.getElevationAt(sx, sz);
      const next = eased >= 1 ? target : current + (target - current) * eased;
      if (Math.abs(next - current) > 1e-5 || eased >= 1) {
        grid.chunks.writeElevationAt(sx, sz, next);
        dirty = true;
      }
      const cell = grid.getTerrain(sx, sz);
      if (cell.dugDepth > 0) {
        grid.chunks.writeTerrainAt(sx, sz, flattenTerrainCell(cell));
        dirty = true;
      }
    }
  }

  if (dirty) {
    for (const chunk of touchedChunks) {
      grid.chunks.bumpChunkContent(chunk);
    }
  }
  return dirty;
}
