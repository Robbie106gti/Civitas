import { isPassableSubCell } from './passability';
import type { BuildingType } from '../types';

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function heuristic(ax: number, az: number, bx: number, bz: number): number {
  return Math.abs(ax - bx) + Math.abs(az - bz);
}

/** Binary min-heap ordered by f-score for A* open set. */
class MinHeap {
  private readonly keys: string[] = [];
  private readonly fScore: Map<string, number>;

  constructor(fScore: Map<string, number>) {
    this.fScore = fScore;
  }

  get size(): number {
    return this.keys.length;
  }

  push(key: string): void {
    this.keys.push(key);
    this.bubbleUp(this.keys.length - 1);
  }

  pop(): string {
    const top = this.keys[0]!;
    const last = this.keys.pop()!;
    if (this.keys.length > 0) {
      this.keys[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private score(i: number): number {
    return this.fScore.get(this.keys[i]!) ?? Infinity;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.score(i) >= this.score(parent)) break;
      [this.keys[i], this.keys[parent]] = [this.keys[parent]!, this.keys[i]!];
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.keys.length;
    while (true) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < n && this.score(left) < this.score(smallest)) smallest = left;
      if (right < n && this.score(right) < this.score(smallest)) smallest = right;
      if (smallest === i) break;
      [this.keys[i], this.keys[smallest]] = [this.keys[smallest]!, this.keys[i]!];
      i = smallest;
    }
  }
}

export function findPath(
  startSx: number,
  startSz: number,
  goalSx: number,
  goalSz: number,
  getBuilding: (sx: number, sz: number) => BuildingType | null,
  maxSteps = 120,
): { sx: number; sz: number }[] | null {
  const startKey = `${startSx},${startSz}`;
  const goalKey = `${goalSx},${goalSz}`;
  if (startKey === goalKey) return [];

  const cameFrom = new Map<string, string>();
  const gScore = new Map<string, number>([[startKey, 0]]);
  const fScore = new Map<string, number>([[startKey, heuristic(startSx, startSz, goalSx, goalSz)]]);
  const open = new MinHeap(fScore);
  open.push(startKey);

  while (open.size > 0) {
    const current = open.pop();

    if (current === goalKey) {
      const path: { sx: number; sz: number }[] = [];
      let cur: string | undefined = current;
      while (cur && cur !== startKey) {
        const [xs, zs] = cur.split(',');
        path.unshift({ sx: Number(xs), sz: Number(zs) });
        cur = cameFrom.get(cur);
      }
      return path.slice(0, maxSteps);
    }

    const [cxs, czs] = current.split(',');
    const cx = Number(cxs);
    const cz = Number(czs);
    const curG = gScore.get(current) ?? Infinity;

    for (const [dx, dz] of NEIGHBORS) {
      const nx = cx + dx;
      const nz = cz + dz;
      const nKey = `${nx},${nz}`;
      const building = getBuilding(nx, nz);
      const goalHere = nx === goalSx && nz === goalSz;
      if (!goalHere && !isPassableSubCell(building)) continue;

      const tentative = curG + 1;
      if (tentative >= maxSteps) continue;
      if (tentative >= (gScore.get(nKey) ?? Infinity)) continue;

      cameFrom.set(nKey, current);
      gScore.set(nKey, tentative);
      const f = tentative + heuristic(nx, nz, goalSx, goalSz);
      fScore.set(nKey, f);
      open.push(nKey);
    }
  }

  return null;
}
