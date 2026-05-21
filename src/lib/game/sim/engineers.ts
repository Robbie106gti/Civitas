import { parseSubKey, subKey } from '../chunkCoords';
import {
  ENGINEER_MAINTENANCE_RESTORE,
  MAINTENANCE_CONDITION_THRESHOLD,
  MAX_ENGINEERS,
} from '../buildingUpkeepConfig';
import { isRoadType } from '../footprints';
import { findPath } from './pathfind';
import { collectRoadCells, nearestRoadTo } from './roadsCache';
import { MAX_PATHFINDS_PER_TICK } from './walkers';
import {
  applyEngineerMaintenance,
  lowestConditionAnchor,
  type BuildingUpkeepSimState,
} from './buildingUpkeep';
import type { BuildingType, CityInventory } from '../types';

export interface EngineerState {
  id: number;
  sx: number;
  sz: number;
  targetSx: number;
  targetSz: number;
  targetBuildingKey: string | null;
  path?: { sx: number; sz: number }[];
}

export interface EngineerSimState {
  engineers: EngineerState[];
  nextId: number;
  roadCells: { sx: number; sz: number }[];
  roadsDirty: boolean;
}

export function createEngineerState(): EngineerSimState {
  return { engineers: [], nextId: 1, roadCells: [], roadsDirty: true };
}

export function invalidateEngineerRoads(state: EngineerSimState): void {
  state.roadsDirty = true;
}

function ensureRoadCells(state: EngineerSimState, buildings: Map<string, BuildingType>): void {
  if (state.roadsDirty) {
    state.roadCells = collectRoadCells(buildings);
    state.roadsDirty = false;
  }
}

function civicEngineerCap(buildings: Map<string, BuildingType>): number {
  let hubs = 0;
  for (const type of buildings.values()) {
    if (type === 'forum' || type === 'warehouse') hubs++;
  }
  if (hubs === 0) return 0;
  const upkeepCount = [...buildings.values()].filter(
    (t) => !isRoadType(t) && t !== 'tree',
  ).length;
  return Math.min(MAX_ENGINEERS, Math.max(2, Math.floor(upkeepCount / 12) + hubs));
}

function spawnEngineer(
  state: EngineerSimState,
  roads: { sx: number; sz: number }[],
  target: { cx: number; cz: number; key: string },
): void {
  const road = nearestRoadTo(target.cx, target.cz, roads);
  if (!road) return;
  state.engineers.push({
    id: state.nextId++,
    sx: road.sx,
    sz: road.sz,
    targetSx: Math.round(target.cx),
    targetSz: Math.round(target.cz),
    targetBuildingKey: target.key,
  });
}

export function tickEngineers(
  state: EngineerSimState,
  upkeep: BuildingUpkeepSimState,
  buildings: Map<string, BuildingType>,
  inventory: CityInventory,
  simTick: number,
  deltaMs: number,
): EngineerState[] {
  ensureRoadCells(state, buildings);
  const roads = state.roadCells;
  const cap = civicEngineerCap(buildings);
  const getBuilding = (sx: number, sz: number) => buildings.get(subKey(sx, sz)) ?? null;

  while (state.engineers.length < cap) {
    const needy = lowestConditionAnchor(
      upkeep,
      buildings,
      MAINTENANCE_CONDITION_THRESHOLD,
    );
    if (!needy) break;
    spawnEngineer(state, roads, needy);
  }

  const step = (4 * deltaMs) / 1000;
  const arriveDist = 1.2;
  let pathfinds = 0;

  for (const eng of state.engineers) {
    const dist = Math.hypot(eng.targetSx - eng.sx, eng.targetSz - eng.sz);
    if (dist < arriveDist) {
      eng.path = undefined;
      if (eng.targetBuildingKey) {
        const type = buildings.get(eng.targetBuildingKey);
        if (type) {
          applyEngineerMaintenance(
            upkeep,
            eng.targetBuildingKey,
            type,
            inventory,
            ENGINEER_MAINTENANCE_RESTORE,
            simTick,
          );
        }
      }
      const next = lowestConditionAnchor(
        upkeep,
        buildings,
        MAINTENANCE_CONDITION_THRESHOLD,
      );
      if (next) {
        eng.path = undefined;
        eng.targetSx = Math.round(next.cx);
        eng.targetSz = Math.round(next.cz);
        eng.targetBuildingKey = next.key;
      } else {
        eng.targetBuildingKey = null;
      }
      continue;
    }

    if (eng.path?.length) {
      const next = eng.path.shift()!;
      eng.sx = next.sx;
      eng.sz = next.sz;
    } else if (pathfinds < MAX_PATHFINDS_PER_TICK) {
      pathfinds += 1;
      eng.path = findPath(eng.sx, eng.sz, eng.targetSx, eng.targetSz, getBuilding) ?? undefined;
      if (eng.path?.length) {
        const next = eng.path.shift()!;
        eng.sx = next.sx;
        eng.sz = next.sz;
      } else {
        eng.sx += ((eng.targetSx - eng.sx) / dist) * step;
        eng.sz += ((eng.targetSz - eng.sz) / dist) * step;
      }
    } else {
      eng.sx += ((eng.targetSx - eng.sx) / dist) * step;
      eng.sz += ((eng.targetSz - eng.sz) / dist) * step;
    }
  }

  return state.engineers;
}
