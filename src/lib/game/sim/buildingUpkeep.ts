import { parseSubKey } from '../chunkCoords';
import {
  buildingHasUpkeep,
  CONDITION_MAX,
  CONDITION_MIN,
  ENTROPY_STARVE_MULTIPLIER,
  ENTROPY_TRAFFIC_MULTIPLIER,
  entropyRateForType,
  materialCostForType,
  MAINTENANCE_CONDITION_THRESHOLD,
  UPKEEP_MATERIAL_INTERVAL,
  UPKEEP_TICK_INTERVAL,
} from '../buildingUpkeepConfig';
import { canAfford, deductCost } from '../inventory';
import type { BuildingType, CityInventory, ResourceType } from '../types';
import { defaultUpkeepRecord, type BuildingUpkeepRecord } from '../upkeepState';
import { getFootprint } from '../footprints';

export interface NeedyAnchor {
  key: string;
  type: BuildingType;
  cx: number;
  cz: number;
  condition: number;
}

export interface BuildingUpkeepSimState {
  tickCounter: number;
  materialTickCounter: number;
  simTick: number;
  buildings: Map<string, BuildingUpkeepRecord>;
  needyList: NeedyAnchor[];
  needyStale: boolean;
}

export function createBuildingUpkeepState(simTick = 0): BuildingUpkeepSimState {
  return {
    tickCounter: 0,
    materialTickCounter: 0,
    simTick,
    buildings: new Map(),
    needyList: [],
    needyStale: true,
  };
}

export function markNeedyStale(state: BuildingUpkeepSimState): void {
  state.needyStale = true;
}

export function upkeepStateFromSnapshots(
  rows: { key: string; condition: number; entropy: number; lastMaintainedTick: number; evolutionScore?: number; materialStarved?: boolean }[],
): BuildingUpkeepSimState {
  const state = createBuildingUpkeepState();
  for (const row of rows) {
    state.buildings.set(row.key, {
      condition: row.condition,
      entropy: row.entropy,
      lastMaintainedTick: row.lastMaintainedTick,
      evolutionScore: row.evolutionScore ?? 0,
      materialStarved: row.materialStarved ?? false,
    });
  }
  return state;
}

function trafficHeatAt(
  key: string,
  traffic: Map<string, number>,
): number {
  return traffic.get(key) ?? 0;
}

function tryDeductUpkeep(
  inventory: CityInventory,
  type: BuildingType,
): boolean {
  const cost = materialCostForType(type);
  const entries = Object.entries(cost).filter(([, n]) => (n ?? 0) > 0) as [
    ResourceType,
    number,
  ][];
  if (entries.length === 0) return true;
  if (!canAfford(inventory, Object.fromEntries(entries))) return false;
  deductCost(inventory, Object.fromEntries(entries));
  return true;
}

function rebuildNeedyList(
  state: BuildingUpkeepSimState,
  anchors: Map<string, BuildingType>,
  threshold: number,
): void {
  const list: NeedyAnchor[] = [];
  for (const [key, rec] of state.buildings) {
    if (rec.condition >= threshold) continue;
    const type = anchors.get(key);
    if (!type || !buildingHasUpkeep(type)) continue;
    const parsed = parseSubKey(key);
    if (!parsed) continue;
    const fp = getFootprint(type);
    list.push({
      key,
      type,
      cx: parsed.sx + fp.w / 2,
      cz: parsed.sz + fp.h / 2,
      condition: rec.condition,
    });
  }
  list.sort((a, b) => a.condition - b.condition);
  state.needyList = list;
  state.needyStale = false;
}

export interface UpkeepTickResult {
  updates: { key: string; condition: number; entropy: number; evolutionScore: number; materialStarved: boolean }[];
}

export function tickBuildingUpkeep(
  state: BuildingUpkeepSimState,
  anchors: Map<string, BuildingType>,
  inventory: CityInventory,
  traffic: Map<string, number>,
  simTick: number,
): UpkeepTickResult {
  state.simTick = simTick;
  state.tickCounter += 1;

  const updates: UpkeepTickResult['updates'] = [];
  if (state.tickCounter % UPKEEP_TICK_INTERVAL !== 0) {
    return { updates };
  }

  const runMaterials = state.materialTickCounter % UPKEEP_MATERIAL_INTERVAL === 0;
  state.materialTickCounter += 1;

  for (const [key, rec] of state.buildings) {
    const type = anchors.get(key);
    if (!type || !buildingHasUpkeep(type)) continue;

    let rate = entropyRateForType(type);
    const heat = trafficHeatAt(key, traffic);
    if (heat > 20) rate *= ENTROPY_TRAFFIC_MULTIPLIER;
    if (rec.materialStarved) rate *= ENTROPY_STARVE_MULTIPLIER;

    if (runMaterials && rec.condition < 85) {
      const paid = tryDeductUpkeep(inventory, type);
      rec.materialStarved = !paid;
      if (paid) {
        rec.condition = Math.min(CONDITION_MAX, rec.condition + 4);
        rec.entropy = Math.max(0, rec.entropy - 2);
      }
    }

    rec.entropy = Math.min(100, rec.entropy + rate * 0.85);
    const entropyFactor = 0.55 + rec.entropy / 200;
    rec.condition = Math.max(CONDITION_MIN, rec.condition - rate * entropyFactor);

    updates.push({
      key,
      condition: rec.condition,
      entropy: rec.entropy,
      evolutionScore: rec.evolutionScore,
      materialStarved: rec.materialStarved,
    });
  }

  if (updates.length > 0) markNeedyStale(state);
  return { updates };
}

export function applyEngineerMaintenance(
  state: BuildingUpkeepSimState,
  buildingKey: string,
  buildingType: BuildingType,
  inventory: CityInventory,
  restore: number,
  simTick: number,
): boolean {
  const rec = state.buildings.get(buildingKey);
  if (!rec) return false;
  if (!tryDeductUpkeep(inventory, buildingType)) {
    rec.materialStarved = true;
    return false;
  }
  rec.condition = Math.min(CONDITION_MAX, rec.condition + restore);
  rec.entropy = Math.max(0, rec.entropy - 6);
  rec.lastMaintainedTick = simTick;
  rec.materialStarved = false;
  markNeedyStale(state);
  return true;
}

export function lowestConditionAnchor(
  state: BuildingUpkeepSimState,
  anchors: Map<string, BuildingType>,
  threshold: number = MAINTENANCE_CONDITION_THRESHOLD,
): { key: string; type: BuildingType; cx: number; cz: number } | null {
  if (state.needyStale) {
    rebuildNeedyList(state, anchors, threshold);
  }

  for (const entry of state.needyList) {
    const rec = state.buildings.get(entry.key);
    const condition = rec?.condition ?? 100;
    if (condition >= threshold) continue;
    const type = anchors.get(entry.key);
    if (!type || !buildingHasUpkeep(type)) continue;
    return { key: entry.key, type, cx: entry.cx, cz: entry.cz };
  }

  return null;
}
