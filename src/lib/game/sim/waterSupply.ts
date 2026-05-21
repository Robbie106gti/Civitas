import type { BuildingType } from '../types';

/** Future hook: wells, aqueducts, fishing from water tiles. */
export interface WaterSupplyStub {
  dockCount: number;
  /** Reserved for well buildings. */
  wellCapacity: number;
  /** Reserved for aqueduct network. */
  aqueductConnected: boolean;
}

export function computeWaterSupplyStub(occupancy: Map<string, BuildingType>): WaterSupplyStub {
  let dockCount = 0;
  for (const t of occupancy.values()) {
    if (t === 'dock') dockCount++;
  }
  return { dockCount, wellCapacity: 0, aqueductConnected: false };
}
