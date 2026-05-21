import { createEmptyInventory } from '../inventory';
import type {
  CityInventory,
  DisasterEvent,
  NaturalDeposit,
  SocialEvent,
  SocietySnapshot,
  WalkerState,
} from '../types';
import type { CityMetrics } from './cityMetrics';
import { runFastEconomyTick, runSlowEconomyTick, type EconomyState } from './economy';
import { runProductionTick, type ProductionState } from './production';
import { tickWalkers, createWalkerState, type WalkerSimState } from './walkers';
import { decayTraffic, addWalkerTraffic, applyTrafficRoads } from './traffic';
import { tickAnimals, createAnimalState, type AnimalSimState } from './animals';
import { tickDisasters, createDisasterState, type DisasterSimState } from './disasters';
import {
  createHousingEvolutionState,
  tickHousingEvolution,
  type HousingEvolutionSimState,
} from './housingEvolution';
import {
  createBuildingUpkeepState,
  tickBuildingUpkeep,
  type BuildingUpkeepSimState,
} from './buildingUpkeep';
import { tickCivicEvolution } from './buildingEvolution';
import { createDefaultCityMetrics } from './cityMetrics';
import { createEngineerState, invalidateEngineerRoads, tickEngineers, type EngineerSimState } from './engineers';
import { invalidateWalkerRoads } from './walkers';
import type { EngineerState } from './engineers';
import { SLOW_TICK_INTERVAL_TICKS } from './simIntervals';
import type { WorkerPerfSnapshot } from '../protocol';
import { mapHasRoadFromCount } from './roadsCache';

function measure<T>(perf: WorkerPerfSnapshot, key: keyof WorkerPerfSnapshot, fn: () => T): T {
  const t0 = performance.now();
  const result = fn();
  perf[key] = performance.now() - t0;
  return result;
}

export interface SimTickInput {
  deltaMs: number;
  simTime: number;
  production?: ProductionState;
  economy?: EconomyState;
  walkers?: WalkerSimState;
  animals?: AnimalSimState;
  disasters?: DisasterSimState;
  traffic?: Map<string, number>;
  occupancy?: Map<string, BuildingType>;
  worldSeed?: number;
  activeChunkKeys?: Set<string>;
  housing?: HousingEvolutionSimState;
  upkeep?: BuildingUpkeepSimState;
  engineers?: EngineerSimState;
  /** When set, subsystem timings are written (perf overlay only). */
  perf?: WorkerPerfSnapshot;
}

export interface SimTickOutput {
  simTime: number;
  revision: number;
  entities: number;
  resources: { denarii: number; inventory: CityInventory };
  /** Full society only when a slow tick ran (authoritative refresh). */
  society?: SocietySnapshot;
  metrics: CityMetrics;
  slowTick: boolean;
  walkers?: WalkerState[];
  disasters?: DisasterEvent[];
  trafficRoads?: { key: string; building: BuildingType }[];
  extractorDigAnchors?: { key: string; building: BuildingType }[];
  depositUpdates?: { key: string; deposit: NaturalDeposit }[];
  housingUpdates?: { key: string; score: number; tier: 0 | 1 | 2 }[];
  upkeepUpdates?: {
    key: string;
    condition: number;
    entropy: number;
    evolutionScore: number;
    materialStarved: boolean;
  }[];
  civicEvolution?: { key: string; evolutionScore: number; tierChanged: boolean }[];
  engineers?: EngineerState[];
  socialEvents?: SocialEvent[];
}

function isSlowSimTick(simTick: number): boolean {
  return simTick % SLOW_TICK_INTERVAL_TICKS === 0;
}

