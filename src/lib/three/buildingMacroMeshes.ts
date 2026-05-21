import type { BakedMeshPart } from '../game/buildingMeshBake';
import type { BuildingBakeKey } from '../game/buildingBakeKeys';
import type { CivicEvolutionTier } from '../game/buildingBakeKeys';
import { CIVIC_EVOLUTION_TYPES } from '../game/buildingBakeKeys';
import { SUB_CELLS_PER_TILE } from '../game/constants';
import type { MaterialKey } from '../game/buildingPalette';
import {
  TILE_CELLS,
  TILE_WORLD,
  tileWorld,
  addBox,
  addColumnRow,
  addFootingBand,
  addPediment,
  addQuoinCorners,
  addRecessedDoor,
  addRoofWithEaves,
  addSolidPerimeter,
  addStripedAwning,
  bucketsToParts,
  type GeomBucket,
} from './macroMeshCommon';

const S = TILE_CELLS;
const S2 = S * 2;
const TW = TILE_WORLD;

const PLINTH_H = TW * 0.1;
const FOOTING_H = TW * 0.04;
const STORY_H = TW * 0.46;
const UPPER_H = TW * 0.38;
const COL_H = TW * 0.52;

function tierMul(tier: CivicEvolutionTier): number {
  return tier === 0 ? 1 : tier === 1 ? 1.1 : 1.22;
}

function parseCivicKey(
  key: string,
): { type: (typeof CIVIC_EVOLUTION_TYPES)[number]; tier: CivicEvolutionTier } | null {
  const m = /^(\w+)-([012])$/.exec(key);
  if (!m) return null;
  const type = m[1] as (typeof CIVIC_EVOLUTION_TYPES)[number];
  if (!(CIVIC_EVOLUTION_TYPES as readonly string[]).includes(type)) return null;
  return { type, tier: Number(m[2]) as CivicEvolutionTier };
}

function buildWarehouse(tier: CivicEvolutionTier): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  const wallH = STORY_H * tierMul(tier);
  let y = 0;

  addBox(buckets, 'limestone', S, 0, 0, y, S, 1, PLINTH_H);
  y += PLINTH_H;
  addFootingBand(buckets, S, y, FOOTING_H, 'travertine');
  y += FOOTING_H;

  addSolidPerimeter(buckets, S, 'stucco_ochre', y, wallH, 2, 7);
  addQuoinCorners(buckets, S, y, wallH, 'wood_walnut');
  addRecessedDoor(buckets, S, y, wallH, 2, 7);
  addBox(buckets, 'wood_walnut', S, 2, 0, y, 6, 1, wallH * 0.92);
  const barrels = tier === 0 ? 2 : tier === 1 ? 3 : 4;
  for (let i = 0; i < barrels; i++) {
    const x = i % 2 === 0 ? 1 : S - 2;
    const z = 2 + Math.floor(i / 2) * 3;
    addBox(buckets, 'wood_walnut', S, x, z, y, 1, 1, wallH * 0.55);
  }
  if (tier >= 1) {
    addBox(buckets, 'wood', S, S - 2, 2, y + wallH * 0.35, 1, 2, wallH * 0.5);
  }
  y += wallH;

  addRoofWithEaves(buckets, S, y, TW, 1, tier >= 1, 'roof_tile_dark', 'terracotta');
  if (tier >= 2) {
    addBox(buckets, 'wood_walnut', S, 1, 1, y + TW * 0.28, S - 2, 1, TW * 0.1);
  }
  return bucketsToParts(buckets);
}

