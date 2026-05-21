import { describe, expect, it } from 'vitest';
import {
  computeLocalInfluence,
  desirabilityFromInfluence,
  tierForScore,
  tickHousingEvolution,
  createHousingEvolutionState,
  syncHouseEvolutionMap,
} from './housingEvolution';
import { buildCityMetrics } from './cityMetrics';
import { createDefaultSocietySnapshot } from '../society';
import { subKey } from '../chunkCoords';

describe('housingEvolution', () => {
  it('upgrades tier when score crosses thresholds with hysteresis', () => {
    expect(tierForScore(20, 0)).toBe(0);
    expect(tierForScore(45, 0)).toBe(1);
    expect(tierForScore(80, 1)).toBe(2);
    expect(tierForScore(25, 1)).toBe(0);
    expect(tierForScore(55, 2)).toBe(1);
  });

  it('raises evolution score when services are nearby', () => {
    const society = createDefaultSocietySnapshot();
    society.religion.coveragePercent = 80;
    const metrics = buildCityMetrics(society);
    const buildings = new Map<string, import('../types').BuildingType>([
      [subKey(0, 0), 'house'],
      [subKey(10, 0), 'market'],
      [subKey(0, 10), 'temple'],
      [subKey(10, 10), 'forum'],
      [subKey(10, 20), 'oracle'],
      [subKey(0, 20), 'dock'],
      [subKey(20, 0), 'shrine'],
    ]);
    const state = createHousingEvolutionState();
    syncHouseEvolutionMap(state, buildings);
    const before = state.houses.get(subKey(0, 0))!.score;
    for (let i = 0; i < 120; i++) {
      tickHousingEvolution(state, buildings, metrics);
    }
    const after = state.houses.get(subKey(0, 0))!.score;
    expect(after).toBeGreaterThan(before);
  });

  it('computes non-zero religion influence near a shrine', () => {
    const levels = computeLocalInfluence(10, 10, [
      { cx: 15, cz: 15, emitter: { kind: 'religion', radius: 30, strength: 1 } },
    ]);
    expect(levels.religion).toBeGreaterThan(0);
    const metrics = buildCityMetrics(createDefaultSocietySnapshot());
    expect(desirabilityFromInfluence(levels, metrics)).toBeGreaterThan(0);
  });
});
