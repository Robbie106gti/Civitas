/**
 * Bake procedural terrain sections to `public/terrain/{worldSeed}/`.
 * Run: npm run bake-terrain
 * Optional env: BAKE_SEED=42069 BAKE_RADIUS=10
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_WORLD_SEED } from '../src/lib/game/constants';
import {
  encodeTerrainSection,
  generateTerrainSection,
  terrainSectionFileName,
  TERRAIN_BAKE_RADIUS_CHUNKS,
} from '../src/lib/game/terrainSection';

const worldSeed = Number(process.env.BAKE_SEED ?? DEFAULT_WORLD_SEED);
const radius = Number(process.env.BAKE_RADIUS ?? TERRAIN_BAKE_RADIUS_CHUNKS);
const outDir = join(process.cwd(), 'public', 'terrain', String(worldSeed));

mkdirSync(outDir, { recursive: true });

let count = 0;
for (let cy = -radius; cy <= radius; cy++) {
  for (let cx = -radius; cx <= radius; cx++) {
    const section = generateTerrainSection(cx, cy, worldSeed);
    const bytes = encodeTerrainSection(section);
    writeFileSync(join(outDir, terrainSectionFileName(cx, cy)), bytes);
    count++;
  }
}

console.log(`Baked ${count} terrain sections → ${outDir}`);