function buildMarket(tier: CivicEvolutionTier): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  const wallH = STORY_H * tierMul(tier) * 0.88;
  let y = 0;

  addBox(buckets, 'travertine', S, 0, 0, y, S, 1, PLINTH_H);
  y += PLINTH_H;
  addFootingBand(buckets, S, y, FOOTING_H, 'limestone');
  y += FOOTING_H;

  addSolidPerimeter(buckets, S, 'stucco_cream', y, wallH, -1, -1);
  const colXs =
    tier === 0 ? ([1, 4, 8] as const) : tier === 1 ? ([1, 3, 6, 8] as const) : ([0, 2, 4, 7, 9] as const);
  addColumnRow(buckets, S, colXs, 0, y, wallH * 1.02, 'travertine');
  addPediment(buckets, S, 0, S - 1, 0, y + wallH * 0.92, wallH * 0.1);

  const stallZ = tier === 0 ? 2 : 1;
  addBox(buckets, 'wood_walnut', S, 1, stallZ, y, 3, 1, wallH * 0.45);
  addBox(buckets, 'wood_walnut', S, S - 4, stallZ, y, 3, 1, wallH * 0.45);
  addStripedAwning(buckets, S, stallZ, y + wallH * 0.48, wallH * 0.14);
  addBox(buckets, 'wood', S, 2, stallZ + 1, y, 1, 1, wallH * 0.28);
  addBox(buckets, 'wood', S, S - 3, stallZ + 1, y, 1, 1, wallH * 0.28);
  if (tier >= 1) {
    addBox(buckets, 'wood_walnut', S, 4, S - 2, y, 2, 1, wallH * 0.4);
    addStripedAwning(buckets, S, S - 2, y + wallH * 0.4, wallH * 0.12, 3, 6);
    addBox(buckets, 'clay_raw', S, 5, 4, y, 1, 1, wallH * 0.22);
  }
  if (tier >= 2) {
    addBox(buckets, 'crop', S, 6, 5, y, 1, 1, wallH * 0.2);
    addBox(buckets, 'wood', S, 7, 4, y, 1, 1, wallH * 0.24);
  }
  y += wallH;
  addRoofWithEaves(buckets, S, y, TW, 0, tier >= 2, 'terracotta', 'roof_tile_dark');
  return bucketsToParts(buckets);
}

function buildShrine(tier: CivicEvolutionTier): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  const wallH = STORY_H * tierMul(tier) * 0.78;
  let y = 0;

  addBox(buckets, 'marble_white', S, 0, 0, y, S, 1, PLINTH_H);
  y += PLINTH_H;
  addFootingBand(buckets, S, y, FOOTING_H, 'travertine');
  y += FOOTING_H;

  addSolidPerimeter(buckets, S, 'stucco_pink', y, wallH, 4, 5);
  const cols =
    tier === 0 ? ([2, 7] as const) : tier === 1 ? ([1, 3, 6, 8] as const) : ([0, 2, 4, 7, 9] as const);
  addColumnRow(buckets, S, cols, 0, y, wallH * 1.08, 'marble_white');
  addPediment(buckets, S, 2, S - 3, 0, y + wallH * 0.9, wallH * 0.1);
  addBox(buckets, 'marble_white', S, 4, 3, y, 2, 4, wallH * 0.55);
  addBox(buckets, 'bronze', S, 4, 4, y + wallH * 0.12, 2, 2, wallH * 0.22);
  if (tier >= 1) {
    addColumnRow(buckets, S, [4], S - 1, y, wallH * 0.95, 'marble_white');
  }
  y += wallH;
  addRoofWithEaves(buckets, S, y, TW, 2, true, 'terracotta', 'roof_tile_dark');
  if (tier >= 2) {
    addBox(buckets, 'bronze', S, 3, 3, y + TW * 0.34, 4, 4, TW * 0.06);
  }
  return bucketsToParts(buckets);
}

function buildTemple(tier: CivicEvolutionTier): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  const wallH = STORY_H * tierMul(tier);
  const colH = COL_H * tierMul(tier);
  let y = 0;

  addBox(buckets, 'marble_white', S, 0, 0, y, S, 1, PLINTH_H * 1.25);
  y += PLINTH_H * 1.25;
  addBox(buckets, 'marble_white', S, 1, 1, y, S - 2, S - 2, FOOTING_H);
  y += FOOTING_H;

  const colStep = tier === 0 ? 3 : 2;
  for (let x = 0; x < S; x += colStep) {
    addColumnRow(buckets, S, [x], 0, y, colH, 'marble_white');
    addColumnRow(buckets, S, [x], S - 1, y, colH * 0.96, 'marble_white');
  }
  addColumnRow(buckets, S, [0, S - 1], 0, y, colH, 'marble_white');

  addSolidPerimeter(buckets, S, 'plaster_white', y + colH * 0.12, wallH * 0.85, -1, -1);
  addBox(buckets, 'marble_white', S, 3, 3, y + colH * 0.18, 4, 4, wallH * 0.72);
  if (tier >= 1) {
    addBox(buckets, 'bronze', S, 4, 0, y + colH * 0.88, 2, 1, wallH * 0.08);
  }
  y += colH * 0.12 + wallH * 0.85;

  addPediment(buckets, S, 0, S - 1, 0, y, wallH * 0.16);
  addBox(buckets, 'bronze', S, 2, 0, y + wallH * 0.1, S - 4, 1, wallH * 0.05);
  addRoofWithEaves(buckets, S, y + wallH * 0.14, TW, 0, true, 'terracotta', 'bronze');
  if (tier >= 2) {
    addBox(buckets, 'marble_white', S, 2, 2, y + TW * 0.4, S - 4, 1, TW * 0.14);
    addBox(buckets, 'marble_white', S, 2, S - 3, y + TW * 0.4, S - 4, 1, TW * 0.14);
    addBox(buckets, 'bronze', S, 4, 4, y + TW * 0.42, 2, 2, TW * 0.08);
  }
  return bucketsToParts(buckets);
}