/** Pure sim tick — runs in the worker. */
export function runSimTick(input: SimTickInput): SimTickOutput {
  const simTime = input.simTime + input.deltaMs;
  const walkers = input.walkers ?? createWalkerState();
  const animals = input.animals ?? createAnimalState();
  const disasters = input.disasters ?? createDisasterState();
  const traffic = input.traffic ?? new Map<string, number>();
  const occupancy = input.occupancy ?? input.production?.buildings ?? new Map();
  const worldSeed = input.worldSeed ?? 0;

  const metrics = input.economy?.cityMetrics ?? createDefaultCityMetrics();

  if (input.production) {
    const perf = input.perf;
    const { extractorDigAnchors, depositUpdates } = perf
      ? measure(perf, 'productionMs', () => runProductionTick(input.production!))
      : runProductionTick(input.production);

    decayTraffic(traffic);
    const hasRoads = mapHasRoadFromCount(input.production.roadCellCount);
    const walkerList = perf
      ? measure(perf, 'walkersMs', () => {
          if (!hasRoads) {
            walkers.walkers.length = 0;
            return [] as WalkerState[];
          }
          const list = tickWalkers(walkers, occupancy, input.deltaMs);
          if (list.length > 0) addWalkerTraffic(traffic, list);
          return list;
        })
      : hasRoads
        ? tickWalkers(walkers, occupancy, input.deltaMs)
        : (walkers.walkers.length = 0, [] as WalkerState[]);
    if (!perf && walkerList.length > 0) addWalkerTraffic(traffic, walkerList);
    const trafficRoads = hasRoads
      ? applyTrafficRoads(traffic, input.production.buildings)
      : [];

    if (trafficRoads.length > 0) {
      invalidateWalkerRoads(walkers);
      if (input.engineers) invalidateEngineerRoads(input.engineers);
    }

    for (const { key, building } of trafficRoads) {
      occupancy.set(key, building);
    }

    if (input.production.buildings.size > 0) {
      if (perf) {
        measure(perf, 'animalsMs', () =>
          tickAnimals(animals, input.production!.deposits, occupancy, worldSeed, simTime),
        );
      } else {
        tickAnimals(animals, input.production.deposits, occupancy, worldSeed, simTime);
      }
    } else if (perf) {
      perf.animalsMs = 0;
    }
    const disasterEvents = perf
      ? measure(perf, 'disastersMs', () =>
          tickDisasters(
            disasters,
            input.production!.buildings,
            worldSeed,
            simTime,
            input.deltaMs,
          ),
        )
      : tickDisasters(
          disasters,
          input.production.buildings,
          worldSeed,
          simTime,
          input.deltaMs,
        );

    let housingUpdates: SimTickOutput['housingUpdates'];
    let upkeepUpdates: SimTickOutput['upkeepUpdates'];
    let civicEvolution: SimTickOutput['civicEvolution'];
    let engineers: SimTickOutput['engineers'];
    let society: SocietySnapshot | undefined;
    let slowTick = false;
    let socialEvents: SocialEvent[] | undefined;

    if (input.economy) {
      if (perf) {
        measure(perf, 'economyFastMs', () => runFastEconomyTick(input.production!, input.economy!));
      } else {
        runFastEconomyTick(input.production, input.economy);
      }
      slowTick = isSlowSimTick(input.economy.simTick);

      const upkeep = input.upkeep ?? createBuildingUpkeepState(Math.floor(simTime));

      if (slowTick) {
        if (perf) {
          measure(perf, 'economySlowMs', () =>
            runSlowEconomyTick(input.production!, input.economy!),
          );
        } else {
          runSlowEconomyTick(input.production, input.economy);
        }
        society = input.economy.society;
        socialEvents =
          input.economy.lastSocialEvents.length > 0 ? input.economy.lastSocialEvents : undefined;

        const housing = input.housing ?? createHousingEvolutionState();
        if (perf) {
          housingUpdates = measure(perf, 'housingMs', () => {
            const updates = tickHousingEvolution(
              housing,
              input.production!.buildings,
              input.economy!.cityMetrics,
            );
            civicEvolution = tickCivicEvolution(
              input.production!.buildings,
              upkeep.buildings,
              input.economy!.cityMetrics,
            );
            return updates;
          });
        } else {
          housingUpdates = tickHousingEvolution(
            housing,
            input.production.buildings,
            input.economy.cityMetrics,
          );
          civicEvolution = tickCivicEvolution(
            input.production.buildings,
            upkeep.buildings,
            input.economy.cityMetrics,
          );
        }
        input.housing = housing;
      } else if (perf) {
        perf.economySlowMs = 0;
        perf.housingMs = 0;
      }

      const upkeepResult = perf
        ? measure(perf, 'upkeepMs', () =>
            tickBuildingUpkeep(
              upkeep,
              input.production!.buildings,
              input.production!.inventory,
              traffic,
              Math.floor(simTime),
            ),
          )
        : tickBuildingUpkeep(
            upkeep,
            input.production.buildings,
            input.production.inventory,
            traffic,
            Math.floor(simTime),
          );
      upkeepUpdates = upkeepResult.updates;
      input.upkeep = upkeep;

      const engineerState = input.engineers ?? createEngineerState();
      engineers = perf
        ? measure(perf, 'engineersMs', () =>
            tickEngineers(
              engineerState,
              upkeep,
              input.production!.buildings,
              input.production!.inventory,
              Math.floor(simTime),
              input.deltaMs,
            ),
          )
        : tickEngineers(
            engineerState,
            upkeep,
            input.production.buildings,
            input.production.inventory,
            Math.floor(simTime),
            input.deltaMs,
          );
      input.engineers = engineerState;
    } else if (perf) {
      perf.economyFastMs = 0;
      perf.economySlowMs = 0;
      perf.housingMs = 0;
      perf.upkeepMs = 0;
      perf.engineersMs = 0;
    }

    const inventory = input.production.inventory;
    const treasury = input.economy?.society.tax.treasury ?? 500;
    const cityMetrics = input.economy?.cityMetrics ?? metrics;

    return {
      simTime,
      revision: Math.floor(simTime / 1000),
      entities: input.production.buildings.size + walkerList.length,
      resources: { denarii: treasury, inventory },
      society,
      metrics: cityMetrics,
      slowTick,
      walkers: walkerList,
      disasters: disasterEvents,
      trafficRoads,
      extractorDigAnchors,
      depositUpdates: depositUpdates.length > 0 ? depositUpdates : undefined,
      housingUpdates,
      upkeepUpdates,
      civicEvolution,
      engineers,
      socialEvents,
    };
  }

  const inventory = createEmptyInventory();
  const treasury = input.economy?.society.tax.treasury ?? 500;

  return {
    simTime,
    revision: Math.floor(simTime / 1000),
    entities: 0,
    resources: { denarii: treasury, inventory },
    society: input.economy?.society,
    metrics: input.economy?.cityMetrics ?? metrics,
    slowTick: false,
  };
}
