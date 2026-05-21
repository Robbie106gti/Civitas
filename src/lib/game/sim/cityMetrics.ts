import { combinedLegitimacy } from './social/legitimacy';
import { taxUnrestRisk } from './taxes';
import type { SocietySnapshot } from '../types';

/** Compact city mood snapshot (0–100) for fast-tick subsystems. */
export interface CityMetrics {
  happiness: number;
  legitimacy: number;
  unrest: number;
  taxPressure: number;
  housingDemand: number;
  waterSupply: number;
  religionMood: number;
  religionCoverage: number;
  politicsFavor: number;
  tradeActivity: number;
}

export function createDefaultCityMetrics(): CityMetrics {
  return {
    happiness: 70,
    legitimacy: 52,
    unrest: 8,
    taxPressure: 15,
    housingDemand: 50,
    waterSupply: 50,
    religionMood: 50,
    religionCoverage: 0,
    politicsFavor: 50,
    tradeActivity: 0,
  };
}

function taxPressureFromRate(rate: SocietySnapshot['tax']['rateLevel']): number {
  switch (rate) {
    case 'none':
      return 0;
    case 'low':
      return 25;
    case 'medium':
      return 55;
    case 'high':
      return 90;
  }
}

function religionMoodFromState(society: SocietySnapshot): number {
  const favors = Object.values(society.religion.favor);
  const avgFavor =
    favors.length > 0 ? favors.reduce((a, b) => a + b, 0) / favors.length : 50;
  return Math.round(
    Math.min(100, society.religion.coveragePercent * 0.55 + avgFavor * 0.45),
  );
}

function tradeActivityFromState(society: SocietySnapshot): number {
  const volume = society.trade.lifetimeImports + society.trade.lifetimeExports;
  return Math.min(100, Math.round(volume * 0.35));
}

/** Derive integer metrics from authoritative society after a slow tick. */
export function buildCityMetrics(society: SocietySnapshot): CityMetrics {
  const needs = society.social.needs;
  return {
    happiness: Math.round(society.happiness),
    legitimacy: combinedLegitimacy(society.social.legitimacy),
    unrest: Math.round(society.social.unrest.level),
    taxPressure: Math.min(
      100,
      taxPressureFromRate(society.tax.rateLevel) + taxUnrestRisk(society.tax.rateLevel) * 8,
    ),
    housingDemand: Math.round(Math.max(0, Math.min(100, 100 - needs.shelter))),
    waterSupply: Math.round(Math.min(100, needs.goods * 0.45 + needs.safety * 0.55)),
    religionMood: religionMoodFromState(society),
    religionCoverage: Math.round(society.religion.coveragePercent),
    politicsFavor: Math.round(society.politics.favorRating),
    tradeActivity: tradeActivityFromState(society),
  };
}
