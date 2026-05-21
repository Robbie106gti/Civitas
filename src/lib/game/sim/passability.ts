import { isRoadType } from '../footprints';
import type { BuildingType } from '../types';

/** Max normalized elevation step between neighbors before terrain is too steep. */
export const STEEP_TERRAIN_ELEVATION_DELTA = 0.14;

export function isSteepTerrainSlope(elevA: number, elevB: number): boolean {
  return Math.abs(elevA - elevB) > STEEP_TERRAIN_ELEVATION_DELTA;
}

export function isPassableSubCell(building: BuildingType | null | undefined): boolean {
  if (!building) return true;
  return isRoadType(building);
}

export function isBlockedSubCell(building: BuildingType | null | undefined): boolean {
  if (!building) return false;
  return !isRoadType(building);
}
