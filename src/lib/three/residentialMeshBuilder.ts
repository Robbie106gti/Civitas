import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BakedMeshPart } from '../game/buildingMeshBake';
import type { MaterialKey } from '../game/buildingPalette';
import { SUB_CELL_WORLD_SIZE, SUB_CELLS_PER_TILE } from '../game/constants';
import type { ResidentialVariant } from '../game/residentialBlueprints';
import { positionsFromBufferGeometry } from './bakedGeometryExtract';

const S = SUB_CELLS_PER_TILE;
const GAP = 0.02;
const unit = SUB_CELL_WORLD_SIZE - GAP;

/** One macro tile in world units (footprint is S×S sub-cells). */
const TILE_WORLD = S * SUB_CELL_WORLD_SIZE;

/** Vertical bands — tile-scaled so housing reads from the isometric camera. */
const PLINTH_H = TILE_WORLD * 0.12;
const FOOTING_H = TILE_WORLD * 0.04;
const STORY_H = TILE_WORLD * 0.48;
const ROOF_CAP_H = TILE_WORLD * 0.34;
const EAVES_H = TILE_WORLD * 0.08;
const RIDGE_H = TILE_WORLD * 0.06;
const ROOF_RING_H = TILE_WORLD * 0.2;
const PARAPET_H = TILE_WORLD * 0.15;
const COURT_PIT_DEPTH = TILE_WORLD * 0.07;
const IMPLUVIUM_DEPTH = TILE_WORLD * 0.05;
const WINDOW_H = TILE_WORLD * 0.1;

type GeomBucket = Map<MaterialKey, THREE.BoxGeometry[]>;

function addBox(
  buckets: GeomBucket,
  material: MaterialKey,
  x: number,
  z: number,
  y: number,
  wCells: number,
  dCells: number,
  hWorld: number,
): void {
  const w = wCells * SUB_CELL_WORLD_SIZE - (wCells > 1 ? GAP : 0);
  const d = dCells * SUB_CELL_WORLD_SIZE - (dCells > 1 ? GAP : 0);
  const geom = new THREE.BoxGeometry(w, hWorld, d);
  geom.translate(
    x * SUB_CELL_WORLD_SIZE + (wCells * SUB_CELL_WORLD_SIZE) / 2,
    y + hWorld / 2,
    z * SUB_CELL_WORLD_SIZE + (dCells * SUB_CELL_WORLD_SIZE) / 2,
  );
  const list = buckets.get(material) ?? [];
  list.push(geom);
  buckets.set(material, list);
}

function addWallSlab(
  buckets: GeomBucket,
  material: MaterialKey,
  x: number,
  z: number,
  y: number,
  wCells: number,
  dCells: number,
  wallH: number = STORY_H,
): void {
  addBox(buckets, material, x, z, y, wCells, dCells, wallH);
}

/** Closed perimeter with optional front door gap. */
function addSolidPerimeter(
  buckets: GeomBucket,
  material: MaterialKey,
  y: number,
  doorX0 = 4,
  doorX1 = 5,
  wallH: number = STORY_H,
): void {
  if (doorX0 > 0) addWallSlab(buckets, material, 0, 0, y, doorX0, 1, wallH);
  if (doorX1 + 1 < S) addWallSlab(buckets, material, doorX1 + 1, 0, y, S - doorX1 - 1, 1, wallH);
  addWallSlab(buckets, material, 0, S - 1, y, S, 1, wallH);
  addWallSlab(buckets, material, 0, 1, y, 1, S - 2, wallH);
  addWallSlab(buckets, material, S - 1, 1, y, 1, S - 2, wallH);
}

