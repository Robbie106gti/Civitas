import { parseSubKey } from '../chunkCoords';
import { getFootprint } from '../footprints';
import type { HousingTier } from '../housingState';
import type { BuildingType } from '../types';
import type { CityMetrics } from './cityMetrics';

/** Score gain when local desirability is strong (sustained good coverage). */
export const HOUSING_SCORE_UP_FAST = 0.14;
export const HOUSING_SCORE_UP_SLOW = 0.045;

/** Score loss when coverage is poor (stagnation / decay). */
export const HOUSING_SCORE_DOWN_FAST = 0.11;
export const HOUSING_SCORE_DOWN_SLOW = 0.025;

/** Tier thresholds on evolution score (0–100). */
export const TIER_SCORE_HUT_MAX = 34;
export const TIER_SCORE_DOMUS_MAX = 69;
export const TIER_UPGRADE_BUFFER = 5;
export const TIER_DOWNGRADE_BUFFER = 5;

/** Desirability bands (weighted influence sum, 0–1). */
export const DESIRABILITY_HIGH = 0.62;
export const DESIRABILITY_MID = 0.42;
export const DESIRABILITY_LOW = 0.24;

export const INFLUENCE_KINDS = [
  'water',
  'entertainment',
  'bath',
  'market',
  'economy',
  'politics',
  'religion',
] as const;

export type InfluenceKind = (typeof INFLUENCE_KINDS)[number];

/** Relative weight of each factor in the desirability sum (should total ~1). */
export const INFLUENCE_WEIGHTS: Record<InfluenceKind, number> = {
  water: 0.18,
  entertainment: 0.14,
  bath: 0.12,
  market: 0.16,
  economy: 0.12,
  politics: 0.1,
  religion: 0.18,
};

export interface InfluenceEmitter {
  kind: InfluenceKind;
  radius: number;
  strength: number;
}

/**
 * Buildings that radiate Caesar-style service coverage.
 * Bath uses forum (public baths); water uses dock (harbor / cistern proxy until wells exist).
 */
export const BUILDING_INFLUENCE_EMITTERS: Partial<Record<BuildingType, InfluenceEmitter[]>> = {
  dock: [{ kind: 'water', radius: 48, strength: 1 }],
  market: [{ kind: 'market', radius: 38, strength: 1 }],
  trade_post: [{ kind: 'market', radius: 32, strength: 0.75 }],
  forum: [
    { kind: 'politics', radius: 42, strength: 1 },
    { kind: 'bath', radius: 36, strength: 0.9 },
  ],
  shrine: [{ kind: 'religion', radius: 32, strength: 0.8 }],
  temple: [
    { kind: 'religion', radius: 46, strength: 1 },
    { kind: 'entertainment', radius: 28, strength: 0.45 },
  ],
  oracle: [{ kind: 'entertainment', radius: 52, strength: 1 }],
  warehouse: [{ kind: 'economy', radius: 36, strength: 0.65 }],
  pottery_workshop: [{ kind: 'economy', radius: 28, strength: 0.55 }],
  farm_wheat: [{ kind: 'economy', radius: 30, strength: 0.4 }],
  weaponsmith: [{ kind: 'economy', radius: 26, strength: 0.35 }],
};

export interface HouseEvolutionState {
  score: number;
  tier: HousingTier;
}

export interface HousingEvolutionSimState {
  tickCounter: number;
  houses: Map<string, HouseEvolutionState>;
}

export function createHousingEvolutionState(): HousingEvolutionSimState {
  return { tickCounter: 0, houses: new Map() };
}

function buildingCenter(sx: number, sz: number, type: BuildingType): { cx: number; cz: number } {
  const fp = getFootprint(type);
  return { cx: sx + fp.w / 2, cz: sz + fp.h / 2 };
}

function influenceAtDistance(strength: number, radius: number, dist: number): number {
  if (dist >= radius) return 0;
  const t = 1 - dist / radius;
  return strength * t * t;
}

