import type { NaturalDeposit, NaturalDepositType } from './types';
import type { TerrainLayer } from './terrain';

/**
 * Vertical terrain column (bottom → top). Surface is the last layer.
 * Mirrors residential voxel stacks: each Y slice is one stratum.
 */
export const PLAIN_TERRAIN_STACK: readonly TerrainLayer[] = ['dirt', 'grass'] as const;

export const CLAY_TERRAIN_STACK: readonly TerrainLayer[] = [
  'rock',
  'clay_layer',
  'clay_layer',
  'dirt',
  'grass',
] as const;

export const SAND_TERRAIN_STACK: readonly TerrainLayer[] = [
  'rock',
  'sand',
  'sand',
  'dirt',
  'grass',
] as const;

export const ROCK_TERRAIN_STACK: readonly TerrainLayer[] = [
  'rock',
  'rock',
  'rock',
  'dirt',
  'grass',
] as const;

export const TREE_TERRAIN_STACK: readonly TerrainLayer[] = ['dirt', 'dirt', 'grass'] as const;

const STACK_BY_DEPOSIT: Record<NaturalDepositType, readonly TerrainLayer[]> = {
  clay: CLAY_TERRAIN_STACK,
  sand: SAND_TERRAIN_STACK,
  rock: ROCK_TERRAIN_STACK,
  iron: ROCK_TERRAIN_STACK,
  gold: ROCK_TERRAIN_STACK,
  trees: TREE_TERRAIN_STACK,
};

export function terrainStackForDeposit(
  deposit: NaturalDeposit | null | undefined,
): readonly TerrainLayer[] {
  if (!deposit) return PLAIN_TERRAIN_STACK;
  return STACK_BY_DEPOSIT[deposit.type] ?? PLAIN_TERRAIN_STACK;
}

export function terrainStackForDepositType(type: NaturalDepositType): readonly TerrainLayer[] {
  return STACK_BY_DEPOSIT[type] ?? PLAIN_TERRAIN_STACK;
}
