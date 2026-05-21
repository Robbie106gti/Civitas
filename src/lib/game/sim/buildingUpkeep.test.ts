import { describe, expect, it } from 'vitest';
import { subKey } from '../chunkCoords';
import { createEmptyInventory } from '../inventory';
import { addToInventory } from '../inventory';
import {
  createBuildingUpkeepState,
  tickBuildingUpkeep,
  applyEngineerMaintenance,
} from './buildingUpkeep';
import { materialCostForType } from '../buildingUpkeepConfig';
import { UPKEEP_TICK_INTERVAL } from '../buildingUpkeepConfig';

describe('buildingUpkeep', () => {
  it('reduces condition over upkeep ticks', () => {
    const anchors = new Map([[subKey(0, 0), 'forum' as const]]);
    const state = createBuildingUpkeepState();
    state.buildings.set(subKey(0, 0), {
      condition: 90,
      entropy: 5,
      lastMaintainedTick: 0,
      evolutionScore: 10,
      materialStarved: false,
    });
    const inventory = createEmptyInventory();
    let condition = 90;
    for (let i = 0; i < UPKEEP_TICK_INTERVAL * 3; i++) {
      const { updates } = tickBuildingUpkeep(state, anchors, inventory, new Map(), i);
      const row = updates.find((u) => u.key === subKey(0, 0));
      if (row) condition = row.condition;
    }
    expect(condition).toBeLessThan(90);
  });

  it('deducts materials on engineer maintenance when affordable', () => {
    const key = subKey(5, 5);
    const state = createBuildingUpkeepState();
    state.buildings.set(key, {
      condition: 40,
      entropy: 30,
      lastMaintainedTick: 0,
      evolutionScore: 20,
      materialStarved: false,
    });
    const inventory = createEmptyInventory();
    const cost = materialCostForType('house');
    for (const [res, amt] of Object.entries(cost)) {
      if (amt) addToInventory(inventory, res as import('../types').ResourceType, amt * 2);
    }
    const before = inventory.wood ?? 0;
    const ok = applyEngineerMaintenance(state, key, 'house', inventory, 20, 100);
    expect(ok).toBe(true);
    expect(inventory.wood ?? 0).toBeLessThan(before);
    expect(state.buildings.get(key)!.condition).toBeGreaterThan(40);
  });
});
