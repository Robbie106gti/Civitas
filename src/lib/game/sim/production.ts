import { getBuildingDef } from '../buildings';
import { addToInventory, canAfford, deductCost } from '../inventory';
import type { BuildingType, CityInventory, NaturalDeposit, ResourceType } from '../types';
import { countRoadCells } from './roadsCache';

const EXTRACTOR_DEPLETE_PER_TICK = 1;

export interface ProductionState {
  buildings: Map<string, BuildingType>;
  deposits: Map<string, NaturalDeposit>;
  inventory: CityInventory;
  /** Cached road sub-cell count (incremented on sync / traffic placement). */
  roadCellCount: number;
  /** Keys that run farm / factory / extractor logic each tick. */
  productionKeys: Set<string>;
}

export interface ProductionTickResult {
  extractorDigAnchors: { key: string; building: BuildingType }[];
  depositUpdates: { key: string; deposit: NaturalDeposit }[];
}

function isProductionBuilding(type: BuildingType): boolean {
  const cat = getBuildingDef(type).category;
  return cat === 'natural_extractor' || cat === 'farm' || cat === 'factory';
}

export function collectProductionKeys(buildings: Map<string, BuildingType>): Set<string> {
  const keys = new Set<string>();
  for (const [key, type] of buildings) {
    if (isProductionBuilding(type)) keys.add(key);
  }
  return keys;
}

export function syncProductionKey(
  keys: Set<string>,
  key: string,
  prev: BuildingType | null | undefined,
  next: BuildingType | null | undefined,
): void {
  const had = prev != null && isProductionBuilding(prev);
  const has = next != null && isProductionBuilding(next);
  if (had === has) return;
  if (has) keys.add(key);
  else keys.delete(key);
}

export function createProductionState(
  buildings: Map<string, BuildingType>,
  deposits: Map<string, NaturalDeposit>,
  inventory: CityInventory,
  roadCellCount?: number,
): ProductionState {
  return {
    buildings,
    deposits,
    inventory,
    roadCellCount: roadCellCount ?? countRoadCells(buildings),
    productionKeys: collectProductionKeys(buildings),
  };
}

export function runProductionTick(state: ProductionState): ProductionTickResult {
  const { buildings, deposits, inventory, productionKeys } = state;
  const extractorDigAnchors: { key: string; building: BuildingType }[] = [];
  const depositUpdates: { key: string; deposit: NaturalDeposit }[] = [];

  if (productionKeys.size === 0) {
    return { extractorDigAnchors, depositUpdates };
  }

  for (const key of productionKeys) {
    const buildingType = buildings.get(key);
    if (!buildingType) continue;
    const def = getBuildingDef(buildingType);

    if (def.category === 'natural_extractor' && def.outputs && def.requiredDeposit) {
      const deposit = deposits.get(key);
      if (!deposit || deposit.type !== def.requiredDeposit || deposit.richness <= 0) {
        continue;
      }
      for (const [res, amount] of Object.entries(def.outputs)) {
        addToInventory(inventory, res as ResourceType, amount ?? 0);
      }
      deposit.richness = Math.max(0, deposit.richness - EXTRACTOR_DEPLETE_PER_TICK);
      depositUpdates.push({ key, deposit: { ...deposit } });
      extractorDigAnchors.push({ key, building: buildingType });
      continue;
    }

    if (def.category === 'farm' && def.outputs) {
      for (const [res, amount] of Object.entries(def.outputs)) {
        addToInventory(inventory, res as ResourceType, amount ?? 0);
      }
      continue;
    }

    if (def.category === 'factory' && def.inputs && def.outputs) {
      if (!canAfford(inventory, def.inputs)) continue;
      deductCost(inventory, def.inputs);
      for (const [res, amount] of Object.entries(def.outputs)) {
        addToInventory(inventory, res as ResourceType, amount ?? 0);
      }
    }
  }

  return { extractorDigAnchors, depositUpdates };
}
