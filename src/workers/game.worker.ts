import type {
  MainToWorkerMessage,
  WorkerPerfSnapshot,
  WorkerToMainMessage,
} from '../lib/game/protocol';
import { createDefaultSocietySnapshot, ensureSocialState } from '../lib/game/society';
import { marketPriceMultiplier } from '../lib/game/sim/social/market';
import { runSimTick } from '../lib/game/sim/tick';
import type { EconomyState } from '../lib/game/sim/economy';
import {
  collectProductionKeys,
  createProductionState,
  syncProductionKey,
  type ProductionState,
} from '../lib/game/sim/production';
import { adjustRoadCellCount, countRoadCells } from '../lib/game/sim/roadsCache';
import { fulfillActiveEdict } from '../lib/game/sim/politics';
import { executeTrade } from '../lib/game/sim/trade';
import { encodeSave } from '../lib/game/compute/encodeSave';
import { createWalkerState, invalidateWalkerRoads } from '../lib/game/sim/walkers';
import { createAnimalState } from '../lib/game/sim/animals';
import { createDisasterState } from '../lib/game/sim/disasters';
import type {
  BuildingType,
  CityInventory,
  NaturalDeposit,
  SocietySnapshot,
} from '../lib/game/types';
import { DEFAULT_WORLD_SEED } from '../lib/game/constants';
import {
  createHousingEvolutionState,
  housingStateFromSnapshots,
  syncHouseEvolutionMap,
  type HousingEvolutionSimState,
} from '../lib/game/sim/housingEvolution';
import {
  createBuildingUpkeepState,
  upkeepStateFromSnapshots,
  type BuildingUpkeepSimState,
} from '../lib/game/sim/buildingUpkeep';
import { syncUpkeepMap } from '../lib/game/sim/upkeepSync';
import {
  createEngineerState,
  invalidateEngineerRoads,
  type EngineerSimState,
} from '../lib/game/sim/engineers';
import { buildCityMetrics } from '../lib/game/sim/cityMetrics';
import { runSlowEconomyTick } from '../lib/game/sim/economy';

let simTime = 0;
let worldSeed = DEFAULT_WORLD_SEED;
let production: ProductionState | null = null;
let economy: EconomyState | null = null;
let walkers = createWalkerState();
let animals = createAnimalState();
let disasters = createDisasterState();
let traffic = new Map<string, number>();
let occupancy = new Map<string, BuildingType>();
let housing: HousingEvolutionSimState = createHousingEvolutionState();
let upkeep: BuildingUpkeepSimState = createBuildingUpkeepState();
let engineers: EngineerSimState = createEngineerState();

function reply(message: WorkerToMainMessage, transfer?: Transferable[]): void {
  if (transfer?.length) {
    self.postMessage(message, { transfer });
  } else {
    self.postMessage(message);
  }
}

function cloneSociety(s: SocietySnapshot): SocietySnapshot {
  ensureSocialState(s);
  return {
    ...s,
    religion: {
      ...s.religion,
      favor: { ...s.religion.favor },
    },
    tax: { ...s.tax },
    politics: {
      ...s.politics,
      activeRequest: s.politics.activeRequest ? { ...s.politics.activeRequest } : null,
    },
    trade: { ...s.trade },
    social: {
      needs: { ...s.social.needs },
      unrest: { ...s.social.unrest },
      crime: { ...s.social.crime },
      factions: s.social.factions.map((f) => ({ ...f })),
      legitimacy: { ...s.social.legitimacy },
      market: {
        demandIndex: s.social.market.demandIndex,
        priceModifiers: { ...s.social.market.priceModifiers },
      },
      conflict: {
        ...s.social.conflict,
        crisis: { ...s.social.conflict.crisis },
      },
    },
  };
}

