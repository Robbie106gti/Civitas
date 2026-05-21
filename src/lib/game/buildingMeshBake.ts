import type { MaterialKey } from './buildingPalette';
import type { VoxelBlueprint } from './voxelBlueprint';
import type { BuildingBakeKey } from './buildingBakeKeys';
import type { CivicEvolutionTier } from './buildingBakeKeys';
import { getBlueprint } from './blueprints';
import { solidBlueprint } from './voxelBlueprint';
import { SUB_CELLS_PER_TILE } from './constants';
import type { ResidentialVariant } from './residentialBlueprints';
import { buildBakedPartsFromVoxelData } from '../three/voxelMeshBuilder';

export const BUILDING_MESH_MAGIC = 0x42535742; // 'BWSB'
export const BUILDING_MESH_FORMAT = 1;

export interface BakedMeshPart {
  materialKey: MaterialKey;
  positions: Float32Array;
}

export interface BakedBuildingMesh {
  bakeKey: BuildingBakeKey;
  parts: BakedMeshPart[];
}

/** Blueprint used when baking / procedural fallback for a bake key. */
export function blueprintForBakeKey(key: BuildingBakeKey): VoxelBlueprint {
  if (key.startsWith('house-')) {
    const variant = key.slice('house-'.length) as ResidentialVariant;
    return getBlueprint({ type: 'house', residentialVariant: variant });
  }

  const civicMatch = /^(\w+)-([012])$/.exec(key);
  if (civicMatch) {
    const type = civicMatch[1] as import('./types').BuildingType;
    const tier = Number(civicMatch[2]) as CivicEvolutionTier;
    const base = getBlueprint(type);
    if (tier === 0) return base;
    const extraLayers =
      tier === 1 ? solidBlueprint(SUB_CELLS_PER_TILE, SUB_CELLS_PER_TILE, 'marble', 1) : solidBlueprint(SUB_CELLS_PER_TILE, SUB_CELLS_PER_TILE, 'roof', 2);
    if (type === 'forum') {
      const S = SUB_CELLS_PER_TILE * 2;
      const cap =
        tier === 1
          ? solidBlueprint(S, S, 'marble', 1)
          : solidBlueprint(S, S, 'roof', 2);
      return { layers: [...base.layers, ...cap.layers] };
    }
    return { layers: [...base.layers, ...extraLayers.layers] };
  }

  const type = key as import('./types').BuildingType;
  return getBlueprint(type);
}

export function encodeBakedBuildingMesh(mesh: BakedBuildingMesh): Uint8Array {
  let size = 7;
  const partPayloads: { key: string; positions: Float32Array }[] = [];
  for (const part of mesh.parts) {
    const keyBytes = new TextEncoder().encode(part.materialKey);
    size += 1 + keyBytes.length + 4 + part.positions.byteLength;
    partPayloads.push({ key: part.materialKey, positions: part.positions });
  }

  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, BUILDING_MESH_MAGIC, true);
  view.setUint8(4, BUILDING_MESH_FORMAT);
  view.setUint16(5, mesh.parts.length, true);

  let o = 7;
  for (const part of partPayloads) {
    const keyBytes = new TextEncoder().encode(part.key);
    out[o] = keyBytes.length;
    o += 1;
    out.set(keyBytes, o);
    o += keyBytes.length;
    view.setUint32(o, part.positions.length / 3, true);
    o += 4;
    new Uint8Array(out.buffer, o, part.positions.byteLength).set(
      new Uint8Array(part.positions.buffer, part.positions.byteOffset, part.positions.byteLength),
    );
    o += part.positions.byteLength;
  }

  return out;
}

export function decodeBakedBuildingMesh(
  bytes: Uint8Array,
  bakeKey: BuildingBakeKey,
): BakedBuildingMesh | null {
  if (bytes.byteLength < 7) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== BUILDING_MESH_MAGIC) return null;
  if (view.getUint8(4) !== BUILDING_MESH_FORMAT) return null;

  const meshCount = view.getUint16(5, true);
  const parts: BakedMeshPart[] = [];
  let o = 7;

  for (let i = 0; i < meshCount; i++) {
    if (o >= bytes.byteLength) return null;
    const keyLen = bytes[o]!;
    o += 1;
    if (o + keyLen + 4 > bytes.byteLength) return null;
    const key = new TextDecoder().decode(bytes.subarray(o, o + keyLen)) as MaterialKey;
    o += keyLen;
    const vertexCount = view.getUint32(o, true);
    o += 4;
    const floatCount = vertexCount * 3;
    if (o + floatCount * 4 > bytes.byteLength) return null;
    const positions = new Float32Array(vertexCount * 3);
    for (let j = 0; j < floatCount; j++) {
      positions[j] = view.getFloat32(o + j * 4, true);
    }
    o += floatCount * 4;
    parts.push({ materialKey: key, positions });
  }

  return { bakeKey, parts };
}

const FOOTING_Y_EPS = 1e-4;

/** Shift baked geometry so the lowest vertex sits at y = 0 (stable instanced footing). */
export function rebaseBakedPartsToGround(parts: BakedMeshPart[]): BakedMeshPart[] {
  let minY = Infinity;
  for (const part of parts) {
    const pos = part.positions;
    for (let i = 1; i < pos.length; i += 3) {
      minY = Math.min(minY, pos[i]!);
    }
  }
  if (!Number.isFinite(minY) || Math.abs(minY) <= FOOTING_Y_EPS) return parts;

  return parts.map((part) => {
    const positions = new Float32Array(part.positions.length);
    for (let i = 0; i < part.positions.length; i += 3) {
      positions[i] = part.positions[i]!;
      positions[i + 1] = part.positions[i + 1]! - minY;
      positions[i + 2] = part.positions[i + 2]!;
    }
    return { materialKey: part.materialKey, positions };
  });
}

export function minYInBakedParts(parts: BakedMeshPart[]): number {
  let minY = Infinity;
  for (const part of parts) {
    const pos = part.positions;
    for (let i = 1; i < pos.length; i += 3) {
      minY = Math.min(minY, pos[i]!);
    }
  }
  return minY;
}

