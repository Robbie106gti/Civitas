import { createSeededRng } from '../resources';
import { DISASTER_CHANCE_PER_SEC } from '../constants';
import { subKey } from '../chunkCoords';
import type { BuildingType, DisasterEvent, DisasterType } from '../types';

export interface DisasterSimState {
  lastEvents: DisasterEvent[];
}

export function createDisasterState(): DisasterSimState {
  return { lastEvents: [] };
}

const DISASTER_MESSAGES: Record<DisasterType, string> = {
  fire: '🔥 Fire breaks out near the forum!',
  earthquake: '🌍 Earthquake rattles the province (stub).',
  flood: '🌊 Floods threaten the docks (stub).',
  plague: '☠️ Plague spreads through cramped housing (stub).',
};

function pickDisasterType(rng: () => number): DisasterType {
  const roll = rng();
  if (roll < 0.55) return 'fire';
  if (roll < 0.75) return 'earthquake';
  if (roll < 0.9) return 'flood';
  return 'plague';
}

/**
 * Fire: removes a random non-road building sub-cell cluster anchor.
 * Other types: event banner only (stub).
 */
export function tickDisasters(
  state: DisasterSimState,
  buildings: Map<string, BuildingType>,
  worldSeed: number,
  simTime: number,
  deltaMs: number,
): DisasterEvent[] {
  state.lastEvents = [];
  const rng = createSeededRng(worldSeed ^ Math.floor(simTime));
  const chance = DISASTER_CHANCE_PER_SEC * (deltaMs / 1000);
  if (rng() > chance) return state.lastEvents;

  const anchors = [...buildings.entries()].filter(
    ([, t]) => t !== 'dirt_path' && t !== 'road' && t !== 'highway',
  );
  if (anchors.length === 0) return state.lastEvents;

  const [key] = anchors[Math.floor(rng() * anchors.length)]!;
  const [xs, zs] = key.split(',');
  const sx = Number(xs);
  const sz = Number(zs);
  if (Number.isNaN(sx) || Number.isNaN(sz)) return state.lastEvents;

  const type = pickDisasterType(rng);
  const event: DisasterEvent = {
    type,
    sx,
    sz,
    message: DISASTER_MESSAGES[type],
    tick: simTime,
  };
  state.lastEvents.push(event);

  if (type === 'fire') {
    const building = buildings.get(key);
    if (building) {
      buildings.delete(key);
      for (const [k, b] of [...buildings.entries()]) {
        if (b === building) buildings.delete(k);
      }
    }
  }

  return state.lastEvents;
}

export function disasterAffectedKeys(events: DisasterEvent[]): string[] {
  return events.map((e) => subKey(e.sx, e.sz));
}