/** Perimeter ring around a central courtyard (compluvium / atrium). */
function addCourtyardWalls(
  buckets: GeomBucket,
  material: MaterialKey,
  y: number,
  courtMin: number,
  courtMax: number,
  doorX0 = 4,
  doorX1 = 5,
  wallH: number = STORY_H,
): void {
  if (doorX0 >= 0) {
    if (doorX0 > 0) addWallSlab(buckets, material, 0, 0, y, doorX0, 1, wallH);
    if (doorX1 + 1 < S) addWallSlab(buckets, material, doorX1 + 1, 0, y, S - doorX1 - 1, 1, wallH);
  } else {
    addWallSlab(buckets, material, 0, 0, y, S, 1, wallH);
  }

  if (courtMin > 0) addWallSlab(buckets, material, 0, S - 1, y, courtMin, 1, wallH);
  if (courtMax + 1 < S) addWallSlab(buckets, material, courtMax + 1, S - 1, y, S - 1 - courtMax, 1, wallH);

  if (courtMin > 0) addWallSlab(buckets, material, 0, 1, y, 1, courtMin, wallH);
  if (courtMax + 1 < S) addWallSlab(buckets, material, 0, courtMax + 1, y, 1, S - 1 - courtMax, wallH);
  if (courtMin > 0) addWallSlab(buckets, material, S - 1, 1, y, 1, courtMin, wallH);
  if (courtMax + 1 < S) addWallSlab(buckets, material, S - 1, courtMax + 1, y, 1, S - 1 - courtMax, wallH);

  if (courtMin > 1) {
    addWallSlab(buckets, material, 0, 1, y, courtMin, courtMin - 1, wallH);
    addWallSlab(buckets, material, courtMax + 1, 1, y, S - 1 - courtMax, courtMin - 1, wallH);
  }
  if (courtMax + 1 < S - 1) {
    addWallSlab(buckets, material, 0, courtMax + 1, y, courtMin, S - 1 - courtMax, wallH);
    addWallSlab(buckets, material, courtMax + 1, courtMax + 1, y, S - 1 - courtMax, S - 1 - courtMax, wallH);
  }
}

/** Terracotta roof frame around an open courtyard (four macro slabs). */
function addRoofRing(
  buckets: GeomBucket,
  material: MaterialKey,
  y: number,
  holeMin: number,
  holeMax: number,
  roofH: number = ROOF_RING_H,
): void {
  const span = holeMax - holeMin + 1;
  addBox(buckets, material, 0, 0, y, S, holeMin, roofH);
  addBox(buckets, material, 0, holeMax + 1, y, S, S - 1 - holeMax, roofH);
  addBox(buckets, material, 0, holeMin, y, holeMin, span, roofH);
  addBox(buckets, material, holeMax + 1, holeMin, y, S - 1 - holeMax, span, roofH);
}

/** Limestone footing band on top of plinth (perimeter ring). */
function addFootingBand(buckets: GeomBucket, y: number, material: MaterialKey = 'limestone'): void {
  addBox(buckets, material, 0, 0, y, S, 1, FOOTING_H);
  addBox(buckets, material, 0, S - 1, y, S, 1, FOOTING_H);
  addBox(buckets, material, 0, 1, y, 1, S - 2, FOOTING_H);
  addBox(buckets, material, S - 1, 1, y, 1, S - 2, FOOTING_H);
}

/** Corner quoins — limestone vertical accents. */
function addQuoinCorners(buckets: GeomBucket, y: number, wallH: number): void {
  const h = wallH * 1.02;
  addBox(buckets, 'limestone', 0, 0, y, 1, 1, h);
  addBox(buckets, 'limestone', S - 1, 0, y, 1, 1, h);
  addBox(buckets, 'limestone', 0, S - 1, y, 1, 1, h);
  addBox(buckets, 'limestone', S - 1, S - 1, y, 1, 1, h);
}

/** Recessed door: pilasters + lintel at front, wood panel one cell inward. */
function addRecessedDoor(
  buckets: GeomBucket,
  y: number,
  doorX0 = 4,
  doorX1 = 5,
  wallH: number = STORY_H,
): void {
  const span = doorX1 - doorX0 + 1;
  if (doorX0 > 0) addBox(buckets, 'limestone', doorX0 - 1, 0, y, 1, 1, wallH);
  if (doorX1 + 1 < S) addBox(buckets, 'limestone', doorX1 + 1, 0, y, 1, 1, wallH);
  addBox(buckets, 'limestone', doorX0 - 1, 0, y + wallH * 0.76, span + 2, 1, wallH * 0.14);
  addBox(buckets, 'wood', doorX0, 1, y, span, 1, wallH * 0.86);
}

/** Narrow window slits on side/back walls. */
function addWindowSlits(
  buckets: GeomBucket,
  y: number,
  slots: readonly { x: number; z: number }[],
  wallH: number = STORY_H,
): void {
  const wy = y + wallH * 0.42;
  for (const { x, z } of slots) {
    addBox(buckets, 'wood', x, z, wy, 1, 1, WINDOW_H);
  }
}

