import type { BuildingType } from './types';
import type { ResidentialVariant } from './residentialBlueprints';
import { RESIDENTIAL_VARIANTS } from './residentialBlueprints';
import { getBuildingDef } from './buildings';
import { isRoadType } from './footprints';

/** Civic / economic buildings with tiered baked meshes (0 = base, 2 = grand). */
export const CIVIC_EVOLUTION_TYPES = [
  'forum',
  'temple',
  'shrine',
  'warehouse',
  'market',
] as const;

export type CivicEvolutionType = (typeof CIVIC_EVOLUTION_TYPES)[number];

export type CivicEvolutionTier = 0 | 1 | 2;

export function civicTierForScore(score: number): CivicEvolutionTier {
  if (score >= 70) return 2;
  if (score >= 38) return 1;
  return 0;
}

export function isCivicEvolutionType(type: BuildingType): type is CivicEvolutionType {
  return (CIVIC_EVOLUTION_TYPES as readonly string[]).includes(type);
}

/** All full-LOD bake asset filenames (without `.bin`). Regenerate via `npm run bake-buildings`. */
export const BUILDING_BAKE_KEYS = [
  ...RESIDENTIAL_VARIANTS.map((v) => `house-${v}` as const),
  ...CIVIC_EVOLUTION_TYPES.flatMap((t) =>
    ([0, 1, 2] as const).map((tier) => `${t}-${tier}` as const),
  ),
  'pottery_workshop',
  'weaponsmith',
  'farm_wheat',
  'lumber_camp',
  'trade_post',
  'oracle',
  'dock',
  'tree',
  'dirt_path',
  'road',
  'highway',
] as const;

export type BuildingBakeKey = (typeof BUILDING_BAKE_KEYS)[number];

export interface BuildingBakeQuery {
  type: BuildingType;
  lod: 'full' | 'simple';
  residentialVariant?: ResidentialVariant;
  civicTier?: CivicEvolutionTier;
}

export function resolveBuildingBakeKey(query: BuildingBakeQuery): BuildingBakeKey | null {
  if (query.lod === 'simple') return null;
  if (getBuildingDef(query.type).category === 'natural_extractor') return null;

  if (query.type === 'house') {
    const v = query.residentialVariant ?? 'hut';
    return `house-${v}` as BuildingBakeKey;
  }

  if (isCivicEvolutionType(query.type)) {
    const tier = query.civicTier ?? 0;
    return `${query.type}-${tier}` as BuildingBakeKey;
  }

  if (isRoadType(query.type)) {
    if (query.type === 'dirt_path') return 'dirt_path';
    if (query.type === 'highway') return 'highway';
    return 'road';
  }

  const staticKeys: Partial<Record<BuildingType, BuildingBakeKey>> = {
    pottery_workshop: 'pottery_workshop',
    weaponsmith: 'weaponsmith',
    farm_wheat: 'farm_wheat',
    lumber_camp: 'lumber_camp',
    trade_post: 'trade_post',
    oracle: 'oracle',
    dock: 'dock',
    tree: 'tree',
  };

  return staticKeys[query.type] ?? null;
}

export function bakedBuildingUrl(bakeKey: BuildingBakeKey): string {
  return `/buildings/${bakeKey}.bin`;
}

export function allBuildingBakeKeys(): readonly BuildingBakeKey[] {
  return BUILDING_BAKE_KEYS;
}
