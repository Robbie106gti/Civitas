import type { MaterialKey, VoxelCell } from './buildingPalette';

/** Declarative voxel model: [y][z][x], y = 0 is ground. Cell is material key or 0 (empty). */
export interface VoxelBlueprint {
  layers: VoxelCell[][][];
}

const EMPTY = 0 as const;

/** Parse one Y slice from ASCII rows (row index = z, column = x). '.' = empty. */
export function layerFromAscii(
  rows: readonly string[],
  legend: Record<string, MaterialKey>,
): VoxelCell[][] {
  return rows.map((row) =>
    [...row].map((ch) => (ch === '.' ? EMPTY : (legend[ch] ?? EMPTY))),
  );
}

/** Stack ASCII slices into a full blueprint. */
export function blueprintFromAsciiLayers(
  slices: readonly (readonly string[])[],
  legend: Record<string, MaterialKey>,
): VoxelBlueprint {
  return { layers: slices.map((rows) => layerFromAscii(rows, legend)) };
}

/** Solid box fill (roads, simple factories). */
export function solidBlueprint(
  w: number,
  h: number,
  material: MaterialKey,
  height = 1,
): VoxelBlueprint {
  const slice: VoxelCell[][] = [];
  for (let z = 0; z < h; z++) {
    const row: VoxelCell[] = [];
    for (let x = 0; x < w; x++) row.push(material);
    slice.push(row);
  }
  const layers: VoxelCell[][][] = [];
  for (let y = 0; y < height; y++) {
    layers.push(slice.map((r) => [...r]));
  }
  return { layers };
}

export function isFilledCell(cell: VoxelCell): cell is MaterialKey {
  return cell !== 0;
}
