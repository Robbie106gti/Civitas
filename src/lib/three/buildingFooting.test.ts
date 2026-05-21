import { describe, expect, it } from 'vitest';
import { minYInBakedParts } from '../game/buildingMeshBake';
import { buildBakedPartsForBakeKey } from './buildingBakePipeline';

const FOOTING_EPS = 1e-3;

describe('building footing', () => {
  it.each(['house-hut', 'forum-0', 'warehouse-0'] as const)(
    'rebases %s baked parts so Box3 min.y is 0',
    (bakeKey) => {
      const parts = buildBakedPartsForBakeKey(bakeKey);
      expect(parts.length).toBeGreaterThan(0);
      expect(minYInBakedParts(parts)).toBeLessThanOrEqual(FOOTING_EPS);
    },
  );
});
