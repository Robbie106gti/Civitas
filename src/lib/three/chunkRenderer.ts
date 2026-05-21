import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GameGrid } from '../game/grid';
import type { ChunkRecord } from '../game/chunkManager';
import { MAX_ENGINEERS } from '../game/buildingUpkeepConfig';
import {
  BUILDING_LOD_BUCKET_SUB,
  CHUNK_SIZE,
  MAX_MERGE_PRIMITIVES,
  MAX_WALKERS,
  RENDER_CHUNK_RADIUS,
  SUB_CELL_WORLD_SIZE,
  TERRAIN_LOD_FULL_CHUNK_RADIUS,
} from '../game/constants';
import { chunkKey, subKey, subToChunk } from '../game/chunkCoords';
import {
  buildingLodForDistance,
  createComposedBuildingMesh,
  footprintAnchorToWorld,
  subCellToWorld,
  type BuildingLod,
} from './buildingComposer';
import { resolveBuildingBakeKey } from '../game/buildingBakeKeys';
import type { CivicEvolutionTier } from '../game/buildingBakeKeys';
import { getOrCreateBakeTemplate, MAX_BAKE_TEMPLATE_CACHE } from './buildingBakedStore';
import { LruMap } from '../util/lruMap';
import type { ResidentialVariant } from '../game/residentialBlueprints';
import { isExtractorBuilding } from './extractorVisuals';
import {
  constructionRevealScale,
  createConstructionScaffoldGroup,
} from './constructionSiteVisuals';
import {
  constructionBuildingProgress,
  type ConstructionSite,
} from '../game/construction';
import type { BuildingType } from '../game/types';
import { extractorSharedMaterials } from './extractorVisuals';
import { getFootprint, isRoadType } from '../game/footprints';
import { hash01 } from '../game/terrainNoise';
import {
  buildingFootingAnchorY,
  gridElevationSampler,
  sampleFootprintSurface,
  terrainSurfaceWorldYSmooth,
} from '../game/terrainSurface';
import {
  buildStratumQuadGeometry,
  buildWaterSurfaceGeometry,
  minStackBaseY,
  subCellFillExtent,
  TERRAIN_VOXEL_STEP,
} from './terrainChunkMesh';
import {
  defaultTerrainCell,
  resolveTerrainStack,
  terrainLayerColorAt,
  visibleStackLayers,
  type TerrainCell,
  type TerrainLayer,
} from '../game/terrain';
import type { NaturalDepositType } from '../game/types';

const meshCache: Record<string, THREE.Object3D> = {};
const syncedRevision = new Map<string, number>();
const syncedLodBucket = new Map<string, string>();
const syncedTerrainDetail = new Map<string, 'full' | 'surface'>();

type TerrainChunkDetail = 'full' | 'surface';

function chunkTerrainDetail(
  chunkCx: number,
  chunkCy: number,
  camSx: number,
  camSz: number,
): TerrainChunkDetail {
  const { cx, cy } = subToChunk(camSx, camSz);
  const d = Math.max(Math.abs(chunkCx - cx), Math.abs(chunkCy - cy));
  return d <= TERRAIN_LOD_FULL_CHUNK_RADIUS ? 'full' : 'surface';
}

function terrainLayersForDetail(
  column: TerrainLayer[],
  detail: TerrainChunkDetail,
): TerrainLayer[] {
  if (detail === 'full' || column.length <= 1) return column;
  return [column[column.length - 1]!];
}


function lodBucket(camSx: number, camSz: number): string {
  return `${Math.floor(camSx / BUILDING_LOD_BUCKET_SUB)},${Math.floor(camSz / BUILDING_LOD_BUCKET_SUB)}`;
}
const VOXEL_STEP = TERRAIN_VOXEL_STEP;

const depositMaterials = new Map<NaturalDepositType, THREE.MeshStandardMaterial>();
const sharedMaterials = new Set<THREE.Material>();

let sharedTerrainMaterial: THREE.MeshStandardMaterial | null = null;
let sharedWaterMaterial: THREE.MeshStandardMaterial | null = null;

