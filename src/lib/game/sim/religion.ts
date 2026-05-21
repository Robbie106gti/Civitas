import { getBuildingDef } from '../buildings';
import { canAfford, deductCost } from '../inventory';
import type { BuildingType, CityInventory, DeityId, ReligionState } from '../types';

/** Population served per building (city-wide coverage model). */
export const RELIGION_COVERAGE: Partial<Record<BuildingType, number>> = {
  shrine: 15,
  temple: 40,
  oracle: 25,
};

/** Favor granted per tick when temple has offerings. */
const TEMPLE_FAVOR_PER_TICK = 0.08;

/** Unrest penalty when coverage below this threshold (%). */
const LOW_COVERAGE_THRESHOLD = 40;

export function countReligionBuildings(buildings: Iterable<BuildingType>): {
  shrines: number;
  temples: number;
  oracles: number;
} {
  let shrines = 0;
  let temples = 0;
  let oracles = 0;
  for (const t of buildings) {
    if (t === 'shrine') shrines += 1;
    else if (t === 'temple') temples += 1;
    else if (t === 'oracle') oracles += 1;
  }
  return { shrines, temples, oracles };
}

export function computeCoverage(population: number, religionCapacity: number): number {
  if (population <= 0) return 100;
  return Math.min(100, Math.round((religionCapacity / population) * 100));
}

export function religionCapacityFromCounts(
  counts: ReturnType<typeof countReligionBuildings>,
): number {
  return (
    counts.shrines * (RELIGION_COVERAGE.shrine ?? 0) +
    counts.temples * (RELIGION_COVERAGE.temple ?? 0) +
    counts.oracles * (RELIGION_COVERAGE.oracle ?? 0)
  );
}

export function runReligionTick(
  state: ReligionState,
  buildings: Iterable<BuildingType>,
  population: number,
  inventory: CityInventory,
): void {
  const counts = countReligionBuildings(buildings);
  const capacity = religionCapacityFromCounts(counts);
  state.coveragePercent = computeCoverage(population, capacity);

  const def = getBuildingDef('temple');
  const templeInputs = def.inputs;
  let templesFed = 0;
  if (counts.temples > 0 && templeInputs) {
    for (let i = 0; i < counts.temples; i++) {
      if (canAfford(inventory, templeInputs)) {
        deductCost(inventory, templeInputs);
        templesFed += 1;
      }
    }
  }

  const deities: DeityId[] = ['jupiter', 'mars', 'ceres'];
  for (const d of deities) {
    let favor = state.favor[d];
    if (templesFed > 0 && d === 'ceres') {
      favor = Math.min(100, favor + TEMPLE_FAVOR_PER_TICK * templesFed);
    } else if (state.coveragePercent >= 60) {
      favor = Math.min(100, favor + 0.02);
    } else if (state.coveragePercent < LOW_COVERAGE_THRESHOLD) {
      favor = Math.max(0, favor - 0.05);
    }
    state.favor[d] = favor;
  }

  if (state.coveragePercent >= 80) {
    state.unrestModifier = -3;
  } else if (state.coveragePercent < LOW_COVERAGE_THRESHOLD) {
    state.unrestModifier = 5;
  } else {
    state.unrestModifier = 0;
  }
}
