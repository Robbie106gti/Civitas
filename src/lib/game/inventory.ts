import { RESOURCE_TYPES, type CityInventory, type ResourceType } from './types';

export function createEmptyInventory(): CityInventory {
  const inv = {} as CityInventory;
  for (const r of RESOURCE_TYPES) {
    inv[r] = 0;
  }
  return inv;
}

export function addToInventory(inv: CityInventory, resource: ResourceType, amount: number): void {
  inv[resource] = (inv[resource] ?? 0) + amount;
}

export function canAfford(
  inv: CityInventory,
  cost: Partial<Record<ResourceType, number>>,
): boolean {
  for (const [key, need] of Object.entries(cost)) {
    const r = key as ResourceType;
    if ((inv[r] ?? 0) < (need ?? 0)) return false;
  }
  return true;
}

export function deductCost(inv: CityInventory, cost: Partial<Record<ResourceType, number>>): void {
  for (const [key, need] of Object.entries(cost)) {
    const r = key as ResourceType;
    if (need) inv[r] = (inv[r] ?? 0) - need;
  }
}

/** Non-zero inventory entries for UI. */
export function inventoryEntries(inv: CityInventory): { resource: ResourceType; amount: number }[] {
  return RESOURCE_TYPES.filter((r) => (inv[r] ?? 0) > 0).map((resource) => ({
    resource,
    amount: inv[resource] ?? 0,
  }));
}