/** Terracotta eaves lip + main roof deck + optional ridge. */
function addRoofWithEaves(
  buckets: GeomBucket,
  y: number,
  inset = 1,
  withRidge = true,
): void {
  addBox(buckets, 'terracotta', 0, 0, y, S, 1, EAVES_H);
  addBox(buckets, 'terracotta', 0, S - 1, y, S, 1, EAVES_H);
  addBox(buckets, 'terracotta', 0, 0, y, 1, S, EAVES_H);
  addBox(buckets, 'terracotta', S - 1, 0, y, 1, S, EAVES_H);
  const capY = y + EAVES_H * 0.55;
  const span = S - inset * 2;
  addBox(buckets, 'terracotta', inset, inset, capY, span, span, ROOF_CAP_H - EAVES_H);
  if (withRidge) {
    addBox(buckets, 'terracotta', inset + 2, inset + 1, capY + ROOF_CAP_H - EAVES_H, span - 4, 2, RIDGE_H);
  }
}

/** Darker impluvium basin in courtyard center. */
function addImpluviumBasin(
  buckets: GeomBucket,
  y: number,
  courtMin: number,
  courtMax: number,
): void {
  const cx = Math.floor((courtMin + courtMax) / 2);
  const cz = Math.floor((courtMin + courtMax) / 2);
  addBox(buckets, 'stone', cx, cz, y, 2, 2, IMPLUVIUM_DEPTH);
  addBox(buckets, 'limestone', cx - 1, cz - 1, y, 4, 4, COURT_PIT_DEPTH * 0.35);
}

/** Villa portico — white marble columns + bronze-accent pediment. */
function addPortico(buckets: GeomBucket, y: number, wallH: number): void {
  const cols = [1, 3, 6, 8] as const;
  for (const x of cols) {
    addBox(buckets, 'marble_white', x, 0, y, 1, 1, wallH * 1.05);
  }
  addBox(buckets, 'limestone', 1, 0, y + wallH * 0.94, 8, 1, wallH * 0.12);
  addBox(buckets, 'bronze', 2, 0, y + wallH * 0.98, 6, 1, wallH * 0.05);
}

function bucketsToParts(buckets: GeomBucket): BakedMeshPart[] {
  const parts: BakedMeshPart[] = [];
  for (const [materialKey, geoms] of buckets) {
    if (!geoms.length) continue;
    const merged = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!merged?.attributes.position) continue;
    const positions = positionsFromBufferGeometry(merged);
    merged.dispose();
    parts.push({ materialKey, positions });
  }
  return parts;
}

/** Compact insula cell — cream stucco, walnut shutters, dark tile roof. */
function buildHutParts(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  let y = 0;

  addBox(buckets, 'limestone', 0, 0, y, S, 1, PLINTH_H);
  y += PLINTH_H;
  addFootingBand(buckets, y, 'travertine');
  y += FOOTING_H;

  addSolidPerimeter(buckets, 'stucco_cream', y);
  addQuoinCorners(buckets, y, STORY_H);
  addRecessedDoor(buckets, y);
  addWindowSlits(buckets, y, [
    { x: 0, z: 4 },
    { x: 0, z: 5 },
    { x: S - 1, z: 3 },
    { x: S - 1, z: 7 },
  ]);
  y += STORY_H;

  addBox(buckets, 'terracotta', 0, 0, y, S, 1, EAVES_H);
  addBox(buckets, 'terracotta', 0, S - 1, y, S, 1, EAVES_H);
  addBox(buckets, 'terracotta', 0, 0, y, 1, S, EAVES_H);
  addBox(buckets, 'terracotta', S - 1, 0, y, 1, S, EAVES_H);
  const capY = y + EAVES_H * 0.55;
  addBox(buckets, 'roof_tile_dark', 1, 1, capY, S - 2, S - 2, ROOF_CAP_H - EAVES_H);
  addBox(buckets, 'roof_tile_dark', 3, 2, capY + ROOF_CAP_H - EAVES_H, S - 6, 2, RIDGE_H);
  return bucketsToParts(buckets);
}

