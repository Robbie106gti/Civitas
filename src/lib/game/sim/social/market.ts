import { RESOURCE_TYPES, type CityInventory, type MarketPressureState, type ResourceType } from '../../types';

const CONSUMPTION_WEIGHTS: Partial<Record<ResourceType, number>> = {
  wheat: 1.2,
  wine: 0.4,
  pottery: 0.5,
  wood: 0.3,
  weapons: 0.15,
};

const BASE_MODIFIER = 1;

export function runMarketTick(
  market: MarketPressureState,
  inventory: CityInventory,
  population: number,
): void {
  const pop = Math.max(1, population);
  let totalScarcity = 0;
  let tracked = 0;
  const modifiers: Partial<Record<ResourceType, number>> = {};

  for (const resource of RESOURCE_TYPES) {
    const weight = CONSUMPTION_WEIGHTS[resource];
    if (!weight) continue;
    const stock = inventory[resource] ?? 0;
    const desired = pop * weight * 0.05;
    const ratio = desired <= 0 ? 1 : stock / desired;
    const modifier = Math.max(0.65, Math.min(1.85, BASE_MODIFIER + (1 - Math.min(2, ratio)) * 0.35));
    modifiers[resource] = Math.round(modifier * 100) / 100;
    totalScarcity += 1 - Math.min(1, ratio);
    tracked += 1;
  }

  market.priceModifiers = modifiers;
  market.demandIndex = tracked > 0 ? Math.round((totalScarcity / tracked) * 100) : 0;
}

export function marketPriceMultiplier(
  market: MarketPressureState,
  resource: ResourceType,
): number {
  return market.priceModifiers[resource] ?? BASE_MODIFIER;
}