const DEPOSIT_TINT: Record<NaturalDepositType, number> = {
  clay: 0x8b6914,
  rock: 0x6b6b6b,
  sand: 0xc2b280,
  trees: 0x2d5a27,
  iron: 0x4a5568,
  gold: 0xd4af37,
};

function terrainVertexColorMaterial(): THREE.MeshStandardMaterial {
  if (!sharedTerrainMaterial) {
    sharedTerrainMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
    });
    sharedMaterials.add(sharedTerrainMaterial);
  }
  return sharedTerrainMaterial;
}

function setColumnVertexColors(
  geom: THREE.BoxGeometry,
  bottomColor: number,
  topColor: number,
): void {
  const cb = new THREE.Color(bottomColor);
  const ct = new THREE.Color(topColor);
  const halfH = geom.parameters.height / 2;
  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const scratch = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + halfH) / (halfH * 2);
    scratch.copy(cb).lerp(ct, t);
    colors[i * 3] = scratch.r;
    colors[i * 3 + 1] = scratch.g;
    colors[i * 3 + 2] = scratch.b;
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function depositTintMaterial(type: NaturalDepositType): THREE.MeshStandardMaterial {
  let mat = depositMaterials.get(type);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: DEPOSIT_TINT[type],
      transparent: true,
      opacity: 0.42,
    });
    depositMaterials.set(type, mat);
    sharedMaterials.add(mat);
  }
  return mat;
}

function waterVertexColorMaterial(): THREE.MeshStandardMaterial {
  if (!sharedWaterMaterial) {
    sharedWaterMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      metalness: 0.1,
      roughness: 0.25,
      side: THREE.DoubleSide,
    });
    sharedMaterials.add(sharedWaterMaterial);
  }
  return sharedWaterMaterial;
}

function appendPrimitiveBatch(
  batches: THREE.BoxGeometry[][],
  geom: THREE.BoxGeometry,
  counter: { n: number },
): void {
  let batch = batches[batches.length - 1]!;
  if (batch.length > 0 && counter.n >= MAX_MERGE_PRIMITIVES) {
    batch = [];
    batches.push(batch);
    counter.n = 0;
  }
  batch.push(geom);
  counter.n += 1;
}

function flushPrimitiveBatches(
  group: THREE.Group,
  batches: THREE.BoxGeometry[][],
  material: THREE.MeshStandardMaterial,
): void {
  for (const geoms of batches) {
    if (!geoms.length) continue;
    const merged = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, material);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
}

for (const m of extractorSharedMaterials()) {
  sharedMaterials.add(m);
}

function terrainAt(chunk: ChunkRecord, sx: number, sz: number): TerrainCell {
  const key = subKey(sx, sz);
  return chunk.terrain.get(key) ?? defaultTerrainCell();
}

export function syncChunkWorld(
  staticRoot: THREE.Object3D,
  grid: GameGrid,
  centerSx: number,
  centerSz: number,
  exploredRoot: THREE.Object3D,
  camSx = centerSx,
  camSz = centerSz,
): void {
  const seen = new Set<string>();
  const chunks = grid.chunks.visibleChunks(centerSx, centerSz, RENDER_CHUNK_RADIUS);

  const bucket = lodBucket(camSx, camSz);

  for (const chunk of chunks) {
    const cKey = chunkKey(chunk.cx, chunk.cy);
    const rev = chunk.contentRevision;
    const lodChanged = syncedLodBucket.get(cKey) !== bucket;
    const contentDirty = syncedRevision.get(cKey) !== rev;
    const terrainDetail = chunkTerrainDetail(chunk.cx, chunk.cy, camSx, camSz);
    const terrainDetailChanged = syncedTerrainDetail.get(cKey) !== terrainDetail;

    if (contentDirty || terrainDetailChanged) {
      syncChunkTerrain(staticRoot, chunk, grid, seen, terrainDetail);
      if (contentDirty) syncChunkWater(staticRoot, chunk, grid, seen);
      syncedTerrainDetail.set(cKey, terrainDetail);
    }
    if (contentDirty || lodChanged) {
      syncChunkContents(staticRoot, chunk, grid, seen, camSx, camSz);
      syncedLodBucket.set(cKey, bucket);
    }
    if (contentDirty) {
      syncedRevision.set(cKey, rev);
    } else if (terrainDetailChanged || lodChanged) {
      seen.add(`t:${cKey}`);
      seen.add(`f:${cKey}`);
      seen.add(`bi:${cKey}`);
    } else {
      markChunkMeshesSeen(chunk, seen);
    }
  }

  syncMistOverlays(exploredRoot, grid, centerSx, centerSz, seen);

  for (const key of Object.keys(meshCache)) {
    if (!seen.has(key)) {
      const mesh = meshCache[key];
      if (mesh) {
        mesh.parent?.remove(mesh);
        disposeObject(mesh);
        delete meshCache[key];
      }
    }
  }

  for (const key of [...syncedRevision.keys()]) {
    if (!seen.has(`t:${key}`)) {
      syncedRevision.delete(key);
      syncedLodBucket.delete(key);
      syncedTerrainDetail.delete(key);
    }
  }
}

