import { subKey } from './chunkCoords';
import { getFootprint } from './footprints';
import type { ResidentialVariant } from './residentialBlueprints';
import { RESIDENTIAL_VARIANTS } from './residentialBlueprints';
import type { HouseEvolutionSnapshot } from './types';

/** Gameplay tier 0 = hut, 1 = domus, 2 = villa. */
export type HousingTier = 0 | 1 | 2;

export interface HouseEvolutionRecord {
  score: number;
  tier: HousingTier;
}

export function tierToVariant(tier: HousingTier): ResidentialVariant {
  return RESIDENTIAL_VARIANTS[Math.min(2, Math.max(0, tier))]!;
}

export function variantToTier(variant: ResidentialVariant): HousingTier {
  const idx = RESIDENTIAL_VARIANTS.indexOf(variant);
  return (idx >= 0 ? idx : 0) as HousingTier;
}

/** Per-anchor housing evolution (score 0–100, tier 0–2). */
export class HousingRegistry {
  private readonly byAnchor = new Map<string, HouseEvolutionRecord>();

  get(key: string): HouseEvolutionRecord | undefined {
    return this.byAnchor.get(key);
  }

  getAt(sx: number, sz: number): HouseEvolutionRecord | undefined {
    return this.byAnchor.get(subKey(sx, sz));
  }

  variantAt(sx: number, sz: number): ResidentialVariant {
    const rec = this.getAt(sx, sz);
    return rec ? tierToVariant(rec.tier) : 'hut';
  }

  set(key: string, record: HouseEvolutionRecord): void {
    this.byAnchor.set(key, {
      score: Math.max(0, Math.min(100, record.score)),
      tier: record.tier,
    });
  }

  delete(key: string): void {
    this.byAnchor.delete(key);
  }

  clear(): void {
    this.byAnchor.clear();
  }

  entries(): IterableIterator<[string, HouseEvolutionRecord]> {
    return this.byAnchor.entries();
  }

  toSnapshots(): HouseEvolutionSnapshot[] {
    return [...this.byAnchor.entries()].map(([key, { score, tier }]) => ({
      key,
      score,
      tier,
    }));
  }

  loadSnapshots(rows: HouseEvolutionSnapshot[]): void {
    this.byAnchor.clear();
    for (const row of rows) {
      this.set(row.key, { score: row.score, tier: row.tier });
    }
  }

  /** House center in sub-cells for distance checks. */
  static houseCenter(sx: number, sz: number): { cx: number; cz: number } {
    const fp = getFootprint('house');
    return { cx: sx + fp.w / 2, cz: sz + fp.h / 2 };
  }
}