function buildForum(tier: CivicEvolutionTier): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  const tw = tileWorld(S2);
  const plinthH = tw * 0.08;
  const storyH = tw * 0.36 * tierMul(tier);
  const colH = tw * 0.46 * tierMul(tier);
  let y = 0;

  addBox(buckets, 'marble_white', S2, 0, 0, y, S2, 1, plinthH);
  y += plinthH;
  addFootingBand(buckets, S2, y, tw * 0.035, 'travertine');
  addBox(buckets, 'marble_white', S2, 6, 0, y, 8, 1, tw * 0.05);
  y += tw * 0.035;

  const poolMin = 7;
  const poolMax = 12;
  addSolidPerimeter(buckets, S2, 'stucco_cream', y, storyH * 0.82, 8, 11);
  addBox(buckets, 'travertine', S2, poolMin - 1, poolMin - 1, y, poolMax - poolMin + 3, poolMax - poolMin + 3, tw * 0.05);
  addBox(buckets, 'pool_water', S2, poolMin, poolMin, y + tw * 0.04, poolMax - poolMin + 1, poolMax - poolMin + 1, tw * 0.03);
  addBox(buckets, 'travertine', S2, 2, 2, y, 4, 4, tw * 0.03);
  addBox(buckets, 'travertine', S2, S2 - 6, 2, y, 4, 4, tw * 0.03);
  addBox(buckets, 'travertine', S2, 2, S2 - 6, y, 4, 4, tw * 0.03);
  addBox(buckets, 'travertine', S2, S2 - 6, S2 - 6, y, 4, 4, tw * 0.03);

  const colStride = tier === 0 ? 4 : tier === 1 ? 3 : 2;
  for (let x = 0; x < S2; x += colStride) {
    addColumnRow(buckets, S2, [x], 0, y, colH, 'marble_white');
    if (x < S2 - 1) addColumnRow(buckets, S2, [x], S2 - 1, y, colH * 0.96, 'marble_white');
  }
  addColumnRow(buckets, S2, [0, S2 - 1], 0, y, colH * 0.9, 'marble_white');
  addPediment(buckets, S2, 2, S2 - 3, 0, y + colH * 0.9, colH * 0.11);

  if (tier >= 1) {
    addBox(buckets, 'stucco_ochre', S2, 2, 2, y + storyH * 0.48, 4, 4, storyH * 0.52);
    addBox(buckets, 'stucco_ochre', S2, S2 - 6, 2, y + storyH * 0.48, 4, 4, storyH * 0.52);
  }
  y += Math.max(storyH, colH);

  addRoofWithEaves(buckets, S2, y, tw, 3, tier >= 1, 'terracotta', 'roof_tile_dark');
  if (tier >= 2) {
    addBox(buckets, 'marble_white', S2, 5, 5, y + tw * 0.28, S2 - 10, S2 - 10, tw * 0.08);
  }
  return bucketsToParts(buckets);
}

function buildOracle(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  let y = 0;

  addBox(buckets, 'stone', S, 0, 0, y, S, 1, PLINTH_H);
  y += PLINTH_H;
  addFootingBand(buckets, S, y, FOOTING_H, 'limestone');
  y += FOOTING_H;

  addBox(buckets, 'cypress_green', S, 1, 1, y, S - 2, S - 2, TW * 0.08);
  const ring = [1, 3, 6, 8] as const;
  for (const x of ring) {
    addBox(buckets, 'stone', S, x, x, y + TW * 0.06, 1, 1, TW * 0.14);
    addBox(buckets, 'stone', S, x, S - 1 - x, y + TW * 0.06, 1, 1, TW * 0.14);
  }
  addBox(buckets, 'limestone', S, 4, 4, y, 2, 2, TW * 0.08);
  addBox(buckets, 'marble_white', S, 4, 4, y + TW * 0.07, 2, 2, TW * 0.04);
  addColumnRow(buckets, S, [4], 0, y, COL_H * 0.75, 'travertine');
  addSolidPerimeter(buckets, S, 'stucco_pink', y + COL_H * 0.1, STORY_H * 0.55, 4, 5);
  y += COL_H * 0.65;
  addRoofWithEaves(buckets, S, y, TW, 2, true, 'roof_tile_dark', 'cypress_green');
  return bucketsToParts(buckets);
}

