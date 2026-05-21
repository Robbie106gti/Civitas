import {
  bakedTerrainUrl,
  decodeTerrainSection,
  type TerrainSection,
} from './terrainSection';

const bakedSections = new Map<string, TerrainSection>();

function cacheKey(worldSeed: number, cx: number, cy: number): string {
  return `${worldSeed}:${cx},${cy}`;
}

export function getCachedBakedSection(
  worldSeed: number,
  cx: number,
  cy: number,
): TerrainSection | null {
  return bakedSections.get(cacheKey(worldSeed, cx, cy)) ?? null;
}

export function cacheBakedSection(section: TerrainSection): void {
  bakedSections.set(cacheKey(section.worldSeed, section.cx, section.cy), section);
}

/** Load baked sections from `public/terrain/{seed}/` (browser); procedural fallback when missing. */
export async function prefetchBakedTerrainSections(
  worldSeed: number,
  centerCx: number,
  centerCy: number,
  radiusChunks: number,
): Promise<number> {
  if (typeof fetch === 'undefined') return 0;

  const tasks: Promise<void>[] = [];
  let loaded = 0;

  for (let dy = -radiusChunks; dy <= radiusChunks; dy++) {
    for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
      const cx = centerCx + dx;
      const cy = centerCy + dy;
      const key = cacheKey(worldSeed, cx, cy);
      if (bakedSections.has(key)) continue;

      tasks.push(
        (async () => {
          try {
            const res = await fetch(bakedTerrainUrl(worldSeed, cx, cy));
            if (!res.ok) return;
            const section = decodeTerrainSection(new Uint8Array(await res.arrayBuffer()));
            if (section && section.worldSeed === worldSeed) {
              cacheBakedSection(section);
              loaded++;
            }
          } catch {
            /* offline or missing bake */
          }
        })(),
      );
    }
  }

  await Promise.all(tasks);
  return loaded;
}

export function clearBakedTerrainCache(): void {
  bakedSections.clear();
}