/** Domus — atrium courtyard, inward second floor, compluvium roof ring. */
function buildDomusParts(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  const courtMin = 3;
  const courtMax = 6;
  const upperH = STORY_H * 0.88;
  let y = 0;

  addBox(buckets, 'limestone', 0, 0, y, S, 1, PLINTH_H);
  y += PLINTH_H;
  addFootingBand(buckets, y);
  y += FOOTING_H;

  addCourtyardWalls(buckets, 'stucco_ochre', y, courtMin, courtMax);
  const courtSpan = courtMax - courtMin + 1;
  addBox(buckets, 'dirt', courtMin, courtMin, y, courtSpan, courtSpan, COURT_PIT_DEPTH);
  addImpluviumBasin(buckets, y, courtMin, courtMax);
  addQuoinCorners(buckets, y, STORY_H);
  addRecessedDoor(buckets, y);
  y += STORY_H;

  addCourtyardWalls(buckets, 'stucco_ochre', y, courtMin, courtMax, -1, -1, upperH);
  addBox(buckets, 'stucco_pink', 1, 1, y, 2, 2, upperH * 0.92);
  addBox(buckets, 'stucco_pink', S - 3, 1, y, 2, 2, upperH * 0.92);
  y += upperH;

  addRoofRing(buckets, 'terracotta', y, courtMin, courtMax);
  return bucketsToParts(buckets);
}

/** Villa — marble plinth, portico columns, setback upper ring, parapet + roof. */
function buildVillaParts(): BakedMeshPart[] {
  const buckets: GeomBucket = new Map();
  const courtMin = 2;
  const courtMax = 7;
  const upperH = STORY_H * 0.92;
  let y = 0;

  addBox(buckets, 'marble_white', 0, 0, y, S, 1, PLINTH_H);
  y += PLINTH_H;
  addFootingBand(buckets, y, 'marble_white');
  y += FOOTING_H;

  addCourtyardWalls(buckets, 'stucco_cream', y, courtMin, courtMax);
  const courtSpan = courtMax - courtMin + 1;
  addBox(buckets, 'dirt', courtMin, courtMin, y, courtSpan, courtSpan, COURT_PIT_DEPTH);
  addImpluviumBasin(buckets, y, courtMin, courtMax);
  addQuoinCorners(buckets, y, STORY_H);
  addPortico(buckets, y, STORY_H);
  addRecessedDoor(buckets, y);
  addBox(buckets, 'bronze', 4, 0, y + STORY_H * 0.82, 2, 1, STORY_H * 0.08);
  y += STORY_H;

  const inset = 1;
  addCourtyardWalls(buckets, 'stucco_ochre', y, courtMin + inset, courtMax - inset, -1, -1, upperH);
  addBox(buckets, 'stucco_pink', 1, S - 3, y, S - 2, 2, upperH);
  y += upperH;

  addRoofRing(buckets, 'terracotta', y, courtMin, courtMax);
  y += ROOF_RING_H;
  addBox(buckets, 'marble_white', 1, 1, y, S - 2, 1, PARAPET_H);
  addBox(buckets, 'marble_white', 1, S - 2, y, S - 2, 1, PARAPET_H);
  addBox(buckets, 'marble_white', 1, 2, y, 1, S - 4, PARAPET_H);
  addBox(buckets, 'marble_white', S - 2, 2, y, 1, S - 4, PARAPET_H);
  addBox(buckets, 'bronze', 4, 4, y, 2, 2, PARAPET_H * 0.5);
  return bucketsToParts(buckets);
}

const BUILDERS: Record<ResidentialVariant, () => BakedMeshPart[]> = {
  hut: buildHutParts,
  domus: buildDomusParts,
  villa: buildVillaParts,
};

export function buildResidentialBakedParts(variant: ResidentialVariant): BakedMeshPart[] {
  return BUILDERS[variant]();
}

export function residentialBakeKeyVariant(bakeKey: string): ResidentialVariant | null {
  if (!bakeKey.startsWith('house-')) return null;
  const v = bakeKey.slice('house-'.length);
  if (v === 'hut' || v === 'domus' || v === 'villa') return v;
  return null;
}

/** Approximate triangle count from baked parts (non-indexed merged boxes). */
export function countTrianglesInParts(parts: BakedMeshPart[]): number {
  let tris = 0;
  for (const part of parts) {
    tris += part.positions.length / 9;
  }
  return tris;
}
