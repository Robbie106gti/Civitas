import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { allBuildingBakeKeys } from '../game/buildingBakeKeys';
import { CIVIC_EVOLUTION_TYPES } from '../game/buildingBakeKeys';
import { encodeBakedBuildingMesh, decodeBakedBuildingMesh } from '../game/buildingMeshBake';
import { SUB_CELL_WORLD_SIZE } from '../game/constants';
import { buildBakedPartsForBakeKey } from './buildingBakePipeline';
import { buildMacroBakedParts } from './buildingMacroMeshes';
import { countTrianglesInParts } from './macroMeshCommon';
import { buildResidentialBakedParts, countTrianglesInParts as housingTris } from './residentialMeshBuilder';

const TRI_BUDGET = 800;
const FORUM_TRI_BUDGET = 1400;

const STATIC_MACRO_KEYS = [
  'pottery_workshop',
  'weaponsmith',
  'farm_wheat',
  'trade_post',
  'oracle',
  'dock',
  'lumber_camp',
  'tree',
  'dirt_path',
  'road',
  'highway',
] as const;

const CATEGORY_RAY_KEYS = [
  'forum-0',
  'shrine-0',
  'pottery_workshop',
  'dock',
] as const;

describe('buildingMacroMeshes', () => {
  it('covers every non-housing bake key with macro geometry', () => {
    for (const key of allBuildingBakeKeys()) {
      if (key.startsWith('house-')) continue;
      const parts = buildMacroBakedParts(key);
      expect(parts, key).not.toBeNull();
      expect(parts!.length).toBeGreaterThan(0);
    }
  });

  it('keeps civic and static meshes near triangle budget', () => {
    for (const type of CIVIC_EVOLUTION_TYPES) {
      for (const tier of [0, 1, 2] as const) {
        const key = `${type}-${tier}` as const;
        const tris = countTrianglesInParts(buildMacroBakedParts(key)!);
        const budget = type === 'forum' ? FORUM_TRI_BUDGET : TRI_BUDGET;
        expect(tris, key).toBeLessThanOrEqual(budget);
      }
    }
    for (const key of STATIC_MACRO_KEYS) {
      const tris = countTrianglesInParts(buildMacroBakedParts(key)!);
      expect(tris, key).toBeLessThanOrEqual(TRI_BUDGET);
    }
  });

  it('round-trips baked macro meshes', () => {
    const parts = buildMacroBakedParts('market-1')!;
    const bytes = encodeBakedBuildingMesh({ bakeKey: 'market-1', parts });
    const decoded = decodeBakedBuildingMesh(bytes, 'market-1');
    expect(decoded?.parts.length).toBe(parts.length);
    expect(decoded?.parts[0]?.positions.length).toBe(parts[0]!.positions.length);
  });

  it('uses multiple Roman palette materials per category', () => {
    const civicMats = new Set(buildMacroBakedParts('temple-1')!.map((p) => p.materialKey));
    expect(civicMats.has('marble_white')).toBe(true);
    expect(civicMats.has('bronze')).toBe(true);

    const forumMats = new Set(buildMacroBakedParts('forum-0')!.map((p) => p.materialKey));
    expect(forumMats.has('pool_water')).toBe(true);

    const industrialMats = new Set(buildMacroBakedParts('weaponsmith')!.map((p) => p.materialKey));
    expect(industrialMats.has('ember_glow')).toBe(true);

    const farmMats = new Set(buildMacroBakedParts('farm_wheat')!.map((p) => p.materialKey));
    expect(farmMats.has('crop_green')).toBe(true);
  });

  it('reports triangle counts for key civic and housing meshes', () => {
    expect(countTrianglesInParts(buildMacroBakedParts('forum-1')!)).toBeGreaterThan(0);
    expect(countTrianglesInParts(buildMacroBakedParts('temple-2')!)).toBeGreaterThan(0);
    expect(countTrianglesInParts(buildMacroBakedParts('market-0')!)).toBeGreaterThan(0);
    expect(housingTris(buildResidentialBakedParts('villa'))).toBeGreaterThan(0);
  });

  it('raycasts solid macro silhouettes per category', () => {
    for (const key of CATEGORY_RAY_KEYS) {
      const parts = buildMacroBakedParts(key)!;
      const group = new THREE.Group();
      for (const part of parts) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
        geom.computeVertexNormals();
        geom.computeBoundingSphere();
        group.add(new THREE.Mesh(geom));
      }
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const part of parts) {
        const pos = part.positions;
        for (let i = 0; i < pos.length; i += 3) {
          minX = Math.min(minX, pos[i]!);
          maxX = Math.max(maxX, pos[i]!);
          minY = Math.min(minY, pos[i + 1]!);
          maxY = Math.max(maxY, pos[i + 1]!);
          minZ = Math.min(minZ, pos[i + 2]!);
          maxZ = Math.max(maxZ, pos[i + 2]!);
        }
      }
      const ray = new THREE.Raycaster();
      const probes: [number, number, number][] = [
        [minX + (maxX - minX) * 0.12, (minY + maxY) / 2, minZ - 1],
        [(minX + maxX) / 2, minY + (maxY - minY) * 0.15, minZ - 1],
        [minX + 0.25, maxY - 0.2, (minZ + maxZ) / 2],
      ];
      let hits = 0;
      for (const [x, y, z] of probes) {
        ray.set(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, 1));
        hits += ray.intersectObject(group, true).length;
      }
      expect(hits, key).toBeGreaterThan(0);
    }
  });

  it('does not change housing bake output', () => {
    const before = housingTris(buildResidentialBakedParts('domus'));
    const pipeline = countTrianglesInParts(buildBakedPartsForBakeKey('house-domus'));
    expect(pipeline).toBe(before);
  });
});