function buildPotteryWorkshop(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  let y = 0;

  addBox(buckets, 'limestone', S, 0, 0, y, S, 1, PLINTH_H);
  y += PLINTH_H;
  addSolidPerimeter(buckets, S, 'stucco_ochre', y, STORY_H, 4, 5);
  addRecessedDoor(buckets, S, y, STORY_H);
  addBox(buckets, 'terracotta', S, S - 2, 2, y, 1, 1, STORY_H * 1.4);
  addBox(buckets, 'stone', S, S - 2, 3, y, 1, 1, STORY_H * 0.28);
  addBox(buckets, 'clay_raw', S, 1, 2, y, 2, 2, STORY_H * 0.2);
  addBox(buckets, 'clay_raw', S, 2, 3, y, 1, 1, STORY_H * 0.15);
  addBox(buckets, 'clay_raw', S, 1, 4, y, 1, 1, STORY_H * 0.12);
  y += STORY_H;
  addRoofWithEaves(buckets, S, y, TW, 1, false, 'roof_tile_dark', 'terracotta');
  return bucketsToParts(buckets);
}

function buildWeaponsmith(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  let y = 0;

  addBox(buckets, 'iron_dark', S, 0, 0, y, S, 1, PLINTH_H);
  y += PLINTH_H;
  addSolidPerimeter(buckets, S, 'stone', y, STORY_H, 4, 5);
  addRecessedDoor(buckets, S, y, STORY_H);
  addBox(buckets, 'iron_dark', S, 1, 3, y, 2, 2, STORY_H * 0.38);
  addBox(buckets, 'ember_glow', S, 1, 3, y + STORY_H * 0.2, 2, 2, STORY_H * 0.22);
  addBox(buckets, 'stone', S, S - 2, 2, y, 1, 1, STORY_H * 1.15);
  addBox(buckets, 'iron_dark', S, 2, 4, y, 2, 1, STORY_H * 0.12);
  addBox(buckets, 'stone', S, S - 2, 3, y + STORY_H * 0.88, 1, 1, TW * 0.24);
  y += STORY_H;
  addRoofWithEaves(buckets, S, y, TW, 1, false, 'roof_tile_dark', 'iron_dark');
  return bucketsToParts(buckets);
}

function buildFarmWheat(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  let y = 0;

  addBox(buckets, 'dirt', S, 0, 0, y, S, S, TW * 0.04);
  for (let z = 1; z < S - 1; z += 2) {
    for (let x = 1; x < S - 3; x += 2) {
      addBox(buckets, 'crop_green', S, x, z, y + TW * 0.035, 1, 1, TW * 0.16);
      if ((x + z) % 4 === 0) {
        addBox(buckets, 'crop', S, x, z, y + TW * 0.12, 1, 1, TW * 0.06);
      }
    }
  }
  addBox(buckets, 'stone', S, S - 3, S - 3, y, 3, 3, STORY_H * 0.42);
  addBox(buckets, 'stucco_cream', S, S - 3, S - 3, y + STORY_H * 0.38, 3, 3, STORY_H * 0.2);
  addBox(buckets, 'terracotta', S, S - 3, S - 3, y + STORY_H * 0.52, 3, 3, TW * 0.1);
  addBox(buckets, 'cypress_green', S, 1, 1, y, 1, 1, TW * 0.22);
  return bucketsToParts(buckets);
}

function buildTradePost(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  let y = 0;

  addBox(buckets, 'travertine', S, 0, 0, y, S, 1, PLINTH_H);
  y += PLINTH_H;
  addSolidPerimeter(buckets, S, 'stucco_cream', y, STORY_H * 0.82, 3, 6);
  addColumnRow(buckets, S, [1, 4, 8], 0, y, STORY_H * 0.98, 'wood_walnut');
  addBox(buckets, 'terracotta', S, 0, 1, y + STORY_H * 0.52, S, 2, TW * 0.11);
  addBox(buckets, 'stucco_pink', S, 1, 1, y + STORY_H * 0.54, 2, 1, TW * 0.09);
  addBox(buckets, 'terracotta', S, 4, 1, y + STORY_H * 0.54, 2, 1, TW * 0.09);
  addBox(buckets, 'wood_walnut', S, 0, 0, y + STORY_H * 0.62, 1, 1, TW * 0.28);
  addBox(buckets, 'wood_walnut', S, S - 1, 0, y + STORY_H * 0.62, 1, 1, TW * 0.28);
  addBox(buckets, 'wood', S, 2, 2, y, S - 4, S - 4, STORY_H * 0.68);
  y += STORY_H * 0.82;
  addRoofWithEaves(buckets, S, y, TW, 0, false, 'terracotta', 'wood_walnut');
  return bucketsToParts(buckets);
}

