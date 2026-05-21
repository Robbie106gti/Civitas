import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SUB_CELLS_PER_TILE, SUB_CELL_WORLD_SIZE } from '../game/constants';
import { encodeBakedBuildingMesh, decodeBakedBuildingMesh } from '../game/buildingMeshBake';
import { RESIDENTIAL_VARIANTS } from '../game/residentialBlueprints';
import { buildResidentialBakedParts, countTrianglesInParts } from './residentialMeshBuilder';

const TILE_WORLD = SUB_CELLS_PER_TILE * SUB_CELL_WORLD_SIZE;

function maxYInParts(parts: ReturnType<typeof buildResidentialBakedParts>): number {
  let maxY = 0;
  for (const part of parts) {
    for (let i = 1; i < part.positions.length; i += 3) {
      maxY = Math.max(maxY, part.positions[i]!);
    }
  }
  return maxY;
}

describe('residentialMeshBuilder', () => {
  it('keeps housing meshes under per-tier triangle budget', () => {
    const budgets: Record<(typeof RESIDENTIAL_VARIANTS)[number], number> = {
      hut: 800,
      domus: 800,
      villa: 800,
    };
    for (const variant of RESIDENTIAL_VARIANTS) {
      const parts = buildResidentialBakedParts(variant);
      const tris = countTrianglesInParts(parts);
      expect(parts.length).toBeGreaterThan(0);
      expect(tris).toBeLessThanOrEqual(budgets[variant]);
    }
  });

  it('emits triangle soup (multiple of 9 floats per part)', () => {
    for (const variant of RESIDENTIAL_VARIANTS) {
      const parts = buildResidentialBakedParts(variant);
      for (const part of parts) {
        expect(part.positions.length % 9).toBe(0);
        expect(part.positions.length).toBeGreaterThanOrEqual(36);
      }
    }
  });

  it('round-trips baked housing without losing vertices', () => {
    const parts = buildResidentialBakedParts('hut');
    const bytes = encodeBakedBuildingMesh({ bakeKey: 'house-hut', parts });
    const decoded = decodeBakedBuildingMesh(bytes, 'house-hut');
    expect(decoded?.parts.length).toBe(parts.length);
    for (let i = 0; i < parts.length; i++) {
      expect(decoded?.parts[i]?.positions.length).toBe(parts[i]!.positions.length);
    }
  });

  it('forms solid boxes (raycast hits from outside)', () => {
    for (const variant of RESIDENTIAL_VARIANTS) {
      const parts = buildResidentialBakedParts(variant);
      const group = new THREE.Group();
      for (const part of parts) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
        geom.computeVertexNormals();
        group.add(new THREE.Mesh(geom));
      }
      const ray = new THREE.Raycaster();
      ray.set(new THREE.Vector3(4 * SUB_CELL_WORLD_SIZE, 0.5, -2), new THREE.Vector3(0, 0, 1));
      const hits = ray.intersectObject(group, true);
      expect(hits.length).toBeGreaterThan(0);
    }
  });

  it('uses multiple materials per tier for Roman read', () => {
    const hutMats = new Set(buildResidentialBakedParts('hut').map((p) => p.materialKey));
    expect(hutMats.has('stucco_cream')).toBe(true);
    expect(hutMats.has('roof_tile_dark')).toBe(true);
    expect(hutMats.has('wood')).toBe(true);
    const domusMats = new Set(buildResidentialBakedParts('domus').map((p) => p.materialKey));
    expect(domusMats.has('dirt')).toBe(true);
    expect(domusMats.has('stucco_ochre')).toBe(true);
    const villaMats = new Set(buildResidentialBakedParts('villa').map((p) => p.materialKey));
    expect(villaMats.has('marble_white')).toBe(true);
    expect(villaMats.has('bronze')).toBe(true);
  });

  it('stacks housing to roughly one tile height or more', () => {
    const hutY = maxYInParts(buildResidentialBakedParts('hut'));
    const domusY = maxYInParts(buildResidentialBakedParts('domus'));
    const villaY = maxYInParts(buildResidentialBakedParts('villa'));

    expect(hutY).toBeGreaterThanOrEqual(TILE_WORLD * 0.92);
    expect(hutY).toBeLessThanOrEqual(TILE_WORLD * 1.15);
    expect(domusY).toBeGreaterThan(hutY);
    expect(domusY).toBeGreaterThanOrEqual(TILE_WORLD * 1.05);
    expect(villaY).toBeGreaterThan(domusY);
    expect(villaY).toBeGreaterThanOrEqual(TILE_WORLD * 1.25);
  });
});
