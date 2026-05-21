import { SUB_CELLS_PER_TILE } from './constants';
import { BUILDING_PALETTE } from './buildingPalette';
import { solidBlueprint, type VoxelBlueprint } from './voxelBlueprint';

/**
 * Housing visuals are built from macro primitives in `residentialMeshBuilder.ts`
 * (low triangle count, Roman domus read). These blueprints are placeholders for
 * data-driven callers; mesh bake uses the macro builder directly.
 */
const PLACEHOLDER: VoxelBlueprint = solidBlueprint(SUB_CELLS_PER_TILE, SUB_CELLS_PER_TILE, 'stucco', 1);

export const RESIDENTIAL_VARIANTS = ['hut', 'domus', 'villa'] as const;
export type ResidentialVariant = (typeof RESIDENTIAL_VARIANTS)[number];

const RESIDENTIAL_MODELS: Record<ResidentialVariant, VoxelBlueprint> = {
  hut: PLACEHOLDER,
  domus: PLACEHOLDER,
  villa: PLACEHOLDER,
};

export function residentialVariantForAnchor(sx: number, sz: number): ResidentialVariant {
  const h = (sx * 73856093) ^ (sz * 19349663);
  return RESIDENTIAL_VARIANTS[Math.abs(h) % RESIDENTIAL_VARIANTS.length]!;
}

export function getResidentialBlueprint(variant: ResidentialVariant): VoxelBlueprint {
  return RESIDENTIAL_MODELS[variant];
}

/** Footprint size for all housing (one macro tile). */
export const RESIDENTIAL_FOOTPRINT = SUB_CELLS_PER_TILE;

export function residentialLodColor(variant: ResidentialVariant): number {
  const key = { hut: 'stucco_cream', domus: 'stucco_ochre', villa: 'marble_white' } as const;
  return BUILDING_PALETTE[key[variant]].color;
}