function markChunkMeshesSeen(chunk: ChunkRecord, seen: Set<string>): void {
  const cKey = chunkKey(chunk.cx, chunk.cy);
  seen.add(`t:${cKey}`);
  seen.add(`f:${cKey}`);
  seen.add(`bi:${cKey}`);
}

function syncChunkTerrain(
  parent: THREE.Object3D,
  chunk: ChunkRecord,
  grid: GameGrid,
  seen: Set<string>,
  detail: TerrainChunkDetail,
): void {
  const worldSeed = grid.worldSeed;
  const elevSample = gridElevationSampler(grid);
  const cKey = chunkKey(chunk.cx, chunk.cy);
  const cacheKey = `t:${cKey}`;
  seen.add(cacheKey);

  const old = meshCache[cacheKey];
  if (old) {
    old.parent?.remove(old);
    disposeObject(old);
    delete meshCache[cacheKey];
  }

  const minSx = chunk.cx * CHUNK_SIZE;
  const minSz = chunk.cy * CHUNK_SIZE;
  const terrainBatches: THREE.BoxGeometry[][] = [[]];
  const terrainCounter = { n: 0 };
  const depositTintGeoms = new Map<NaturalDepositType, THREE.BoxGeometry[]>();
  const builtOn = new Set(chunk.cells.keys());
  const isWaterAt = (sx: number, sz: number) => chunk.fluids.get(subKey(sx, sz)) === 'water';
  const columnAt = (sx: number, sz: number) => {
    const cell = terrainAt(chunk, sx, sz);
    const deposit = chunk.deposits.get(subKey(sx, sz));
    const stack = resolveTerrainStack(deposit);
    return terrainLayersForDetail(visibleStackLayers(stack, cell.dugDepth), detail);
  };
  const dugAt = (sx: number, sz: number) => terrainAt(chunk, sx, sz).dugDepth;
  let maxStrata = 0;

  for (let lz = 0; lz < CHUNK_SIZE; lz++) {
    for (let lx = 0; lx < CHUNK_SIZE; lx++) {
      const sx = minSx + lx;
      const sz = minSz + lz;
      const cellKey = subKey(sx, sz);
      const cell = terrainAt(chunk, sx, sz);
      const column = columnAt(sx, sz);
      maxStrata = Math.max(maxStrata, column.length);
      const isWater = isWaterAt(sx, sz);
      const deposit = chunk.deposits.get(cellKey);
      const showDepositTint =
        detail === 'full' &&
        cell.dugDepth === 0 &&
        deposit &&
        deposit.richness > 0 &&
        !builtOn.has(cellKey) &&
        !isWater;

      if (!isWater) {
        const minStackBase = minStackBaseY(sx, sz, cell.dugDepth, column.length, elevSample);
        if (minStackBase > VOXEL_STEP * 0.5) {
          const fillHeight = minStackBase;
          const extent = subCellFillExtent(lx, lz);
          const fillGeom = new THREE.BoxGeometry(extent.width, fillHeight, extent.depth);
          setColumnVertexColors(
            fillGeom,
            terrainLayerColorAt('rock', sx, sz, worldSeed),
            terrainLayerColorAt('dirt', sx, sz, worldSeed),
          );
          fillGeom.translate(
            sx * SUB_CELL_WORLD_SIZE + SUB_CELL_WORLD_SIZE / 2 + extent.centerOffsetX,
            fillHeight / 2,
            sz * SUB_CELL_WORLD_SIZE + SUB_CELL_WORLD_SIZE / 2 + extent.centerOffsetZ,
          );
          appendPrimitiveBatch(terrainBatches, fillGeom, terrainCounter);
        }
      }

      if (showDepositTint && column.length > 0) {
        const topY = terrainSurfaceWorldYSmooth(sx, sz, 0.5, 0.5, elevSample, cell.dugDepth);
        const tintGeom = new THREE.BoxGeometry(
          SUB_CELL_WORLD_SIZE,
          VOXEL_STEP * 0.15,
          SUB_CELL_WORLD_SIZE,
        );
        tintGeom.translate(
          sx * SUB_CELL_WORLD_SIZE + SUB_CELL_WORLD_SIZE / 2,
          topY + VOXEL_STEP * 0.05,
          sz * SUB_CELL_WORLD_SIZE + SUB_CELL_WORLD_SIZE / 2,
        );
        const tList = depositTintGeoms.get(deposit.type) ?? [];
        tList.push(tintGeom);
        depositTintGeoms.set(deposit.type, tList);
      }
    }
  }

  const group = new THREE.Group();
  group.frustumCulled = true;
  flushPrimitiveBatches(group, terrainBatches, terrainVertexColorMaterial());

  for (let stratumIndex = 0; stratumIndex < maxStrata; stratumIndex++) {
    const stratumGeom = buildStratumQuadGeometry(
      chunk,
      stratumIndex,
      worldSeed,
      elevSample,
      isWaterAt,
      (sx, sz, idx) => columnAt(sx, sz)[idx] ?? null,
      (sx, sz) => columnAt(sx, sz).length,
      dugAt,
    );
    if (!stratumGeom) continue;
    const mesh = new THREE.Mesh(stratumGeom, terrainVertexColorMaterial());
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (const [depType, geoms] of depositTintGeoms) {
    const merged = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, depositTintMaterial(depType));
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  meshCache[cacheKey] = group;
  parent.add(group);
}

function waterColorAt(sx: number, sz: number, worldSeed: number): number {
  const base = 0x2b7fd4;
  const n = hash01(sx, sz, worldSeed ^ 0xcafebabe);
  const r = ((base >> 16) & 0xff) + Math.floor((n - 0.5) * 18);
  const g = ((base >> 8) & 0xff) + Math.floor((hash01(sx + 3, sz, worldSeed) - 0.5) * 14);
  const b = (base & 0xff) + Math.floor((hash01(sx, sz + 5, worldSeed + 1) - 0.5) * 12);
  const c = (v: number) => Math.max(0, Math.min(255, v));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

function syncChunkWater(
  parent: THREE.Object3D,
  chunk: ChunkRecord,
  grid: GameGrid,
  seen: Set<string>,
): void {
  const worldSeed = grid.worldSeed;
  const elevSample = gridElevationSampler(grid);
  const cKey = chunkKey(chunk.cx, chunk.cy);
  const cacheKey = `f:${cKey}`;
  seen.add(cacheKey);

  const old = meshCache[cacheKey];
  if (old) {
    old.parent?.remove(old);
    disposeObject(old);
    delete meshCache[cacheKey];
  }

  const waterGeom = buildWaterSurfaceGeometry(
    chunk,
    worldSeed,
    elevSample,
    (sx, sz) => waterColorAt(sx, sz, worldSeed),
    (sx, sz) => chunk.fluids.get(subKey(sx, sz)) === 'water',
    (sx, sz) => terrainAt(chunk, sx, sz).dugDepth,
    VOXEL_STEP * 0.02,
  );

  if (!waterGeom) return;

  const group = new THREE.Group();
  group.frustumCulled = true;
  const waterMesh = new THREE.Mesh(waterGeom, waterVertexColorMaterial());
  waterMesh.receiveShadow = true;
  group.add(waterMesh);

  meshCache[cacheKey] = group;
  parent.add(group);
}

interface BuildingPlacement {
  anchorKey: string;
  type: BuildingType;
}

const buildingTemplateCache = new LruMap<string, THREE.Object3D>(
  MAX_BAKE_TEMPLATE_CACHE,
  (_key, template) => {
    template.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          for (const m of child.material) m.dispose();
        } else {
          child.material.dispose();
        }
      }
    });
  },
);

