import type { TaxRateLevel, TaxState } from '../types';

/** Denarii per citizen per sim tick (12 Hz). */
export const TAX_INCOME_PER_POP: Record<TaxRateLevel, number> = {
  none: 0,
  low: 0.04,
  medium: 0.1,
  high: 0.22,
};

/** Happiness penalty from tax burden. */
export const TAX_HAPPINESS_PENALTY: Record<TaxRateLevel, number> = {
  none: 0,
  low: 2,
  medium: 8,
  high: 18,
};

/** Unrest risk contribution from high taxes. */
export const TAX_UNREST_RISK: Record<TaxRateLevel, number> = {
  none: 0,
  low: 0,
  medium: 1,
  high: 4,
};

export function runTaxTick(state: TaxState, population: number): number {
  const income = Math.floor(population * TAX_INCOME_PER_POP[state.rateLevel]);
  state.treasury += income;
  return income;
}

export function taxHappinessPenalty(rate: TaxRateLevel): number {
  return TAX_HAPPINESS_PENALTY[rate];
}

export function taxUnrestRisk(rate: TaxRateLevel): number {
  return TAX_UNREST_RISK[rate];
}
