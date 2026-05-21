import type { BakedMeshPart } from '../game/buildingMeshBake';
import {
  blueprintForBakeKey,
  rebaseBakedPartsToGround,
  type BuildingBakeKey,
} from '../game/buildingMeshBake';
import { buildMacroBakedParts } from './buildingMacroMeshes';
import { buildBakedPartsFromVoxelData } from './voxelMeshBuilder';
import { buildResidentialBakedParts, residentialBakeKeyVariant } from './residentialMeshBuilder';

/** Baked geometry for a full-LOD building key (macro mesh where available). */
export function buildBakedPartsForBakeKey(key: BuildingBakeKey): BakedMeshPart[] {
  const variant = residentialBakeKeyVariant(key);
  const parts = variant
    ? buildResidentialBakedParts(variant)
    : (buildMacroBakedParts(key) ?? buildBakedPartsFromVoxelData(blueprintForBakeKey(key)));
  return rebaseBakedPartsToGround(parts);
}