const _anchorMatrix = new THREE.Matrix4();
const _scaleMatrix = new THREE.Matrix4();
const _instanceMatrix = new THREE.Matrix4();
const _matrixPool: THREE.Matrix4[] = [];
let _matrixPoolIdx = 0;

function resetMatrixPool(): void {
  _matrixPoolIdx = 0;
}

function acquireInstanceMatrix(): THREE.Matrix4 {
  if (_matrixPoolIdx < _matrixPool.length) {
    return _matrixPool[_matrixPoolIdx++]!;
  }
  const m = new THREE.Matrix4();
  _matrixPool.push(m);
  _matrixPoolIdx += 1;
  return m;
}

type InstanceBucket = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  matrices: THREE.Matrix4[];
};

function buildingTemplateCacheKey(
  type: BuildingType,
  lod: BuildingLod,
  houseVariant?: ResidentialVariant,
  civicTier?: CivicEvolutionTier,
): string {
  return `${type}:${lod}:${houseVariant ?? ''}:${civicTier ?? ''}`;
}

function templateForPlacement(
  type: BuildingType,
  lod: BuildingLod,
  houseVariant?: ResidentialVariant,
  civicTier?: CivicEvolutionTier,
): THREE.Object3D {
  const bakeKey =
    lod === 'full'
      ? resolveBuildingBakeKey({ type, lod, residentialVariant: houseVariant, civicTier })
      : null;
  if (bakeKey) return getOrCreateBakeTemplate(bakeKey);

  const key = buildingTemplateCacheKey(type, lod, houseVariant, civicTier);
  let template = buildingTemplateCache.get(key);
  if (!template) {
    template = createComposedBuildingMesh(type, lod, {
      sx: 0,
      sz: 0,
      residentialVariant: houseVariant,
      civicTier,
    });
    template.position.set(0, 0, 0);
    template.updateMatrixWorld(true);
    buildingTemplateCache.set(key, template);
  }
  return template;
}

