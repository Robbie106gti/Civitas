import { parseSubKey } from '../chunkCoords';
import { civicTierForScore, isCivicEvolutionType } from '../buildingBakeKeys';
import { getFootprint } from '../footprints';
import type { BuildingType } from '../types';
import type { CityMetrics } from './cityMetrics';
import type { BuildingUpkeepRecord } from '../upkeepState';

export const CIVIC_EVOLUTION_SCORE_UP = 0.09;
export const CIVIC_EVOLUTION_SCORE_DOWN = 0.04;

export function tickCivicEvolution(
  buildings: Map<string, BuildingType>,
  upkeep: Map<string, BuildingUpkeepRecord>,
  metrics: CityMetrics,
): { key: string; evolutionScore: number; tierChanged: boolean }[] {
  const changed: { key: string; evolutionScore: number; tierChanged: boolean }[] = [];
  const happinessScale = 0.5 + metrics.happiness / 200;

  for (const [key, type] of buildings) {
    if (!isCivicEvolutionType(type)) continue;
    const parsed = parseSubKey(key);
    if (!parsed) continue;

    let rec = upkeep.get(key);
    if (!rec) continue;

    const prevTier = civicTierForScore(rec.evolutionScore);
    const conditionFactor = rec.condition / 100;
    let delta = CIVIC_EVOLUTION_SCORE_DOWN;
    if (conditionFactor >= 0.7 && metrics.happiness >= 50) {
      delta = CIVIC_EVOLUTION_SCORE_UP;
    } else if (conditionFactor >= 0.45) {
      delta = CIVIC_EVOLUTION_SCORE_UP * 0.35;
    }

    if (type === 'market' || type === 'warehouse') {
      delta += metrics.tradeActivity / 1600;
    }
    if (type === 'temple' || type === 'shrine') {
      delta += metrics.religionCoverage > 50 ? 0.04 : -0.02;
    }

    rec.evolutionScore = Math.max(0, Math.min(100, rec.evolutionScore + delta * happinessScale));
    const nextTier = civicTierForScore(rec.evolutionScore);
    if (nextTier !== prevTier) {
      changed.push({ key, evolutionScore: rec.evolutionScore, tierChanged: true });
    } else if (Math.abs(delta) > 0.02) {
      changed.push({ key, evolutionScore: rec.evolutionScore, tierChanged: false });
    }
  }

  return changed;
}

export function collectUpkeepAnchors(
  buildings: Map<string, BuildingType>,
): { key: string; type: BuildingType; cx: number; cz: number }[] {
  const out: { key: string; type: BuildingType; cx: number; cz: number }[] = [];
  for (const [key, type] of buildings) {
    const parsed = parseSubKey(key);
    if (!parsed) continue;
    const fp = getFootprint(type);
    out.push({
      key,
      type,
      cx: parsed.sx + fp.w / 2,
      cz: parsed.sz + fp.h / 2,
    });
  }
  return out;
}
