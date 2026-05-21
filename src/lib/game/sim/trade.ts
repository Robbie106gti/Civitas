import { addToInventory, canAfford, deductCost } from '../inventory';
import type { CityInventory, ResourceType } from '../types';

/** Fixed denarii prices per unit (Caesar-inspired ballpark). */
export const TRADE_PRICES: Record<ResourceType, { buy: number; sell: number }> = {
  clay: { buy: 4, sell: 2 },
  rock: { buy: 6, sell: 3 },
  sand: { buy: 3, sell: 1 },
  wood: { buy: 5, sell: 2 },
  iron: { buy: 14, sell: 7 },
  gold: { buy: 40, sell: 22 },
  wheat: { buy: 4, sell: 2 },
  pottery: { buy: 10, sell: 5 },
  weapons: { buy: 24, sell: 12 },
  olive_oil: { buy: 12, sell: 6 },
  wine: { buy: 14, sell: 7 },
};

export type TradeAction = 'buy' | 'sell';

export interface TradeResult {
  ok: boolean;
  reason?: string;
  denariiDelta?: number;
}

export function executeTrade(
  inventory: CityInventory,
  treasury: number,
  resource: ResourceType,
  quantity: number,
  action: TradeAction,
  priceMultiplier = 1,
): TradeResult {
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { ok: false, reason: 'Invalid quantity' };
  }

  const prices = TRADE_PRICES[resource];
  const buyUnit = Math.max(1, Math.ceil(prices.buy * priceMultiplier));
  const sellUnit = Math.max(1, Math.floor(prices.sell * priceMultiplier));

  if (action === 'buy') {
    const cost = buyUnit * quantity;
    if (treasury < cost) {
      return { ok: false, reason: 'Not enough denarii' };
    }
    addToInventory(inventory, resource, quantity);
    return { ok: true, denariiDelta: -cost };
  }

  const need = { [resource]: quantity } as Partial<Record<ResourceType, number>>;
  if (!canAfford(inventory, need)) {
    return { ok: false, reason: 'Not enough goods to sell' };
  }
  deductCost(inventory, need);
  const gain = sellUnit * quantity;
  return { ok: true, denariiDelta: gain };
}