function collectBuildingInstances(
  template: THREE.Object3D,
  bucketPrefix: string,
  anchorSx: number,
  anchorSz: number,
  baseY: number,
  buckets: Map<string, InstanceBucket>,
  revealScale = 1,
): void {
  template.updateMatrixWorld(true);
  const world = footprintAnchorToWorld(anchorSx, anchorSz, baseY);
  _anchorMatrix.makeTranslation(world.x, world.y, world.z);
  if (revealScale !== 1) {
    _scaleMatrix.makeScale(1, revealScale, 1);
    _anchorMatrix.multiply(_scaleMatrix);
  }

  let partIdx = 0;
  template.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const key = `${bucketPrefix}:${partIdx}`;
    partIdx += 1;
    const bucket: InstanceBucket = buckets.get(key) ?? {
      geometry: child.geometry,
      material: child.material,
      matrices: [],
    };
    _instanceMatrix.multiplyMatrices(_anchorMatrix, child.matrixWorld);
    bucket.matrices.push(acquireInstanceMatrix().copy(_instanceMatrix));
    buckets.set(key, bucket);
  });
}

function buildInstancedConstructionGroup(
  sites: ConstructionSite[],
  grid: GameGrid,
  camSx: number,
  camSz: number,
): THREE.Group | null {
  if (!sites.length) return null;
  const group = new THREE.Group();
  group.frustumCulled = true;

  for (const site of sites) {
    const type = site.building;
    const fp = getFootprint(type);
    const sample = gridElevationSampler(grid);
    const surface = sampleFootprintSurface(site.sx, site.sz, fp, sample, (sx, sz) =>
      grid.getTerrain(sx, sz).dugDepth,
    );
    const anchorY = surface.baseY;
    group.add(createConstructionScaffoldGroup(site, anchorY));

    const buildProgress = constructionBuildingProgress(site);
    if (site.phase === 'building' && buildProgress > 0.08) {
      const lod = buildingLodForDistance(site.sx, site.sz, camSx, camSz);
      const houseVariant =
        type === 'house' ? grid.housing.variantAt(site.sx, site.sz) : undefined;
      const template = templateForPlacement(type, lod, houseVariant, 0);
      const buckets = new Map<string, InstanceBucket>();
      resetMatrixPool();
      const reveal = constructionRevealScale(buildProgress);
      collectBuildingInstances(
        template,
        `cs:${type}:${site.progress.toFixed(2)}`,
        site.sx,
        site.sz,
        anchorY,
        buckets,
        reveal,
      );
      for (const bucket of buckets.values()) {
        const count = bucket.matrices.length;
        if (!count) continue;
        const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, count);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        for (let i = 0; i < count; i++) {
          mesh.setMatrixAt(i, bucket.matrices[i]!);
        }
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
      }
    }
  }

  return group.children.length ? group : null;
}

