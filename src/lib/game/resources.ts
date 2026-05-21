import type { NaturalDeposit, NaturalDepositType } from './types';
import { generateTerrainSection } from './terrainSection';

/** Mulberry32 PRNG — deterministic deposit scatter from world seed. */
export function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEPOSIT_WEIGHTS: { type: NaturalDepositType; weight: number; richness: [number, number] }[] =
  [
    { type: 'clay', weight: 18, richness: [40, 120] },
    { type: 'rock', weight: 16, richness: [50, 150] },
    { type: 'sand', weight: 14, richness: [30, 100] },
    { type: 'trees', weight: 20, richness: [60, 180] },
    { type: 'iron', weight: 8, richness: [25, 80] },
    { type: 'gold', weight: 4, richness: [15, 50] },
  ];

function pickDepositType(rng: () => number): NaturalDepositType {
  const total = DEPOSIT_WEIGHTS.reduce((s, d) => s + d.weight, 0);
  let roll = rng() * total;
  for (const entry of DEPOSIT_WEIGHTS) {
    roll -= entry.weight;
    if (roll <= 0) return entry.type;
  }
  return DEPOSIT_WEIGHTS[0]!.type;
}

function richnessFor(type: NaturalDepositType, rng: () => number): number {
  const spec = DEPOSIT_WEIGHTS.find((d) => d.type === type)!;
  const [min, max] = spec.richness;
  return Math.floor(min + rng() * (max - min + 1));
}

/**
 * Procedural deposits for one chunk (sub-cell coordinates, local keys).
 */
export function generateDepositsForChunk(
  cx: number,
  cy: number,
  worldSeed: number,
): Map<string, NaturalDeposit> {
  return generateTerrainSection(cx, cy, worldSeed).deposits;
}

/**
 * Legacy macro-grid deposit scatter (v3 saves).
 */
export function generateDeposits(
  width: number,
  height: number,
  seed: number,
): Map<string, NaturalDeposit> {
  const rng = createSeededRng(seed);
  const deposits = new Map<string, NaturalDeposit>();
  const density = 0.22;

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (rng() > density) continue;
      const type = pickDepositType(rng);
      deposits.set(`${x},${z}`, { type, richness: richnessFor(type, rng) });
    }
  }

  return deposits;
}

export function depositMatchesExtractor(
  deposit: NaturalDeposit | null | undefined,
  required: NaturalDepositType | undefined,
): boolean {
  if (!required) return true;
  if (!deposit) return false;
  return deposit.type === required;
}
