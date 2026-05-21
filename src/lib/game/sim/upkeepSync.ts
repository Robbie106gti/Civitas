import { parseSubKey } from '../chunkCoords';
import { buildingHasUpkeep } from '../buildingUpkeepConfig';
import { isRoadType } from '../footprints';
import type { BuildingType } from '../types';
import { defaultUpkeepRecord } from '../upkeepState';
import { markNeedyStale, type BuildingUpkeepSimState } from './buildingUpkeep';

function collectAnchorKeys(buildings: Map<string, BuildingType>): Set<string> {
  const keys = new Set<string>();
  for (const [key, type] of buildings) {
    if (isRoadType(type)) continue;
    if (!buildingHasUpkeep(type)) continue;
    const parsed = parseSubKey(key);
    if (!parsed) continue;
    keys.add(key);
  }
  return keys;
}

export function syncUpkeepMap(
  state: BuildingUpkeepSimState,
  buildings: Map<string, BuildingType>,
): void {
  const anchorKeys = collectAnchorKeys(buildings);
  for (const key of state.buildings.keys()) {
    if (!anchorKeys.has(key)) state.buildings.delete(key);
  }
  for (const key of anchorKeys) {
    if (!state.buildings.has(key)) {
      state.buildings.set(key, defaultUpkeepRecord(state.simTick));
    }
  }
  markNeedyStale(state);
}

export function upkeepSnapshotsFromState(
  state: BuildingUpkeepSimState,
): { key: string; condition: number; entropy: number; lastMaintainedTick: number; evolutionScore: number; materialStarved: boolean }[] {
  return [...state.buildings.entries()].map(([key, r]) => ({
    key,
    condition: r.condition,
    entropy: r.entropy,
    lastMaintainedTick: r.lastMaintainedTick,
    evolutionScore: r.evolutionScore,
    materialStarved: r.materialStarved,
  }));
}