function buildInstancedBuildingGroup(
  placements: BuildingPlacement[],
  grid: GameGrid,
  camSx: number,
  camSz: number,
): THREE.Group | null {
  resetMatrixPool();
  const buckets = new Map<string, InstanceBucket>();

  for (const { anchorKey, type } of placements) {
    const [xs, zs] = anchorKey.split(',');
    const anchorSx = Number(xs);
    const anchorSz = Number(zs);
    if (Number.isNaN(anchorSx) || Number.isNaN(anchorSz)) continue;

    const lod = buildingLodForDistance(anchorSx, anchorSz, camSx, camSz);
    const houseVariant =
      type === 'house' ? grid.housing.variantAt(anchorSx, anchorSz) : undefined;
    const civicTier = grid.upkeep.civicTierAt(anchorKey, type);

    let bucketPrefix: string;
    let template: THREE.Object3D;
    if (isExtractorBuilding(type)) {
      bucketPrefix = `x:${type}`;
      template = templateForPlacement(type, 'full');
    } else {
      const bakeKey =
        lod === 'full'
          ? resolveBuildingBakeKey({ type, lod, residentialVariant: houseVariant, civicTier })
          : null;
      bucketPrefix = bakeKey
        ? `k:${bakeKey}`
        : buildingTemplateCacheKey(type, lod, houseVariant, civicTier);
      template = templateForPlacement(type, lod, houseVariant, civicTier);
    }

    const fp = getFootprint(type);
    const sample = gridElevationSampler(grid);
    const surface = sampleFootprintSurface(anchorSx, anchorSz, fp, sample, (sx, sz) =>
      grid.getTerrain(sx, sz).dugDepth,
    );
    const anchorY = buildingFootingAnchorY(surface, isExtractorBuilding(type));
    collectBuildingInstances(template, bucketPrefix, anchorSx, anchorSz, anchorY, buckets);
  }

  if (!buckets.size) return null;

  const group = new THREE.Group();
  group.frustumCulled = true;
  for (const bucket of buckets.values()) {
    const count = bucket.matrices.length;
    if (!count) continue;
    const mesh = new THREE.InstancedMesh(bucket.geometry, bucket.material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let i = 0; i < count; i++) {
      mesh.setMatrixAt(i, bucket.matrices[i]!);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  return group.children.length ? group : null;
}

function syncChunkContents(
  parent: THREE.Object3D,
  chunk: ChunkRecord,
  grid: GameGrid,
  seen: Set<string>,
  camSx: number,
  camSz: number,
): void {
  purgeChunkBuildingMeshes(chunk);

  const cKey = chunkKey(chunk.cx, chunk.cy);
  const cacheKey = `bi:${cKey}`;
  seen.add(cacheKey);

  const placements: BuildingPlacement[] = [];
  for (const [anchorKey, type] of chunk.anchors) {
    placements.push({ anchorKey, type });
  }
  for (const [cellKey, type] of chunk.cells) {
    if (isRoadType(type)) placements.push({ anchorKey: cellKey, type });
  }

  const group = buildInstancedBuildingGroup(placements, grid, camSx, camSz);
  if (group) {
    meshCache[cacheKey] = group;
    parent.add(group);
  }

  const sites: ConstructionSite[] = [];
  for (const site of chunk.constructionSites.values()) {
    sites.push(site);
  }
  if (sites.length) {
    const csKey = `cs:${cKey}`;
    seen.add(csKey);
    const csGroup = buildInstancedConstructionGroup(sites, grid, camSx, camSz);
    if (csGroup) {
      meshCache[csKey] = csGroup;
      parent.add(csGroup);
    }
  }
}

function purgeChunkBuildingMeshes(chunk: ChunkRecord): void {
  const cKey = chunkKey(chunk.cx, chunk.cy);
  const keys = [`bi:${cKey}`, `cs:${cKey}`];
  const minSx = chunk.cx * CHUNK_SIZE;
  const maxSx = minSx + CHUNK_SIZE;
  const minSz = chunk.cy * CHUNK_SIZE;
  const maxSz = minSz + CHUNK_SIZE;

  for (const key of Object.keys(meshCache)) {
    if (!key.startsWith('b:')) continue;
    const parts = key.slice(2).split(':');
    const coord = parts[0] ?? '';
    const [xs, zs] = coord.split(',');
    const sx = Number(xs);
    const sz = Number(zs);
    if (Number.isNaN(sx) || Number.isNaN(sz)) continue;
    if (sx < minSx || sx >= maxSx || sz < minSz || sz >= maxSz) continue;
    keys.push(key);
  }

  for (const key of keys) {
    const mesh = meshCache[key];
    if (!mesh) continue;
    mesh.parent?.remove(mesh);
    disposeInstancedOrObject(mesh);
    delete meshCache[key];
  }
}

function disposeInstancedOrObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.InstancedMesh) return;
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!sharedMaterials.has(m)) m.dispose();
      }
    }
  });
}

