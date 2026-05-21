import { describe, expect, it } from 'vitest';
import { createDefaultSocietySnapshot } from '../../society';
import { createEmptyInventory } from '../../inventory';
import type { BuildingType } from '../../types';
import { computeNeedFulfillment, averageNeedFulfillment } from './needs';
import { runUnrestTick } from './unrest';
import { runConflictTick } from './conflict';
import { runSocialTick } from './tick';

describe('social simulation', () => {
  it('raises average needs when farms and housing are present', () => {
    const society = createDefaultSocietySnapshot();
    society.population = 40;
    const buildings: BuildingType[] = ['house', 'house', 'house', 'farm_wheat', 'forum'];
    const inventory = createEmptyInventory();
    inventory.wheat = 80;
    inventory.weapons = 20;

    const needs = computeNeedFulfillment(society, buildings, inventory);
    expect(averageNeedFulfillment(needs)).toBeGreaterThan(40);
    expect(needs.food).toBeGreaterThan(needs.shelter > 0 ? 0 : -1);
  });

  it('accumulates unrest when needs are poor', () => {
    const society = createDefaultSocietySnapshot();
    society.social.needs = { food: 10, shelter: 10, safety: 10, goods: 10, culture: 10 };
    society.tax.rateLevel = 'high';

    runUnrestTick(society.social.unrest, society, society.social.needs);
    expect(society.social.unrest.level).toBeGreaterThan(8);
  });

  it('emits revolution warning when risk is extreme', () => {
    const society = createDefaultSocietySnapshot();
    society.social.unrest = { level: 90, pressure: 85 };
    society.social.legitimacy = { ruler: 15, institutions: 20 };
    society.happiness = 20;

    const events = runConflictTick(society.social.conflict, society, 1200);
    expect(events.some((e) => e.kind === 'revolution_warning')).toBe(true);
  });

  it('runs full social tick without throwing', () => {
    const society = createDefaultSocietySnapshot();
    society.population = 24;
    const buildings = new Map<string, BuildingType>([['0,0', 'house']]);
    const inventory = createEmptyInventory();

    const { events } = runSocialTick(society, buildings.values(), inventory, 1);
    expect(society.social.needs.food).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(events)).toBe(true);
  });
});
