import type { BuildingType } from './types';
import { SUB_CELLS_PER_TILE } from './constants';

export interface Footprint {
  /** Width in sub-cells (X). */
  w: number;
  /** Depth in sub-cells (Z). */
  h: number;
}

const S = SUB_CELLS_PER_TILE;
const S2 = S * 2;

/**
 * Building footprint sizes in sub-cells (anchor = top-left / min corner).
 * Roads are 1×1 per placed sub-cell; strips are drawn cell-by-cell.
 */
export const BUILDING_FOOTPRINTS: Record<BuildingType, Footprint> = {
  house: { w: S, h: S },
  dirt_path: { w: 1, h: 1 },
  road: { w: 1, h: 1 },
  highway: { w: 1, h: 1 },
  forum: { w: S2, h: S2 },
  tree: { w: S, h: S },
  clay_pit: { w: S, h: S },
  quarry: { w: S, h: S },
  sand_pit: { w: S, h: S },
  iron_mine: { w: S, h: S },
  gold_mine: { w: S, h: S },
  lumber_camp: { w: S, h: S },
  farm_wheat: { w: S, h: S },
  pottery_workshop: { w: S, h: S },
  weaponsmith: { w: S, h: S },
  warehouse: { w: S, h: S },
  shrine: { w: S, h: S },
  temple: { w: S, h: S },
  oracle: { w: S, h: S },
  trade_post: { w: S, h: S },
  market: { w: S, h: S },
  dock: { w: S, h: S },
};

export function getFootprint(type: BuildingType): Footprint {
  return BUILDING_FOOTPRINTS[type];
}

export function isRoadType(type: BuildingType): boolean {
  return type === 'dirt_path' || type === 'road' || type === 'highway';
}