function syncMistOverlays(
  exploredRoot: THREE.Object3D,
  grid: GameGrid,
  centerSx: number,
  centerSz: number,
  seen: Set<string>,
): void {
  const radius = RENDER_CHUNK_RADIUS + 1;
  const chunks = grid.chunks.visibleChunks(centerSx, centerSz, radius);

  for (const chunk of chunks) {
    if (grid.chunks.isExplored(chunk.cx, chunk.cy)) continue;

    const mKey = `m:${chunkKey(chunk.cx, chunk.cy)}`;
    seen.add(mKey);
    let plane = meshCache[mKey];
    if (!plane) {
      const size = CHUNK_SIZE * SUB_CELL_WORLD_SIZE;
      plane = new THREE.Mesh(
        new THREE.PlaneGeometry(size, size),
        new THREE.MeshBasicMaterial({
          color: 0x9aa8b8,
          transparent: true,
          opacity: 0.55,
        }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = 0.15;
      meshCache[mKey] = plane;
      exploredRoot.add(plane);
    }
    const originSx = chunk.cx * CHUNK_SIZE;
    const originSz = chunk.cy * CHUNK_SIZE;
    plane.position.set(
      originSx * SUB_CELL_WORLD_SIZE + (CHUNK_SIZE * SUB_CELL_WORLD_SIZE) / 2,
      0.15,
      originSz * SUB_CELL_WORLD_SIZE + (CHUNK_SIZE * SUB_CELL_WORLD_SIZE) / 2,
    );
  }
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        if (!sharedMaterials.has(m)) m.dispose();
      }
    }
  });
}

const walkerMaterial = new THREE.MeshStandardMaterial({ color: 0xe8c170 });
const engineerMaterial = new THREE.MeshStandardMaterial({ color: 0x6eb5d9 });
sharedMaterials.add(walkerMaterial);
sharedMaterials.add(engineerMaterial);

const _walkerMatrix = new THREE.Matrix4();
const _walkerPosition = new THREE.Vector3();
const _walkerScale = new THREE.Vector3(1, 1, 1);
const _walkerQuaternion = new THREE.Quaternion();
const _hiddenScale = new THREE.Vector3(0, 0, 0);

