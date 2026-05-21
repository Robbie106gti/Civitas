/**
 * Bake merged building meshes to `public/buildings/{bakeKey}.bin`.
 * Run: npm run bake-buildings
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { allBuildingBakeKeys } from '../src/lib/game/buildingBakeKeys';
import { encodeBakedBuildingMesh } from '../src/lib/game/buildingMeshBake';
import { buildBakedPartsForBakeKey } from '../src/lib/three/buildingBakePipeline';

const outDir = join(process.cwd(), 'public', 'buildings');
mkdirSync(outDir, { recursive: true });

let count = 0;
for (const bakeKey of allBuildingBakeKeys()) {
  const parts = buildBakedPartsForBakeKey(bakeKey);
  const bytes = encodeBakedBuildingMesh({ bakeKey, parts });
  writeFileSync(join(outDir, `${bakeKey}.bin`), bytes);
  count++;
}

console.log(`Baked ${count} building meshes → ${outDir}`);
