import { describe, expect, it } from 'vitest';
import type { ChunkRecord } from '../game/chunkManager';
import { subKey } from '../game/chunkCoords';
import { buildWaterSurfaceGeometry } from './terrainChunkMesh';

function emptyChunk(cx: number, cy: number): ChunkRecord {
  return {
    cx,
    cy,
    cells: new Map(),
    anchors: new Map(),
    constructionSites: new Map(),
    deposits: new Map(),
    fluids: new Map(),
    elevation: new Map(),
    terrain: new Map(),
    traffic: new Map(),
    loaded: true,
    contentRevision: 0,
  };
}

describe('terrainChunkMesh', () => {
  it('skips water surface on dug sub-cells', () => {
    const chunk = emptyChunk(0, 0);
    const sx = 5;
    const sz = 5;
    chunk.fluids.set(subKey(sx, sz), 'water');
    chunk.elevation.set(subKey(sx, sz), 0.4);
    chunk.terrain.set(subKey(sx, sz), { dugDepth: 2 });

    const geom = buildWaterSurfaceGeometry(
      chunk,
      1,
      () => 0.4,
      () => 0x2b7fd4,
      (x, z) => chunk.fluids.get(subKey(x, z)) === 'water',
      (x, z) => chunk.terrain.get(subKey(x, z))?.dugDepth ?? 0,
      0.001,
    );
    expect(geom).toBeNull();
  });

  it('renders water on undug fluid cells', () => {
    const chunk = emptyChunk(0, 0);
    const sx = 2;
    const sz = 3;
    chunk.fluids.set(subKey(sx, sz), 'water');
    chunk.elevation.set(subKey(sx, sz), 0.42);

    const geom = buildWaterSurfaceGeometry(
      chunk,
      1,
      () => 0.42,
      () => 0x2b7fd4,
      (x, z) => chunk.fluids.get(subKey(x, z)) === 'water',
      () => 0,
      0.001,
    );
    expect(geom).not.toBeNull();
    const pos = geom!.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);
    geom!.dispose();
  });
});
