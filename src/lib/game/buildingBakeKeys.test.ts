import { describe, expect, it } from 'vitest';
import { resolveBuildingBakeKey } from './buildingBakeKeys';
import { blueprintForBakeKey } from './buildingMeshBake';
import { encodeBakedBuildingMesh, decodeBakedBuildingMesh } from './buildingMeshBake';

describe('buildingBakeKeys', () => {
  it('resolves house variant bake keys', () => {
    expect(
      resolveBuildingBakeKey({ type: 'house', lod: 'full', residentialVariant: 'villa' }),
    ).toBe('house-villa');
    expect(resolveBuildingBakeKey({ type: 'house', lod: 'simple' })).toBeNull();
  });

  it('resolves civic tier bake keys', () => {
    expect(
      resolveBuildingBakeKey({ type: 'forum', lod: 'full', civicTier: 2 }),
    ).toBe('forum-2');
  });

  it('round-trips baked mesh binary', () => {
    const blueprint = blueprintForBakeKey('road');
    expect(blueprint.layers.length).toBeGreaterThan(0);
    const bytes = encodeBakedBuildingMesh({
      bakeKey: 'road',
      parts: [{ materialKey: 'road_stone', positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) }],
    });
    const decoded = decodeBakedBuildingMesh(bytes, 'road');
    expect(decoded?.parts[0]?.materialKey).toBe('road_stone');
    expect(decoded?.parts[0]?.positions.length).toBe(9);
  });
});