function buildDock(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  let y = 0;

  addBox(buckets, 'stone', S, 0, S - 4, y, S, 4, PLINTH_H);
  addBox(buckets, 'stucco_ochre', S, 2, 4, y + PLINTH_H, S - 4, S - 4, STORY_H * 0.72);
  addBox(buckets, 'wood_walnut', S, 2, 2, y + PLINTH_H, S - 4, S - 5, STORY_H * 0.68);
  addBox(buckets, 'roof_tile_dark', S, 2, 4, y + PLINTH_H + STORY_H * 0.68, S - 4, S - 4, TW * 0.1);
  const pierPosts = [1, 4, 8] as const;
  for (const x of pierPosts) {
    addBox(buckets, 'wood_walnut', S, x, 0, y, 1, 1, STORY_H * 0.58);
    addBox(buckets, 'wood', S, x, 1, y + STORY_H * 0.32, 1, 2, TW * 0.07);
  }
  addBox(buckets, 'wood_walnut', S, 0, 0, y + STORY_H * 0.4, S, 1, TW * 0.09);
  addBox(buckets, 'wood', S, 1, 3, y + PLINTH_H, 2, 2, STORY_H * 0.38);
  addBox(buckets, 'pool_water', S, 0, 0, y - TW * 0.02, 2, 2, TW * 0.02);
  return bucketsToParts(buckets);
}

function buildLumberCamp(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  let y = 0;

  addBox(buckets, 'dirt', S, 0, 0, y, S, S, TW * 0.04);
  addBox(buckets, 'wood_walnut', S, 2, 2, y, 6, 5, STORY_H * 0.48);
  addBox(buckets, 'stucco_ochre', S, 2, 2, y + STORY_H * 0.42, 6, 5, TW * 0.08);
  addBox(buckets, 'wood', S, 1, 1, y + STORY_H * 0.32, 1, 1, STORY_H * 0.42);
  addBox(buckets, 'wood', S, 8, 1, y + STORY_H * 0.32, 1, 1, STORY_H * 0.42);
  addBox(buckets, 'cypress_green', S, 7, 7, y, 2, 2, TW * 0.22);
  addBox(buckets, 'foliage', S, 0, 7, y, 2, 2, TW * 0.18);
  return bucketsToParts(buckets);
}

function buildTree(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  const cx = 4;
  const cz = 4;
  addBox(buckets, 'wood', S, cx, cz, 0, 2, 2, TW * 0.35);
  addBox(buckets, 'foliage', S, cx - 1, cz - 1, TW * 0.28, 4, 4, TW * 0.42);
  addBox(buckets, 'foliage', S, cx, cz, TW * 0.55, 2, 2, TW * 0.25);
  return bucketsToParts(buckets);
}

function buildRoad(material: MaterialKey): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  addBox(buckets, material, 1, 0, 0, 0, 1, 1, TW * 0.04);
  return bucketsToParts(buckets);
}

const STATIC_BUILDERS: Partial<Record<BuildingBakeKey, () => BakedMeshPart[]>> = {
  pottery_workshop: buildPotteryWorkshop,
  weaponsmith: buildWeaponsmith,
  farm_wheat: buildFarmWheat,
  trade_post: buildTradePost,
  oracle: buildOracle,
  dock: buildDock,
  lumber_camp: buildLumberCamp,
  tree: buildTree,
  dirt_path: () => buildRoad('road_dirt'),
  road: () => buildRoad('road_stone'),
  highway: () => buildRoad('road_highway'),
};

const CIVIC_BUILDERS: Record<
  (typeof CIVIC_EVOLUTION_TYPES)[number],
  (tier: CivicEvolutionTier) => BakedMeshPart[]
> = {
  forum: buildForum,
  warehouse: buildWarehouse,
  market: buildMarket,
  shrine: buildShrine,
  temple: buildTemple,
};

export function buildMacroBakedParts(key: BuildingBakeKey): BakedMeshPart[] | null {
  const civic = parseCivicKey(key);
  if (civic) return CIVIC_BUILDERS[civic.type](civic.tier);

  const builder = STATIC_BUILDERS[key];
  if (builder) return builder();
  return null;
}