function applySync(
  buildings: { key: string; building: BuildingType | null }[],
  deposits: { key: string; deposit: NaturalDeposit }[],
  inventory: CityInventory,
  occ: { key: string; building: BuildingType | null }[],
  trafficEntries: { key: string; heat: number }[],
  society?: SocietySnapshot,
  partial = false,
): void {
  if (!production) return;
  let roadCellsChanged = false;
  if (partial) {
    for (const { key, building } of buildings) {
      const prev = production.buildings.get(key);
      const nextCount = adjustRoadCellCount(
        production.roadCellCount,
        prev,
        building,
      );
      if (nextCount !== production.roadCellCount) roadCellsChanged = true;
      production.roadCellCount = nextCount;
      syncProductionKey(production.productionKeys, key, prev, building);
      if (building === null) production.buildings.delete(key);
      else production.buildings.set(key, building);
    }
    for (const { key, deposit } of deposits) {
      production.deposits.set(key, { ...deposit });
    }
    for (const { key, building } of occ) {
      if (building === null) occupancy.delete(key);
      else occupancy.set(key, building);
    }
    for (const { key, heat } of trafficEntries) {
      traffic.set(key, heat);
    }
  } else {
    production.buildings = new Map(
      buildings
        .filter((b): b is { key: string; building: BuildingType } => b.building !== null)
        .map((b) => [b.key, b.building]),
    );
    production.roadCellCount = countRoadCells(production.buildings);
    production.productionKeys = collectProductionKeys(production.buildings);
    production.deposits = new Map(deposits.map((d) => [d.key, { ...d.deposit }]));
    occupancy = new Map(
      occ
        .filter((o): o is { key: string; building: BuildingType } => o.building !== null)
        .map((o) => [o.key, o.building]),
    );
    traffic = new Map(trafficEntries.map((t) => [t.key, t.heat]));
  }
  production.inventory = { ...inventory };
  if (society && economy) {
    economy.society = cloneSociety(society);
    economy.society.tax.treasury = society.tax.treasury;
    economy.cityMetrics = buildCityMetrics(economy.society);
  }
  if (roadCellsChanged) {
    invalidateWalkerRoads(walkers);
    invalidateEngineerRoads(engineers);
  }
  syncHouseEvolutionMap(housing, production.buildings);
  syncUpkeepMap(upkeep, production.buildings);
}

