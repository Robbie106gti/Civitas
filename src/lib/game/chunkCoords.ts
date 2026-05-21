import { CHUNK_SIZE } from './constants';

export function subKey(sx: number, sz: number): string {
  return `${sx},${sz}`;
}

export function parseSubKey(key: string): { sx: number; sz: number } | null {
  const [xs, zs] = key.split(',');
  const sx = Number(xs);
  const sz = Number(zs);
  if (Number.isNaN(sx) || Number.isNaN(sz)) return null;
  return { sx, sz };
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

export function parseChunkKey(key: string): { cx: number; cy: number } | null {
  const [xc, yc] = key.split(',');
  const cx = Number(xc);
  const cy = Number(yc);
  if (Number.isNaN(cx) || Number.isNaN(cy)) return null;
  return { cx, cy };
}

export function subToChunk(sx: number, sz: number): { cx: number; cy: number } {
  return {
    cx: Math.floor(sx / CHUNK_SIZE),
    cy: Math.floor(sz / CHUNK_SIZE),
  };
}

export function chunkOrigin(cx: number, cy: number): { minSx: number; minSz: number } {
  return { minSx: cx * CHUNK_SIZE, minSz: cy * CHUNK_SIZE };
}
