import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BakedMeshPart } from '../game/buildingMeshBake';
import type { MaterialKey } from '../game/buildingPalette';
import { SUB_CELL_WORLD_SIZE, SUB_CELLS_PER_TILE } from '../game/constants';
import { positionsFromBufferGeometry } from './bakedGeometryExtract';

export const GAP = 0.02;
export const TILE_CELLS = SUB_CELLS_PER_TILE;
export const TILE_WORLD = TILE_CELLS * SUB_CELL_WORLD_SIZE;

export type GeomBucket = Map<MaterialKey, THREE.BoxGeometry[]>;

export function tileWorld(cells: number): number {
  return cells * SUB_CELL_WORLD_SIZE;
}

export function addBox(
  buckets: GeomBucket,
  material: MaterialKey,
  S: number,
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

export function bucketsToParts(buckets: GeomBucket): BakedMeshPart[] {
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

export function countTrianglesInParts(parts: BakedMeshPart[]): number {
  let tris = 0;
  for (const part of parts) {
    tris += part.positions.length / 9;
  }
  return tris;
}

/** Closed perimeter with optional front door gap. */
export function addSolidPerimeter(
  buckets: GeomBucket,
  S: number,
  material: MaterialKey,
  y: number,
  wallH: number,
  doorX0 = 4,
  doorX1 = 5,
): void {
  const wall = (x: number, z: number, w: number, d: number) =>
    addBox(buckets, material, S, x, z, y, w, d, wallH);
  if (doorX0 > 0) wall(0, 0, doorX0, 1);
  if (doorX1 + 1 < S) wall(doorX1 + 1, 0, S - doorX1 - 1, 1);
  wall(0, S - 1, S, 1);
  wall(0, 1, 1, S - 2);
  wall(S - 1, 1, 1, S - 2);
}

export function addFootingBand(
  buckets: GeomBucket,
  S: number,
  y: number,
  h: number,
  material: MaterialKey = 'limestone',
): void {
  addBox(buckets, material, S, 0, 0, y, S, 1, h);
  addBox(buckets, material, S, 0, S - 1, y, S, 1, h);
  addBox(buckets, material, S, 0, 1, y, 1, S - 2, h);
  addBox(buckets, material, S, S - 1, 1, y, 1, S - 2, h);
}

export function addQuoinCorners(
  buckets: GeomBucket,
  S: number,
  y: number,
  wallH: number,
  material: MaterialKey = 'limestone',
): void {
  const h = wallH * 1.02;
  addBox(buckets, material, S, 0, 0, y, 1, 1, h);
  addBox(buckets, material, S, S - 1, 0, y, 1, 1, h);
  addBox(buckets, material, S, 0, S - 1, y, 1, 1, h);
  addBox(buckets, material, S, S - 1, S - 1, y, 1, 1, h);
}

export function addRecessedDoor(
  buckets: GeomBucket,
  S: number,
  y: number,
  wallH: number,
  doorX0 = 4,
  doorX1 = 5,
): void {
  const span = doorX1 - doorX0 + 1;
  if (doorX0 > 0) addBox(buckets, 'limestone', S, doorX0 - 1, 0, y, 1, 1, wallH);
  if (doorX1 + 1 < S) addBox(buckets, 'limestone', S, doorX1 + 1, 0, y, 1, 1, wallH);
  addBox(buckets, 'limestone', S, doorX0 - 1, 0, y + wallH * 0.76, span + 2, 1, wallH * 0.14);
  addBox(buckets, 'wood', S, doorX0, 1, y, span, 1, wallH * 0.86);
}

export function addRoofWithEaves(
  buckets: GeomBucket,
  S: number,
  y: number,
  tile: number,
  inset = 1,
  withRidge = true,
  tileMat: MaterialKey = 'terracotta',
  ridgeMat: MaterialKey = 'roof_tile_dark',
): void {
  const eavesH = tile * 0.08;
  const capH = tile * 0.34 - eavesH;
  const ridgeH = tile * 0.06;
  addBox(buckets, tileMat, S, 0, 0, y, S, 1, eavesH);
  addBox(buckets, tileMat, S, 0, S - 1, y, S, 1, eavesH);
  addBox(buckets, tileMat, S, 0, 0, y, 1, S, eavesH);
  addBox(buckets, tileMat, S, S - 1, 0, y, 1, S, eavesH);
  const capY = y + eavesH * 0.55;
  const span = S - inset * 2;
  addBox(buckets, tileMat, S, inset, inset, capY, span, span, capH);
  if (withRidge && span > 4) {
    addBox(buckets, ridgeMat, S, inset + 2, inset + 1, capY + capH, span - 4, 2, ridgeH);
  }
}

/** Alternating awning stripes along front (market stalls). */
export function addStripedAwning(
  buckets: GeomBucket,
  S: number,
  z: number,
  y: number,
  h: number,
  x0 = 0,
  x1 = S - 1,
): void {
  for (let x = x0; x <= x1; x++) {
    addBox(buckets, x % 2 === 0 ? 'terracotta' : 'stucco_pink', S, x, z, y, 1, 1, h);
  }
}

export function addColumnRow(
  buckets: GeomBucket,
  S: number,
  xs: readonly number[],
  z: number,
  y: number,
  colH: number,
  material: MaterialKey = 'marble',
): void {
  for (const x of xs) {
    if (x >= 0 && x < S) addBox(buckets, material, S, x, z, y, 1, 1, colH);
  }
}

export function addPediment(
  buckets: GeomBucket,
  S: number,
  x0: number,
  x1: number,
  z: number,
  y: number,
  h: number,
): void {
  const span = x1 - x0 + 1;
  addBox(buckets, 'limestone', S, x0, z, y, span, 1, h);
}
