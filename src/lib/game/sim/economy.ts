import { countPopulation, computeHappiness } from '../society';
import type { BuildingType, SocialEvent, SocietySnapshot } from '../types';
import type { ProductionState } from './production';
import { buildCityMetrics, type CityMetrics } from './cityMetrics';
import { runPoliticsTick } from './politics';
import { runReligionTick } from './religion';
import { runSocialTick } from './social/tick';
import { runTaxTick } from './taxes';

export interface EconomyState {
  society: SocietySnapshot;
  simTick: number;
  lastSocialEvents: SocialEvent[];
  cityMetrics: CityMetrics;
}

function countHouses(buildings: Iterable<BuildingType>): number {
  let n = 0;
  for (const t of buildings) {
    if (t === 'house') n += 1;
  }
  return n;
}

/** Lightweight economy: population + tax + politics cadence (12 Hz). */
export function runFastEconomyTick(production: ProductionState, economy: EconomyState): void {
  economy.simTick += 1;
  const tick = economy.simTick;
  const { society } = economy;
  const buildingTypes = production.buildings.values();

  const houses = countHouses(buildingTypes);
  society.population = countPopulation(houses);

  runTaxTick(society.tax, society.population);
  runPoliticsTick(society.politics, tick);
}

/** Heavy society recompute (~1/min): religion, social graph, happiness, metrics. */
export function runSlowEconomyTick(production: ProductionState, economy: EconomyState): void {
  const tick = economy.simTick;
  const { society } = economy;
  const buildingTypes = production.buildings.values();

  runReligionTick(society.religion, buildingTypes, society.population, production.inventory);

  const { events } = runSocialTick(society, buildingTypes, production.inventory, tick);
  economy.lastSocialEvents = events;

  society.happiness = computeHappiness(
    society.religion,
    society.tax.rateLevel,
    society.politics,
    society.social,
  );

  economy.cityMetrics = buildCityMetrics(society);
}
