import type { BuildingType } from './types';
import { SUB_CELLS_PER_TILE } from './constants';
import { getFootprint } from './footprints';
import { BUILDING_PALETTE, type MaterialKey } from './buildingPalette';
import { solidBlueprint, type VoxelBlueprint } from './voxelBlueprint';
import {
  getResidentialBlueprint,
  residentialVariantForAnchor,
  type ResidentialVariant,
} from './residentialBlueprints';

export type { VoxelBlueprint, VoxelCell } from './voxelBlueprint';
export type { MaterialKey, MaterialDef, BUILDING_PALETTE } from './buildingPalette';
export { BUILDING_PALETTE } from './buildingPalette';
export {
  residentialVariantForAnchor,
  getResidentialBlueprint,
  type ResidentialVariant,
} from './residentialBlueprints';

/** @deprecated Use BUILDING_PALETTE — kept for callers expecting hex colors. */
export const BLOCK_COLORS: Record<MaterialKey, number> = Object.fromEntries(
  Object.entries(BUILDING_PALETTE).map(([k, v]) => [k, v.color]),
) as Record<MaterialKey, number>;

function forumBlueprint(): VoxelBlueprint {
  const S = SUB_CELLS_PER_TILE * 2;
  const base = solidBlueprint(S, S, 'marble', 2);
  const roof = solidBlueprint(S, S, 'roof', 1);
  return { layers: [...base.layers, ...roof.layers] };
}

function roadBlueprint(kind: 'dirt' | 'stone' | 'highway'): VoxelBlueprint {
  const material: MaterialKey =
    kind === 'dirt' ? 'road_dirt' : kind === 'stone' ? 'road_stone' : 'road_highway';
  return solidBlueprint(1, 1, material, 1);
}

function defaultBoxBlueprint(material: MaterialKey, height = 3): VoxelBlueprint {
  const fp = { w: SUB_CELLS_PER_TILE, h: SUB_CELLS_PER_TILE };
  return solidBlueprint(fp.w, fp.h, material, height);
}

const STATIC_BLUEPRINTS: Partial<Record<BuildingType, VoxelBlueprint>> = {
  forum: forumBlueprint(),
  dirt_path: roadBlueprint('dirt'),
  road: roadBlueprint('stone'),
  highway: roadBlueprint('highway'),
  lumber_camp: defaultBoxBlueprint('wood', 2),
  farm_wheat: defaultBoxBlueprint('crop', 2),
  pottery_workshop: defaultBoxBlueprint('terracotta', 3),
  weaponsmith: defaultBoxBlueprint('stone', 3),
  warehouse: defaultBoxBlueprint('wood', 3),
  shrine: defaultBoxBlueprint('marble', 3),
  temple: defaultBoxBlueprint('marble', 3),
  oracle: defaultBoxBlueprint('marble', 4),
  trade_post: defaultBoxBlueprint('wood', 3),
  market: defaultBoxBlueprint('wood', 3),
  dock: defaultBoxBlueprint('wood', 2),
  tree: solidBlueprint(SUB_CELLS_PER_TILE, SUB_CELLS_PER_TILE, 'foliage', 1),
};

export interface BlueprintQuery {
  type: BuildingType;
  anchorSx?: number;
  anchorSz?: number;
  residentialVariant?: ResidentialVariant;
}

export function getBlueprint(query: BuildingType | BlueprintQuery): VoxelBlueprint {
  const type = typeof query === 'string' ? query : query.type;
  const anchorSx = typeof query === 'string' ? undefined : query.anchorSx;
  const anchorSz = typeof query === 'string' ? undefined : query.anchorSz;
  const residentialVariant =
    typeof query === 'string' ? undefined : query.residentialVariant;

  if (type === 'house') {
    const variant =
      residentialVariant ??
      (anchorSx !== undefined && anchorSz !== undefined
        ? residentialVariantForAnchor(anchorSx, anchorSz)
        : ('hut' satisfies ResidentialVariant));
    return getResidentialBlueprint(variant);
  }

  const bp = STATIC_BLUEPRINTS[type];
  if (bp) return bp;
  const { w, h } = getFootprint(type);
  return solidBlueprint(w, h, 'stone', 3);
}
