import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BakedMeshPart } from '../game/buildingMeshBake';
import { BUILDING_PALETTE, type MaterialKey } from '../game/buildingPalette';
import { MAX_MERGE_PRIMITIVES, SUB_CELL_WORLD_SIZE } from '../game/constants';
import type { VoxelBlueprint } from '../game/voxelBlueprint';
import { isFilledCell } from '../game/voxelBlueprint';
import { positionsFromBufferGeometry } from './bakedGeometryExtract';

const BLOCK_GAP = 0.02;
const unit = SUB_CELL_WORLD_SIZE - BLOCK_GAP;
const BLOCK_HEIGHT_SCALE = 0.85;

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

/** Merge baked parts into one group (voxel or macro housing). */
export function buildMeshFromBakedParts(parts: BakedMeshPart[]): THREE.Object3D {
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
  return group;
}

/** Merge voxel layers into one group; geometries batched per material key. */
export function buildMeshFromVoxelData(data: VoxelBlueprint): THREE.Object3D {
  return buildMeshFromBakedParts(buildBakedPartsFromVoxelData(data));
}

export function buildBakedPartsFromVoxelData(data: VoxelBlueprint): BakedMeshPart[] {
  const byMaterial = new Map<MaterialKey, THREE.BoxGeometry[]>();
  let primitiveCount = 0;
  const blockH = unit * BLOCK_HEIGHT_SCALE;

  for (let y = 0; y < data.layers.length; y++) {
    const layer = data.layers[y]!;
    for (let z = 0; z < layer.length; z++) {
      const row = layer[z]!;
      for (let x = 0; x < row.length; x++) {
        const cell = row[x]!;
        if (!isFilledCell(cell)) continue;
        primitiveCount++;
        if (primitiveCount > MAX_MERGE_PRIMITIVES) continue;
        const geom = new THREE.BoxGeometry(unit, blockH, unit);
        geom.translate(
          x * SUB_CELL_WORLD_SIZE + SUB_CELL_WORLD_SIZE / 2,
          y * blockH + blockH / 2,
          z * SUB_CELL_WORLD_SIZE + SUB_CELL_WORLD_SIZE / 2,
        );
        const list = byMaterial.get(cell) ?? [];
        list.push(geom);
        byMaterial.set(cell, list);
      }
    }
  }

  const parts: BakedMeshPart[] = [];
  for (const [materialKey, geoms] of byMaterial) {
    const merged = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!merged?.attributes.position) continue;
    const positions = positionsFromBufferGeometry(merged);
    merged.dispose();
    parts.push({ materialKey, positions });
  }
  return parts;
}
