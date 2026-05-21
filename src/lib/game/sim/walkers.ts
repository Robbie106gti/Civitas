import { MAX_WALKERS, WALKER_SPEED } from '../constants';
import { subKey } from '../chunkCoords';
import { findPath } from './pathfind';
import { collectRoadCells, pickRandomRoad } from './roadsCache';
import type { BuildingType, WalkerState } from '../types';

/** Cap A* runs per sim tick so pathfinding cannot dominate the worker. */
export const MAX_PATHFINDS_PER_TICK = 5;

export interface WalkerSimState {
  walkers: WalkerState[];
  nextId: number;
  roadCells: { sx: number; sz: number }[];
  roadsDirty: boolean;
}

export function createWalkerState(): WalkerSimState {
  return { walkers: [], nextId: 1, roadCells: [], roadsDirty: true };
}

export function invalidateWalkerRoads(state: WalkerSimState): void {
  state.roadsDirty = true;
}

function ensureRoadCells(state: WalkerSimState, buildings: Map<string, BuildingType>): void {
  if (state.roadsDirty) {
    state.roadCells = collectRoadCells(buildings);
    state.roadsDirty = false;
  }
}

export function tickWalkers(
  state: WalkerSimState,
  buildings: Map<string, BuildingType>,
  deltaMs: number,
): WalkerState[] {
  ensureRoadCells(state, buildings);
  const roads = state.roadCells;
  if (roads.length === 0) {
    state.walkers.length = 0;
    return [];
  }
  const getBuilding = (sx: number, sz: number) => buildings.get(subKey(sx, sz)) ?? null;

  while (state.walkers.length < MAX_WALKERS) {
    const start = pickRandomRoad(roads);
    if (!start) break;
    const goal = pickRandomRoad(roads);
    if (!goal) break;
    state.walkers.push({
      id: state.nextId++,
      sx: start.sx,
      sz: start.sz,
      targetSx: goal.sx,
      targetSz: goal.sz,
    });
  }

  const stepCells = (WALKER_SPEED * deltaMs) / 1000;
  const moveThreshold = Math.max(0.15, stepCells);
  let pathfinds = 0;

  for (const walker of state.walkers) {
    const dist = Math.hypot(walker.targetSx - walker.sx, walker.targetSz - walker.sz);
    if (dist < 0.5) {
      walker.path = undefined;
      const next = pickRandomRoad(roads);
      if (next) {
        walker.targetSx = next.sx;
        walker.targetSz = next.sz;
      }
      continue;
    }

    if (dist <= moveThreshold) {
      walker.path = undefined;
      walker.sx = walker.targetSx;
      walker.sz = walker.targetSz;
    } else if (walker.path?.length) {
      const next = walker.path.shift()!;
      walker.sx = next.sx;
      walker.sz = next.sz;
    } else if (pathfinds < MAX_PATHFINDS_PER_TICK) {
      pathfinds += 1;
      walker.path = findPath(walker.sx, walker.sz, walker.targetSx, walker.targetSz, getBuilding) ?? undefined;
      if (walker.path?.length) {
        const next = walker.path.shift()!;
        walker.sx = next.sx;
        walker.sz = next.sz;
      } else {
        walker.sx += ((walker.targetSx - walker.sx) / dist) * moveThreshold;
        walker.sz += ((walker.targetSz - walker.sz) / dist) * moveThreshold;
      }
    } else {
      walker.sx += ((walker.targetSx - walker.sx) / dist) * moveThreshold;
      walker.sz += ((walker.targetSz - walker.sz) / dist) * moveThreshold;
    }
  }

  return state.walkers;
}
