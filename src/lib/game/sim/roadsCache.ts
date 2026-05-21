import { parseSubKey } from '../chunkCoords';
import { isRoadType } from '../footprints';
import type { BuildingType } from '../types';

/** Cached road sub-cells for walker / engineer routing (invalidated when roads change). */
export function collectRoadCells(buildings: Map<string, BuildingType>): { sx: number; sz: number }[] {
  const roads: { sx: number; sz: number }[] = [];
  for (const [key, type] of buildings) {
    if (!isRoadType(type)) continue;
    const p = parseSubKey(key);
    if (p) roads.push(p);
  }
  return roads;
}

/** Count road sub-cells (O(n) full scan — use incrementally via `adjustRoadCellCount`). */
export function countRoadCells(buildings: Map<string, BuildingType>): number {
  let n = 0;
  for (const type of buildings.values()) {
    if (isRoadType(type)) n += 1;
  }
  return n;
}

export function adjustRoadCellCount(
  count: number,
  prev: BuildingType | null | undefined,
  next: BuildingType | null | undefined,
): number {
  const wasRoad = prev != null && isRoadType(prev);
  const isRoad = next != null && isRoadType(next);
  if (wasRoad === isRoad) return count;
  if (isRoad) return count + 1;
  return Math.max(0, count - 1);
}

export function mapHasRoadFromCount(roadCellCount: number): boolean {
  return roadCellCount > 0;
}

export function pickRandomRoad(
  roads: { sx: number; sz: number }[],
): { sx: number; sz: number } | null {
  if (roads.length === 0) return null;
  return roads[Math.floor(Math.random() * roads.length)]!;
}

export function nearestRoadTo(
  cx: number,
  cz: number,
  roads: { sx: number; sz: number }[],
): { sx: number; sz: number } | null {
  let best: { sx: number; sz: number; dist: number } | null = null;
  for (const p of roads) {
    const dist = Math.hypot(p.sx - cx, p.sz - cz);
    if (!best || dist < best.dist) best = { sx: p.sx, sz: p.sz, dist };
  }
  return best ? { sx: best.sx, sz: best.sz } : null;
}
