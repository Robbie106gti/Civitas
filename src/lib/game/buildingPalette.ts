/** Material keys for voxel building blueprints (0 = empty in compact matrices). */
export type MaterialKey =
  | 'stone'
  | 'limestone'
  | 'travertine'
  | 'stucco'
  | 'stucco_cream'
  | 'stucco_ochre'
  | 'stucco_pink'
  | 'plaster_white'
  | 'wood'
  | 'wood_walnut'
  | 'roof'
  | 'terracotta'
  | 'roof_tile_dark'
  | 'marble'
  | 'marble_white'
  | 'bronze'
  | 'dirt'
  | 'crop'
  | 'crop_green'
  | 'clay_raw'
  | 'foliage'
  | 'cypress_green'
  | 'pool_water'
  | 'iron_dark'
  | 'ember_glow'
  | 'road_dirt'
  | 'road_stone'
  | 'road_highway';

export type VoxelCell = MaterialKey | 0;

export interface MaterialDef {
  color: number;
  roughness?: number;
  metalness?: number;
}

export const BUILDING_PALETTE: Record<MaterialKey, MaterialDef> = {
  stone: { color: 0x8a8580, roughness: 0.9 },
  limestone: { color: 0xd4c9b0, roughness: 0.88 },
  travertine: { color: 0xe0d4c0, roughness: 0.82 },
  stucco: { color: 0xf2e8d5, roughness: 0.9 },
  stucco_cream: { color: 0xf2e8d5, roughness: 0.9 },
  stucco_ochre: { color: 0xe8c89a, roughness: 0.88 },
  stucco_pink: { color: 0xe8b4a8, roughness: 0.89 },
  plaster_white: { color: 0xfaf8f2, roughness: 0.92 },
  wood: { color: 0x8b5a2b, roughness: 0.85 },
  wood_walnut: { color: 0x6b4226, roughness: 0.84 },
  roof: { color: 0xb85c38, roughness: 0.82 },
  terracotta: { color: 0xc4622d, roughness: 0.8 },
  roof_tile_dark: { color: 0x8b3a2a, roughness: 0.78 },
  marble: { color: 0xede6dc, roughness: 0.35, metalness: 0.05 },
  marble_white: { color: 0xf5f0e8, roughness: 0.32, metalness: 0.06 },
  bronze: { color: 0xb8860b, roughness: 0.45, metalness: 0.55 },
  dirt: { color: 0x9a7b4f, roughness: 0.95 },
  crop: { color: 0xc9a227, roughness: 0.9 },
  crop_green: { color: 0x7ba428, roughness: 0.88 },
  clay_raw: { color: 0xd4835b, roughness: 0.9 },
  foliage: { color: 0x4a6741, roughness: 0.9 },
  cypress_green: { color: 0x3d5c3a, roughness: 0.88 },
  pool_water: { color: 0x4a90a8, roughness: 0.25, metalness: 0.08 },
  iron_dark: { color: 0x3d4450, roughness: 0.75, metalness: 0.2 },
  ember_glow: { color: 0xff6b35, roughness: 0.7, metalness: 0.1 },
  road_dirt: { color: 0x8b7355, roughness: 0.95 },
  road_stone: { color: 0x4a4a4a, roughness: 0.9 },
  road_highway: { color: 0x2a2a2a, roughness: 0.85 },
};

/** ASCII legend char → material for hand-authored blueprints ('.' = empty in parser). */
export const VOXEL_LEGEND: Record<string, MaterialKey> = {
  l: 'limestone',
  v: 'travertine',
  s: 'stucco',
  C: 'stucco_cream',
  O: 'stucco_ochre',
  P: 'stucco_pink',
  w: 'wood',
  W: 'wood_walnut',
  r: 'roof',
  t: 'terracotta',
  R: 'roof_tile_dark',
  m: 'marble',
  M: 'marble_white',
  b: 'bronze',
  d: 'dirt',
  o: 'stone',
  c: 'crop',
  G: 'crop_green',
  K: 'clay_raw',
  f: 'foliage',
  y: 'cypress_green',
  p: 'pool_water',
  i: 'iron_dark',
  e: 'ember_glow',
  D: 'road_dirt',
  S: 'road_stone',
  H: 'road_highway',
};
