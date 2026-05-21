import { getBuildingDef } from './buildings';
import { isRoadType } from './footprints';
import type { BuildingType, ResourceType } from './types';

/** Sim ticks between upkeep / entropy steps (~2.5s at 12 Hz). */
export const UPKEEP_TICK_INTERVAL = 5;

/** Material draw every N upkeep ticks when condition is below passive threshold. */
export const UPKEEP_MATERIAL_INTERVAL = 3;

/** Buildings below this condition are targeted by engineers. */
export const MAINTENANCE_CONDITION_THRESHOLD = 58;

/** Condition restored per successful engineer visit. */
export const ENGINEER_MAINTENANCE_RESTORE = 22;

/** Max engineer walkers patrolling for maintenance. */
export const MAX_ENGINEERS = 10;

export const CONDITION_MIN = 0;
export const CONDITION_MAX = 100;

/** Base entropy (condition loss) per upkeep tick by category. */
export const ENTROPY_RATE_BY_CATEGORY: Record<
  import('./types').BuildingCategory,
  number
> = {
  natural_extractor: 0.35,
  farm: 0.28,
  factory: 0.42,
  housing: 0.32,
  civic: 0.38,
  religion: 0.34,
  trade: 0.36,
  road: 0,
  decorative: 0.08,
  storage: 0.3,
};

/** Periodic material upkeep costs (deducted from city inventory). */
export const UPKEEP_MATERIAL_COSTS: Partial<
  Record<BuildingType, Partial<Record<ResourceType, number>>>
> = {
  house: { wood: 1 },
  forum: { rock: 1, wood: 1 },
  temple: { rock: 2 },
  shrine: { rock: 1 },
  oracle: { rock: 2, gold: 0 },
  warehouse: { wood: 2 },
  market: { wood: 1, wheat: 1 },
  trade_post: { wood: 1 },
  dock: { wood: 2 },
  pottery_workshop: { clay: 1, wood: 1 },
  weaponsmith: { iron: 1, wood: 1 },
  farm_wheat: { wheat: 0 },
  lumber_camp: { wood: 0 },
  clay_pit: { wood: 1 },
  quarry: { wood: 1 },
  sand_pit: { wood: 1 },
  iron_mine: { wood: 2, iron: 0 },
  gold_mine: { wood: 2 },
};

/** Multiplier on entropy when last material upkeep failed. */
export const ENTROPY_STARVE_MULTIPLIER = 1.55;

/** Multiplier on entropy when local traffic heat is high. */
export const ENTROPY_TRAFFIC_MULTIPLIER = 1.25;

export function buildingHasUpkeep(type: BuildingType): boolean {
  if (isRoadType(type) || type === 'tree') return false;
  return getBuildingDef(type).category !== 'road';
}

export function entropyRateForType(type: BuildingType): number {
  const cat = getBuildingDef(type).category;
  return ENTROPY_RATE_BY_CATEGORY[cat] ?? 0.3;
}

export function materialCostForType(type: BuildingType): Partial<Record<ResourceType, number>> {
  return UPKEEP_MATERIAL_COSTS[type] ?? { wood: 1 };
}
