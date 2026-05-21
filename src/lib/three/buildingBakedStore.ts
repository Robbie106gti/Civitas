import * as THREE from 'three';
import {
  allBuildingBakeKeys,
  bakedBuildingUrl,
  type BuildingBakeKey,
} from '../game/buildingBakeKeys';
import { BUILDING_PALETTE, type MaterialKey } from '../game/buildingPalette';
import { decodeBakedBuildingMesh, rebaseBakedPartsToGround } from '../game/buildingMeshBake';
import { buildBakedPartsForBakeKey } from './buildingBakePipeline';
import { LruMap } from '../util/lruMap';

/** Max procedural / fetched bake templates kept in memory (long sessions). */
export const MAX_BAKE_TEMPLATE_CACHE = 32;

const templateCache = new LruMap<BuildingBakeKey, THREE.Object3D>(
  MAX_BAKE_TEMPLATE_CACHE,
  (_key, group) => {
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  },
);
const loadPromises = new Map<BuildingBakeKey, Promise<THREE.Object3D | null>>();

const materialCache = new Map<MaterialKey, THREE.MeshStandardMaterial>();

function materialForKey(key: MaterialKey): THREE.MeshStandardMaterial {
  let mat = materialCache.get(key);
  if (!mat) {
    const def = BUILDING_PALETTE[key];
    mat = new THREE.MeshStandardMaterial({
      color: def.color,
      roughness: def.roughness ?? 0.85,
      metalness: def.metalness ?? 0,
    });
    materialCache.set(key, mat);
  }
  return mat;
}

function groupFromParts(
  bakeKey: BuildingBakeKey,
  parts: { materialKey: MaterialKey; positions: Float32Array }[],
): THREE.Object3D {
  parts = rebaseBakedPartsToGround(parts);
  const group = new THREE.Group();
  for (const part of parts) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
    geom.computeVertexNormals();
    const mesh = new THREE.Mesh(geom, materialForKey(part.materialKey));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  templateCache.set(bakeKey, group);
  return group;
}

function proceduralFallback(bakeKey: BuildingBakeKey): THREE.Object3D {
  const parts = buildBakedPartsForBakeKey(bakeKey);
  return groupFromParts(bakeKey, parts);
}

async function loadBakeKey(bakeKey: BuildingBakeKey): Promise<THREE.Object3D | null> {
  const cached = templateCache.get(bakeKey);
  if (cached) return cached;

  try {
    const res = await fetch(bakedBuildingUrl(bakeKey));
    if (res.ok) {
      const buf = new Uint8Array(await res.arrayBuffer());
      const decoded = decodeBakedBuildingMesh(buf, bakeKey);
      if (decoded?.parts.length) {
        return groupFromParts(bakeKey, decoded.parts);
      }
    }
  } catch {
    /* offline or missing bake */
  }

  return proceduralFallback(bakeKey);
}

export function getCachedBakedMesh(bakeKey: BuildingBakeKey): THREE.Object3D | null {
  return templateCache.get(bakeKey) ?? null;
}

/** Procedural or cached bake template for instancing (never cloned per placement). */
export function getOrCreateBakeTemplate(bakeKey: BuildingBakeKey): THREE.Object3D {
  const cached = templateCache.get(bakeKey);
  if (cached) return cached;
  return proceduralFallback(bakeKey);
}

export async function prefetchBakedBuildings(): Promise<number> {
  const keys = allBuildingBakeKeys();
  let loaded = 0;
  await Promise.all(
    keys.map(async (key) => {
      if (templateCache.has(key)) {
        loaded++;
        return;
      }
      let promise = loadPromises.get(key);
      if (!promise) {
        promise = loadBakeKey(key);
        loadPromises.set(key, promise);
      }
      const mesh = await promise;
      if (mesh) loaded++;
    }),
  );
  return loaded;
}

export function clearBakedBuildingCache(): void {
  templateCache.clear();
  loadPromises.clear();
}