self.addEventListener('message', (event: MessageEvent<MainToWorkerMessage>) => {
  const message = event.data;

  switch (message.type) {
    case 'ping':
      reply({ type: 'pong' });
      break;
    case 'initGrid': {
      simTime = 0;
      worldSeed = message.worldSeed;
      const society = message.society
        ? cloneSociety(message.society)
        : createDefaultSocietySnapshot();
      production = createProductionState(
        new Map(message.buildings.map((b) => [b.key, b.building])),
        new Map(message.deposits.map((d) => [d.key, { ...d.deposit }])),
        { ...message.inventory },
      );
      occupancy = new Map(message.buildings.map((b) => [b.key, b.building]));
      traffic = new Map(message.traffic.map((t) => [t.key, t.heat]));
      walkers = createWalkerState();
      animals = createAnimalState();
      disasters = createDisasterState();
      economy = {
        society,
        simTick: 0,
        lastSocialEvents: [],
        cityMetrics: buildCityMetrics(society),
      };
      if (production) {
        runSlowEconomyTick(production, economy);
      }
      housing = message.housing?.length
        ? housingStateFromSnapshots(message.housing)
        : createHousingEvolutionState();
      upkeep = message.upkeep?.length
        ? upkeepStateFromSnapshots(message.upkeep)
        : createBuildingUpkeepState();
      engineers = createEngineerState();
      if (production) {
        syncHouseEvolutionMap(housing, production.buildings);
        syncUpkeepMap(upkeep, production.buildings);
      }
      reply({ type: 'initGridAck' });
      break;
    }
    case 'syncCity':
      applySync(
        message.buildings,
        message.deposits,
        message.inventory,
        message.occupancy,
        message.traffic,
        message.society,
        message.partial,
      );
      break;
    case 'governance.setTaxRate': {
      if (!economy) break;
      economy.society.tax.rateLevel = message.rateLevel;
      reply({ type: 'governance.ack', society: cloneSociety(economy.society) });
      break;
    }
    case 'governance.fulfillEdict': {
      if (!production || !economy) break;
      const result = fulfillActiveEdict(economy.society.politics, production.inventory);
      if (result.ok) {
        reply({ type: 'governance.ack', society: cloneSociety(economy.society) });
      } else {
        reply({ type: 'governance.error', reason: result.reason });
      }
      break;
    }
    case 'governance.trade': {
      if (!production || !economy) break;
      let hasTrade = false;
      for (const t of production.buildings.values()) {
        if (t === 'trade_post' || t === 'market' || t === 'dock') {
          hasTrade = true;
          break;
        }
      }
      if (!hasTrade) {
        reply({ type: 'governance.error', reason: 'Build a trade post, market, or dock first' });
        break;
      }
      const treasury = economy.society.tax.treasury;
      ensureSocialState(economy.society);
      const priceMult = marketPriceMultiplier(
        economy.society.social.market,
        message.resource,
      );
      const tradeResult = executeTrade(
        production.inventory,
        treasury,
        message.resource,
        message.quantity,
        message.action,
        priceMult,
      );
      if (!tradeResult.ok) {
        reply({ type: 'governance.error', reason: tradeResult.reason ?? 'Trade failed' });
        break;
      }
      if (tradeResult.denariiDelta) {
        economy.society.tax.treasury += tradeResult.denariiDelta;
      }
      if (message.action === 'buy') {
        economy.society.trade.lifetimeImports += message.quantity;
      } else {
        economy.society.trade.lifetimeExports += message.quantity;
      }
      reply({
        type: 'governance.ack',
        society: cloneSociety(economy.society),
        inventory: { ...production.inventory },
      });
      break;
    }
    case 'sim.tick': {
      const perfOn = message.perf === true;
      let perfTimings: WorkerPerfSnapshot | undefined;
      if (perfOn) {
        perfTimings = {
          tickMs: 0,
          productionMs: 0,
          walkersMs: 0,
          animalsMs: 0,
          disastersMs: 0,
          economyFastMs: 0,
          economySlowMs: 0,
          housingMs: 0,
          upkeepMs: 0,
          engineersMs: 0,
        };
      }
      const tickStart = perfOn ? performance.now() : 0;
      const result = runSimTick({
        deltaMs: message.deltaMs,
        simTime,
        production: production ?? undefined,
        economy: economy ?? undefined,
        walkers,
        animals,
        disasters,
        traffic,
        occupancy,
        worldSeed,
        housing,
        upkeep,
        engineers,
        perf: perfTimings,
      });
      simTime = result.simTime;

      if (result.trafficRoads?.length && production) {
        let roadCellsChanged = false;
        for (const { key, building } of result.trafficRoads) {
          const prev = production.buildings.get(key);
          const nextCount = adjustRoadCellCount(
            production.roadCellCount,
            prev,
            building,
          );
          if (nextCount !== production.roadCellCount) roadCellsChanged = true;
          production.roadCellCount = nextCount;
          production.buildings.set(key, building);
          occupancy.set(key, building);
        }
        if (roadCellsChanged) {
          invalidateWalkerRoads(walkers);
          invalidateEngineerRoads(engineers);
        }
      }

      if (perfTimings) {
        perfTimings.tickMs = performance.now() - tickStart;
      }

      const walkerPayload = result.walkers?.map(({ path: _path, ...w }) => w);
      const tickResult = {
        type: 'sim.tickResult' as const,
        simTime: result.simTime,
        revision: result.revision,
        entities: result.entities,
        resources: result.resources,
        society: result.slowTick ? result.society : undefined,
        metrics: result.metrics,
        slowTick: result.slowTick,
        deposits:
          result.depositUpdates && result.depositUpdates.length > 0
            ? result.depositUpdates
            : undefined,
        walkers: walkerPayload,
        disasters: result.disasters,
        trafficRoads: result.trafficRoads,
        extractorDigAnchors: result.extractorDigAnchors,
        housingUpdates: result.housingUpdates,
        upkeepUpdates: result.upkeepUpdates,
        civicEvolution: result.civicEvolution,
        engineers: result.engineers,
        socialEvents: result.socialEvents,
        ...(perfTimings ? { perf: perfTimings } : {}),
      };
      reply(tickResult);
      break;
    }
    case 'anim.samplePaths':
      reply({ type: 'anim.pathBuffers', buffers: [] });
      break;
    case 'job.encodeSave':
      reply({ type: 'job.encodeSaveResult', json: encodeSave(message.snapshot) });
      break;
    default: {
      const _exhaustive: never = message;
      void _exhaustive;
    }
  }
});
