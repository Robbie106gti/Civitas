import { generateTerrainSection } from './terrainSection';

export type FluidType = 'water' | 'none';

/**
 * Procedural static water per chunk: lakes, ridged rivers, noisy coastlines.
 */
export function generateFluidsForChunk(
  cx: number,
  cy: number,
  worldSeed: number,
): Map<string, FluidType> {
  return generateTerrainSection(cx, cy, worldSeed).fluids;
}

export function isWaterFluid(fluid: FluidType | undefined): boolean {
  return fluid === 'water';
}