export type InfluenceEmitterPoint = {
  cx: number;
  cz: number;
  emitter: InfluenceEmitter;
};

const EMITTER_GRID_CELL = 24;
const MAX_EMITTER_RADIUS = 52;

function collectEmitters(buildings: Map<string, BuildingType>): InfluenceEmitterPoint[] {
  const out: InfluenceEmitterPoint[] = [];
  for (const [key, type] of buildings) {
    const emitters = BUILDING_INFLUENCE_EMITTERS[type];
    if (!emitters?.length) continue;
    const parsed = parseSubKey(key);
    if (!parsed) continue;
    const center = buildingCenter(parsed.sx, parsed.sz, type);
    for (const emitter of emitters) {
      out.push({ cx: center.cx, cz: center.cz, emitter });
    }
  }
  return out;
}

function buildEmitterGrid(emitters: InfluenceEmitterPoint[]): Map<string, InfluenceEmitterPoint[]> {
  const grid = new Map<string, InfluenceEmitterPoint[]>();
  for (const point of emitters) {
    const gx = Math.floor(point.cx / EMITTER_GRID_CELL);
    const gz = Math.floor(point.cz / EMITTER_GRID_CELL);
    const span = Math.ceil(point.emitter.radius / EMITTER_GRID_CELL);
    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        const key = `${gx + dx},${gz + dz}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(point);
        else grid.set(key, [point]);
      }
    }
  }
  return grid;
}

function nearbyEmitters(
  houseCx: number,
  houseCz: number,
  grid: Map<string, InfluenceEmitterPoint[]>,
): InfluenceEmitterPoint[] {
  const gx = Math.floor(houseCx / EMITTER_GRID_CELL);
  const gz = Math.floor(houseCz / EMITTER_GRID_CELL);
  const span = Math.ceil(MAX_EMITTER_RADIUS / EMITTER_GRID_CELL);
  const out: InfluenceEmitterPoint[] = [];
  const seen = new Set<InfluenceEmitterPoint>();
  for (let dz = -span; dz <= span; dz++) {
    for (let dx = -span; dx <= span; dx++) {
      const bucket = grid.get(`${gx + dx},${gz + dz}`);
      if (!bucket) continue;
      for (const point of bucket) {
        if (seen.has(point)) continue;
        seen.add(point);
        out.push(point);
      }
    }
  }
  return out;
}

function collectHouseAnchors(buildings: Map<string, BuildingType>): { key: string; cx: number; cz: number }[] {
  const houses: { key: string; cx: number; cz: number }[] = [];
  const fp = getFootprint('house');
  for (const [key, type] of buildings) {
    if (type !== 'house') continue;
    const parsed = parseSubKey(key);
    if (!parsed) continue;
    houses.push({
      key,
      cx: parsed.sx + fp.w / 2,
      cz: parsed.sz + fp.h / 2,
    });
  }
  return houses;
}

export function syncHouseEvolutionMap(
  state: HousingEvolutionSimState,
  buildings: Map<string, BuildingType>,
): void {
  const anchors = collectHouseAnchors(buildings);
  const anchorKeys = new Set(anchors.map((h) => h.key));
  for (const key of state.houses.keys()) {
    if (!anchorKeys.has(key)) state.houses.delete(key);
  }
  for (const { key } of anchors) {
    if (!state.houses.has(key)) {
      state.houses.set(key, { score: 8, tier: 0 });
    }
  }
}

export function computeLocalInfluence(
  houseCx: number,
  houseCz: number,
  emitters: InfluenceEmitterPoint[],
): Record<InfluenceKind, number> {
  const levels = Object.fromEntries(INFLUENCE_KINDS.map((k) => [k, 0])) as Record<
    InfluenceKind,
    number
  >;

  for (const { cx, cz, emitter } of emitters) {
    const dist = Math.hypot(houseCx - cx, houseCz - cz);
    const v = influenceAtDistance(emitter.strength, emitter.radius, dist);
    if (v > levels[emitter.kind]) levels[emitter.kind] = v;
  }

  return levels;
}

export function desirabilityFromInfluence(
  levels: Record<InfluenceKind, number>,
  metrics: CityMetrics,
): number {
  let sum = 0;
  for (const kind of INFLUENCE_KINDS) {
    let local = levels[kind];
    if (kind === 'religion') {
      local = Math.min(1, local * 0.65 + (metrics.religionCoverage / 100) * 0.35);
    }
    if (kind === 'politics') {
      local = Math.min(1, local * 0.7 + (metrics.politicsFavor / 100) * 0.3);
    }
    if (kind === 'economy') {
      const tradeBoost = metrics.tradeActivity / 400;
      local = Math.min(1, local + tradeBoost);
    }
    sum += local * INFLUENCE_WEIGHTS[kind];
  }
  const servedKinds = INFLUENCE_KINDS.filter((k) => levels[k] >= 0.28).length;
  sum += Math.min(0.22, servedKinds * 0.035);
  return Math.min(1, sum);
}

export function tierForScore(score: number, current: HousingTier): HousingTier {
  const upDomus = TIER_SCORE_HUT_MAX + 1 + TIER_UPGRADE_BUFFER;
  const upVilla = TIER_SCORE_DOMUS_MAX + 1 + TIER_UPGRADE_BUFFER;
  const downHut = TIER_SCORE_HUT_MAX - TIER_DOWNGRADE_BUFFER;
  const downDomus = TIER_SCORE_DOMUS_MAX - TIER_DOWNGRADE_BUFFER;

  if (current === 0) {
    if (score >= upVilla) return 2;
    if (score >= upDomus) return 1;
    return 0;
  }
  if (current === 1) {
    if (score >= upVilla) return 2;
    if (score <= downHut) return 0;
    return 1;
  }
  if (score <= downDomus) return 1;
  if (score <= downHut) return 0;
  return 2;
}

export function tickHousingEvolution(
  state: HousingEvolutionSimState,
  buildings: Map<string, BuildingType>,
  metrics: CityMetrics,
): { key: string; score: number; tier: HousingTier }[] {
  syncHouseEvolutionMap(state, buildings);
  const emitters = collectEmitters(buildings);
  const emitterGrid = buildEmitterGrid(emitters);
  const happinessScale = 0.55 + metrics.happiness / 200;
  const changed: { key: string; score: number; tier: HousingTier }[] = [];

  for (const [key, house] of state.houses) {
    const parsed = parseSubKey(key);
    if (!parsed) continue;
    const fp = getFootprint('house');
    const cx = parsed.sx + fp.w / 2;
    const cz = parsed.sz + fp.h / 2;

    const levels = computeLocalInfluence(cx, cz, nearbyEmitters(cx, cz, emitterGrid));
    const desirability = desirabilityFromInfluence(levels, metrics);

    let delta = 0;
    if (desirability >= DESIRABILITY_HIGH) delta = HOUSING_SCORE_UP_FAST;
    else if (desirability >= DESIRABILITY_MID) delta = HOUSING_SCORE_UP_SLOW;
    else if (desirability < DESIRABILITY_LOW) delta = -HOUSING_SCORE_DOWN_FAST;
    else delta = -HOUSING_SCORE_DOWN_SLOW;

    const prevTier = house.tier;
    const prevScore = house.score;
    house.score = Math.max(0, Math.min(100, house.score + delta * happinessScale));
    house.tier = tierForScore(house.score, house.tier);

    if (house.tier !== prevTier || Math.abs(house.score - prevScore) >= 0.5) {
      changed.push({ key, score: house.score, tier: house.tier });
    }
  }

  return changed;
}

export function housingStateFromSnapshots(
  rows: { key: string; score: number; tier: HousingTier }[],
): HousingEvolutionSimState {
  const state = createHousingEvolutionState();
  for (const row of rows) {
    state.houses.set(row.key, { score: row.score, tier: row.tier });
  }
  return state;
}
