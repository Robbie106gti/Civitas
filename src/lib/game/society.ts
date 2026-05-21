import {
  crimeHappinessPenalty,
  unrestHappinessPenalty,
} from './sim/social/tick';
import { createDefaultFactions } from './sim/social/factions';
import type {
  ConflictState,
  CrimeState,
  DeityId,
  LegitimacyState,
  MarketPressureState,
  NeedFulfillment,
  PoliticsState,
  ReligionState,
  SocialState,
  SocietySnapshot,
  TaxRateLevel,
  TaxState,
  TradeState,
  UnrestState,
} from './types';

export const POP_PER_HOUSE = 8;

export const BASE_HAPPINESS = 70;

export function createDefaultReligionState(): ReligionState {
  return {
    coveragePercent: 0,
    favor: { jupiter: 50, mars: 50, ceres: 50 },
    unrestModifier: 0,
  };
}

export function createDefaultTaxState(): TaxState {
  return {
    rateLevel: 'low',
    treasury: 500,
  };
}

export function createDefaultPoliticsState(): PoliticsState {
  return {
    favorRating: 50,
    emperorMood: 'neutral',
    activeRequest: null,
    tickCounter: 0,
  };
}

export function createDefaultTradeState(): TradeState {
  return {
    lifetimeImports: 0,
    lifetimeExports: 0,
  };
}

export function createDefaultNeedFulfillment(): NeedFulfillment {
  return { food: 50, shelter: 50, safety: 50, goods: 40, culture: 50 };
}

export function createDefaultUnrestState(): UnrestState {
  return { level: 8, pressure: 5 };
}

export function createDefaultCrimeState(): CrimeState {
  return { rate: 12 };
}

export function createDefaultLegitimacyState(): LegitimacyState {
  return { ruler: 55, institutions: 50 };
}

export function createDefaultMarketState(): MarketPressureState {
  return { demandIndex: 20, priceModifiers: {} };
}

export function createDefaultConflictState(): ConflictState {
  return {
    revolutionRisk: 0,
    warReadiness: 0,
    crisis: { kind: null, severity: 0, ticksRemaining: 0 },
  };
}

export function createDefaultSocialState(): SocialState {
  return {
    needs: createDefaultNeedFulfillment(),
    unrest: createDefaultUnrestState(),
    crime: createDefaultCrimeState(),
    factions: createDefaultFactions(),
    legitimacy: createDefaultLegitimacyState(),
    market: createDefaultMarketState(),
    conflict: createDefaultConflictState(),
  };
}

/** Backfill social layer for saves created before the social sim. */
export function ensureSocialState(society: SocietySnapshot): void {
  if (!society.social) {
    society.social = createDefaultSocialState();
  }
}

export function createDefaultSocietySnapshot(): SocietySnapshot {
  return {
    religion: createDefaultReligionState(),
    tax: createDefaultTaxState(),
    politics: createDefaultPoliticsState(),
    trade: createDefaultTradeState(),
    social: createDefaultSocialState(),
    happiness: BASE_HAPPINESS,
    population: 0,
  };
}

export function countPopulation(houseCount: number): number {
  return houseCount * POP_PER_HOUSE;
}

export function computeHappiness(
  religion: ReligionState,
  taxRate: TaxRateLevel,
  politics: PoliticsState,
  social?: SocialState,
): number {
  const avgFavor = (religion.favor.jupiter + religion.favor.mars + religion.favor.ceres) / 3;
  const religionBonus = Math.min(12, religion.coveragePercent * 0.12 + avgFavor * 0.05);
  const taxPenalty = taxRate === 'none' ? 0 : taxRate === 'low' ? 2 : taxRate === 'medium' ? 8 : 18;
  const politicsMod =
    politics.emperorMood === 'pleased' ? 5 : politics.emperorMood === 'displeased' ? -10 : 0;
  const religionUnrest = religion.unrestModifier + (taxRate === 'high' ? 4 : 0);
  const socialPenalty = social
    ? unrestHappinessPenalty(social.unrest) + crimeHappinessPenalty(social.crime)
    : 0;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        BASE_HAPPINESS + religionBonus - taxPenalty + politicsMod - religionUnrest - socialPenalty,
      ),
    ),
  );
}

export function averageDeityFavor(favor: Record<DeityId, number>): number {
  return Math.round((favor.jupiter + favor.mars + favor.ceres) / 3);
}
