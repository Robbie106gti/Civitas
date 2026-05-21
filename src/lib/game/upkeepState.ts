import { subKey } from './chunkCoords';
import { civicTierForScore, isCivicEvolutionType } from './buildingBakeKeys';
import type { CivicEvolutionTier } from './buildingBakeKeys';
import { getFootprint } from './footprints';
import type { BuildingUpkeepSnapshot } from './types';
import type { BuildingType } from './types';

export interface BuildingUpkeepRecord {
  condition: number;
  entropy: number;
  lastMaintainedTick: number;
  evolutionScore: number;
  materialStarved: boolean;
}

export class UpkeepRegistry {
  private readonly byAnchor = new Map<string, BuildingUpkeepRecord>();

  get(key: string): BuildingUpkeepRecord | undefined {
    return this.byAnchor.get(key);
  }

  civicTierAt(key: string, type: BuildingType): CivicEvolutionTier | undefined {
    if (!isCivicEvolutionType(type)) return undefined;
    const rec = this.byAnchor.get(key);
    return civicTierForScore(rec?.evolutionScore ?? 0);
  }

  set(key: string, record: BuildingUpkeepRecord): void {
    this.byAnchor.set(key, {
      condition: clamp(record.condition, 0, 100),
      entropy: clamp(record.entropy, 0, 100),
      lastMaintainedTick: record.lastMaintainedTick,
      evolutionScore: clamp(record.evolutionScore, 0, 100),
      materialStarved: record.materialStarved,
    });
  }

  delete(key: string): void {
    this.byAnchor.delete(key);
  }

  clear(): void {
    this.byAnchor.clear();
  }

  entries(): IterableIterator<[string, BuildingUpkeepRecord]> {
    return this.byAnchor.entries();
  }

  toSnapshots(): BuildingUpkeepSnapshot[] {
    return [...this.byAnchor.entries()].map(([key, r]) => ({
      key,
      condition: r.condition,
      entropy: r.entropy,
      lastMaintainedTick: r.lastMaintainedTick,
      evolutionScore: r.evolutionScore,
      materialStarved: r.materialStarved,
    }));
  }

  loadSnapshots(rows: BuildingUpkeepSnapshot[]): void {
    this.byAnchor.clear();
    for (const row of rows) {
      this.set(row.key, {
        condition: row.condition,
        entropy: row.entropy,
        lastMaintainedTick: row.lastMaintainedTick,
        evolutionScore: row.evolutionScore ?? 0,
        materialStarved: row.materialStarved ?? false,
      });
    }
  }

  static buildingCenter(sx: number, sz: number, type: BuildingType): { cx: number; cz: number } {
    const fp = getFootprint(type);
    return { cx: sx + fp.w / 2, cz: sz + fp.h / 2 };
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function defaultUpkeepRecord(simTick: number): BuildingUpkeepRecord {
  return {
    condition: 92,
    entropy: 4,
    lastMaintainedTick: simTick,
    evolutionScore: 12,
    materialStarved: false,
  };
}

export function upkeepStateFromSnapshots(
  rows: BuildingUpkeepSnapshot[],
): Map<string, BuildingUpkeepRecord> {
  const map = new Map<string, BuildingUpkeepRecord>();
  for (const row of rows) {
    map.set(row.key, {
      condition: row.condition,
      entropy: row.entropy,
      lastMaintainedTick: row.lastMaintainedTick,
      evolutionScore: row.evolutionScore ?? 0,
      materialStarved: row.materialStarved ?? false,
    });
  }
  return map;
}

export function anchorKey(sx: number, sz: number): string {
  return subKey(sx, sz);
}
