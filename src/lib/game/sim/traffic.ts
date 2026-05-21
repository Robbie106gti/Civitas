import {
  TRAFFIC_DECAY,
  TRAFFIC_DIRT_THRESHOLD,
  TRAFFIC_HIGHWAY_THRESHOLD,
  TRAFFIC_ROAD_THRESHOLD,
  TRAFFIC_STEP_HEAT,
} from '../constants';
import { subKey } from '../chunkCoords';
import { isRoadType } from '../footprints';
import type { BuildingType, WalkerState } from '../types';

export function decayTraffic(traffic: Map<string, number>): void {
  for (const [key, heat] of traffic) {
    const next = heat * TRAFFIC_DECAY;
    if (next < 0.5) traffic.delete(key);
    else traffic.set(key, next);
  }
}

export function addWalkerTraffic(traffic: Map<string, number>, walkers: WalkerState[]): void {
  for (const w of walkers) {
    const key = subKey(Math.round(w.sx), Math.round(w.sz));
    traffic.set(key, (traffic.get(key) ?? 0) + TRAFFIC_STEP_HEAT);
  }
}

function roadUpgrade(heat: number): BuildingType | null {
  if (heat >= TRAFFIC_HIGHWAY_THRESHOLD) return 'highway';
  if (heat >= TRAFFIC_ROAD_THRESHOLD) return 'road';
  if (heat >= TRAFFIC_DIRT_THRESHOLD) return 'dirt_path';
  return null;
}

/** Auto-upgrade empty cells to roads based on traffic heat. */
export function applyTrafficRoads(
  traffic: Map<string, number>,
  buildings: Map<string, BuildingType>,
): { key: string; building: BuildingType }[] {
  const placed: { key: string; building: BuildingType }[] = [];

  for (const [key, heat] of traffic) {
    const upgrade = roadUpgrade(heat);
    if (!upgrade) continue;
    const existing = buildings.get(key);
    if (existing && isRoadType(existing)) {
      const order: BuildingType[] = ['dirt_path', 'road', 'highway'];
      if (order.indexOf(upgrade) > order.indexOf(existing)) {
        buildings.set(key, upgrade);
        placed.push({ key, building: upgrade });
      }
      continue;
    }
    if (!existing) {
      buildings.set(key, upgrade);
      placed.push({ key, building: upgrade });
    }
  }

  return placed;
}