let citizenInstanced: THREE.InstancedMesh | null = null;
let engineerInstanced: THREE.InstancedMesh | null = null;
let legacyWalkerMeshesPurged = false;
let lastWalkerHash = '';

function walkerPayloadHash(
  walkers: { id: number; sx: number; sz: number; role?: 'citizen' | 'engineer' }[],
): string {
  let h = walkers.length;
  for (const w of walkers) {
    h = (h * 31 + w.id) | 0;
    h = (h * 17 + Math.round(w.sx * 10)) | 0;
    h = (h * 13 + Math.round(w.sz * 10)) | 0;
    h = (h * 7 + (w.role === 'engineer' ? 1 : 0)) | 0;
  }
  return `${h}`;
}

function ensureWalkerInstanced(
  parent: THREE.Object3D,
  role: 'citizen' | 'engineer',
): THREE.InstancedMesh {
  const existing = role === 'citizen' ? citizenInstanced : engineerInstanced;
  if (existing) return existing;

  const max = role === 'citizen' ? MAX_WALKERS : MAX_ENGINEERS;
  const radius = SUB_CELL_WORLD_SIZE * (role === 'engineer' ? 0.4 : 0.35);
  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(radius, 6, 6),
    role === 'engineer' ? engineerMaterial : walkerMaterial,
    max,
  );
  mesh.count = 0;
  mesh.frustumCulled = false;
  parent.add(mesh);
  if (role === 'citizen') citizenInstanced = mesh;
  else engineerInstanced = mesh;
  return mesh;
}

function purgeLegacyWalkerMeshes(parent: THREE.Object3D): void {
  for (const key of Object.keys(meshCache)) {
    if (!key.startsWith('w:')) continue;
    const mesh = meshCache[key];
    if (mesh) {
      parent.remove(mesh);
      disposeObject(mesh);
      delete meshCache[key];
    }
  }
}

export function syncWalkerMeshes(
  parent: THREE.Object3D,
  walkers: { id: number; sx: number; sz: number; role?: 'citizen' | 'engineer' }[],
): void {
  const hash = walkerPayloadHash(walkers);
  if (hash === lastWalkerHash) return;
  lastWalkerHash = hash;

  if (!legacyWalkerMeshesPurged) {
    purgeLegacyWalkerMeshes(parent);
    legacyWalkerMeshesPurged = true;
  }

  const citizens: typeof walkers = [];
  const engineers: typeof walkers = [];
  for (const w of walkers) {
    if (w.role === 'engineer') engineers.push(w);
    else citizens.push(w);
  }

  const citizenMesh = ensureWalkerInstanced(parent, 'citizen');
  for (let i = 0; i < MAX_WALKERS; i++) {
    const w = citizens[i];
    if (w) {
      _walkerPosition.copy(subCellToWorld(w.sx, w.sz));
      _walkerPosition.y = SUB_CELL_WORLD_SIZE * 0.5;
      _walkerMatrix.compose(_walkerPosition, _walkerQuaternion, _walkerScale);
    } else {
      _walkerMatrix.compose(_walkerPosition, _walkerQuaternion, _hiddenScale);
    }
    citizenMesh.setMatrixAt(i, _walkerMatrix);
  }
  citizenMesh.count = citizens.length;
  citizenMesh.instanceMatrix.needsUpdate = true;

  const engineerMesh = ensureWalkerInstanced(parent, 'engineer');
  for (let i = 0; i < MAX_ENGINEERS; i++) {
    const w = engineers[i];
    if (w) {
      _walkerPosition.copy(subCellToWorld(w.sx, w.sz));
      _walkerPosition.y = SUB_CELL_WORLD_SIZE * 0.5;
      _walkerMatrix.compose(_walkerPosition, _walkerQuaternion, _walkerScale);
    } else {
      _walkerMatrix.compose(_walkerPosition, _walkerQuaternion, _hiddenScale);
    }
    engineerMesh.setMatrixAt(i, _walkerMatrix);
  }
  engineerMesh.count = engineers.length;
  engineerMesh.instanceMatrix.needsUpdate = true;
}
