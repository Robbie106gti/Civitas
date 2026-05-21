import * as THREE from 'three';
import { getBlueprint } from '../game/blueprints';
import { BUILDING_LOD_NEAR_SUB, SUB_CELL_WORLD_SIZE } from '../game/constants';
import { getFootprint } from '../game/footprints';
import {
  residentialLodColor,
  residentialVariantForAnchor,
} from '../game/residentialBlueprints';
import { buildMeshFromBakedParts, buildMeshFromVoxelData } from './voxelMeshBuilder';
import { buildBakedPartsForBakeKey } from './buildingBakePipeline';
import {
  resolveBuildingBakeKey,
  type BuildingBakeKey,
  type CivicEvolutionTier,
} from '../game/buildingBakeKeys';
import { getCachedBakedMesh, prefetchBakedBuildings } from './buildingBakedStore';
import type { BuildingType } from '../game/types';
import type { ResidentialVariant } from '../game/residentialBlueprints';
import { createExtractorPitMesh, isExtractorBuilding } from './extractorVisuals';

export { buildMeshFromVoxelData, buildBakedPartsFromVoxelData } from './voxelMeshBuilder';
export { prefetchBakedBuildings } from './buildingBakedStore';

const lodColorCache = new Map<number, THREE.MeshStandardMaterial>();

function materialForLodColor(color: number): THREE.MeshStandardMaterial {
  let mat = lodColorCache.get(color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
    lodColorCache.set(color, mat);
  }
  return mat;
}

export type BuildingLod = 'full' | 'simple';

export function buildingLodForDistance(
  anchorSx: number,
  anchorSz: number,
  camSx: number,
  camSz: number,
): BuildingLod {
  const dx = anchorSx - camSx;
  const dz = anchorSz - camSz;
  return Math.hypot(dx, dz) <= BUILDING_LOD_NEAR_SUB ? 'full' : 'simple';
}

const LOD_COLORS: Partial<Record<BuildingType, { plinth: number; wall: number; roof: number }>> = {
  forum: { plinth: 0xf5f0e8, wall: 0xf2e8d5, roof: 0x4a90a8 },
  temple: { plinth: 0xf5f0e8, wall: 0xfaf8f2, roof: 0xb8860b },
  shrine: { plinth: 0xe0d4c0, wall: 0xe8b4a8, roof: 0xc4622d },
  oracle: { plinth: 0x8a8580, wall: 0x3d5c3a, roof: 0x4a6741 },
  warehouse: { plinth: 0xd4c9b0, wall: 0xe8c89a, roof: 0x8b3a2a },
  dock: { plinth: 0x8a8580, wall: 0x6b4226, roof: 0x4a90a8 },
  market: { plinth: 0xe0d4c0, wall: 0xe8b4a8, roof: 0xc4622d },
  trade_post: { plinth: 0xe0d4c0, wall: 0xf2e8d5, roof: 0xc4622d },
  pottery_workshop: { plinth: 0xd4c9b0, wall: 0xe8c89a, roof: 0xd4835b },
  weaponsmith: { plinth: 0x3d4450, wall: 0x8a8580, roof: 0xff6b35 },
  farm_wheat: { plinth: 0x9a7b4f, wall: 0x7ba428, roof: 0xc9a227 },
};

const LOD_SILHOUETTE_TYPES = new Set<BuildingType>([
  'forum',
  'temple',
  'shrine',
  'oracle',
  'warehouse',
  'market',
  'trade_post',
  'pottery_workshop',
  'weaponsmith',
  'farm_wheat',
  'dock',
]);

function addLodPart(
  group: THREE.Group,
  w: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), materialForLodColor(color));
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  group.add(mesh);
}

function createThreePartLodMesh(
  w: number,
  d: number,
  plinthColor: number,
  wallColor: number,
  roofColor: number,
  wallScale = 0.94,
): THREE.Object3D {
  const plinthH = w * 0.1;
  const wallH = w * 0.48;
  const roofH = w * 0.22;
  const group = new THREE.Group();
  addLodPart(group, w, d, plinthColor, w / 2, plinthH / 2, d / 2, w, plinthH, d);
  addLodPart(
    group,
    w,
    d,
    wallColor,
    w / 2,
    plinthH + wallH / 2,
    d / 2,
    w * wallScale,
    wallH,
    d * wallScale,
  );
  addLodPart(
    group,
    w,
    d,
    roofColor,
    w / 2,
    plinthH + wallH + roofH / 2,
    d / 2,
    w * (wallScale - 0.06),
    roofH,
    d * (wallScale - 0.06),
  );
  return group;
}

function createTypeLodMesh(type: BuildingType, w: number, d: number): THREE.Object3D {
  const c = LOD_COLORS[type] ?? { plinth: 0xc4b8a0, wall: 0xe8dcc4, roof: 0xb85c38 };
  const plinthH = w * 0.1;
  const wallH = w * 0.48;
  const group = new THREE.Group();

  switch (type) {
    case 'forum': {
      const span = Math.min(w, d) * 0.45;
      addLodPart(group, w, d, c.plinth, w / 2, plinthH / 2, d / 2, w, plinthH, d);
      addLodPart(
        group,
        w,
        d,
        c.wall,
        w / 2,
        plinthH + wallH / 2,
        d / 2,
        w * 0.92,
        wallH,
        d * 0.92,
      );
      addLodPart(
        group,
        w,
        d,
        c.roof,
        w / 2,
        plinthH + wallH * 0.35,
        d / 2,
        span,
        wallH * 0.12,
        span,
      );
      return group;
    }
    case 'temple': {
      addLodPart(group, w, d, c.plinth, w / 2, plinthH / 2, d / 2, w, plinthH, d);
      addLodPart(
        group,
        w,
        d,
        c.wall,
        w / 2,
        plinthH + wallH * 0.42,
        d / 2,
        w * 0.88,
        wallH * 0.72,
        d * 0.88,
      );
      addLodPart(
        group,
        w,
        d,
        c.roof,
        w / 2,
        plinthH + wallH * 0.92,
        d / 2,
        w * 0.95,
        wallH * 0.14,
        d * 0.2,
      );
      return group;
    }
    case 'shrine': {
      addLodPart(group, w, d, c.plinth, w / 2, plinthH / 2, d / 2, w, plinthH, d);
      addLodPart(
        group,
        w,
        d,
        c.wall,
        w / 2,
        plinthH + wallH * 0.45,
        d / 2,
        w * 0.55,
        wallH * 0.65,
        d * 0.55,
      );
      addLodPart(
        group,
        w,
        d,
        c.roof,
        w / 2,
        plinthH + wallH * 0.88,
        d / 2,
        w * 0.7,
        wallH * 0.18,
        d * 0.7,
      );
      return group;
    }
    case 'oracle': {
      addLodPart(group, w, d, c.plinth, w / 2, plinthH / 2, d / 2, w, plinthH, d);
      addLodPart(
        group,
        w,
        d,
        c.wall,
        w / 2,
        plinthH + wallH * 0.35,
        d / 2,
        w * 0.75,
        wallH * 0.25,
        d * 0.75,
      );
      addLodPart(
        group,
        w,
        d,
        c.roof,
        w / 2,
        plinthH + wallH * 0.55,
        d / 2,
        w * 0.35,
        wallH * 0.5,
        d * 0.35,
      );
      return group;
    }
    case 'market': {
      addLodPart(group, w, d, c.plinth, w / 2, plinthH / 2, d / 2, w, plinthH, d);
      addLodPart(
        group,
        w,
        d,
        c.wall,
        w / 2,
        plinthH + wallH / 2,
        d / 2,
        w * 0.9,
        wallH,
        d * 0.9,
      );
      addLodPart(
        group,
        w,
        d,
        c.roof,
        w / 2,
        plinthH + wallH * 0.72,
        d * 0.15,
        w,
        wallH * 0.12,
        d * 0.22,
      );
      return group;
    }
    case 'warehouse': {
      addLodPart(group, w, d, c.plinth, w / 2, plinthH / 2, d / 2, w, plinthH, d);
      addLodPart(
        group,
        w,
        d,
        c.wall,
        w / 2,
        plinthH + wallH / 2,
        d / 2,
        w * 0.96,
        wallH,
        d * 0.96,
      );
      addLodPart(
        group,
        w,
        d,
        c.roof,
        w * 0.25,
        plinthH + wallH * 0.55,
        d * 0.2,
        w * 0.18,
        wallH * 0.35,
        d * 0.18,
      );
      return group;
    }
    case 'dock': {
      addLodPart(group, w, d, c.plinth, w / 2, plinthH * 0.5, d * 0.85, w, plinthH, d * 0.35);
      addLodPart(
        group,
        w,
        d,
        c.wall,
        w * 0.55,
        plinthH + wallH * 0.45,
        d * 0.55,
        w * 0.5,
        wallH,
        d * 0.5,
      );
      addLodPart(
        group,
        w,
        d,
        c.roof,
        w / 2,
        plinthH * 0.35,
        d * 0.12,
        w,
        plinthH * 0.25,
        d * 0.2,
      );
      return group;
    }
    case 'farm_wheat': {
      addLodPart(group, w, d, c.plinth, w / 2, plinthH * 0.3, d / 2, w, plinthH * 0.5, d);
      addLodPart(
        group,
        w,
        d,
        c.wall,
        w * 0.75,
        plinthH + wallH * 0.25,
        d * 0.75,
        w * 0.35,
        wallH * 0.35,
        d * 0.35,
      );
      addLodPart(
        group,
        w,
        d,
        c.roof,
        w / 2,
        plinthH * 0.55,
        d / 2,
        w * 0.85,
        wallH * 0.15,
        d * 0.85,
      );
      return group;
    }
    default:
      return createThreePartLodMesh(w, d, c.plinth, c.wall, c.roof);
  }
}

function createLodBoxMesh(
  type: BuildingType,
  anchorSx?: number,
  anchorSz?: number,
  residentialVariant?: ResidentialVariant,
): THREE.Object3D {
  const fp = getFootprint(type);
  const lodFallback = LOD_COLORS[type]?.wall ?? 0x8b8b8b;
  const w = fp.w * SUB_CELL_WORLD_SIZE;
  const d = fp.h * SUB_CELL_WORLD_SIZE;
  if (type === 'house') {
    const variant =
      residentialVariant ??
      (anchorSx !== undefined && anchorSz !== undefined
        ? residentialVariantForAnchor(anchorSx, anchorSz)
        : 'hut');
    const wallColor = residentialLodColor(variant);
    const plinthH = w * 0.1;
    const wallH = w * 0.52;
    const roofH = w * 0.22;
    const group = new THREE.Group();
    const plinth = new THREE.Mesh(
      new THREE.BoxGeometry(w, plinthH, d),
      materialForLodColor(0xc4b8a0),
    );
    plinth.position.set(w / 2, plinthH / 2, d / 2);
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.94, wallH, d * 0.94),
      materialForLodColor(wallColor),
    );
    walls.position.set(w / 2, plinthH + wallH / 2, d / 2);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.88, roofH, d * 0.88),
      materialForLodColor(0xb85c38),
    );
    roof.position.set(w / 2, plinthH + wallH + roofH / 2, d / 2);
    for (const m of [plinth, walls, roof]) {
      m.receiveShadow = true;
      group.add(m);
    }
    return group;
  }
  if (LOD_SILHOUETTE_TYPES.has(type)) {
    return createTypeLodMesh(type, w, d);
  }
  const height = Math.min(0.35, SUB_CELL_WORLD_SIZE * 3);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.92, height, d * 0.92),
    materialForLodColor(lodFallback),
  );
  mesh.position.set(w / 2, height / 2, d / 2);
  mesh.receiveShadow = true;
  return mesh;
}

function cloneBakedGroup(template: THREE.Object3D): THREE.Object3D {
  const group = new THREE.Group();
  template.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mesh = new THREE.Mesh(child.geometry, child.material);
      mesh.castShadow = child.castShadow;
      mesh.receiveShadow = child.receiveShadow;
      mesh.position.copy(child.position);
      mesh.quaternion.copy(child.quaternion);
      mesh.scale.copy(child.scale);
      group.add(mesh);
    }
  });
  return group;
}

export function createComposedBuildingMesh(
  type: BuildingType,
  lod: BuildingLod = 'full',
  anchor?: {
    sx: number;
    sz: number;
    residentialVariant?: ResidentialVariant;
    civicTier?: CivicEvolutionTier;
  },
): THREE.Object3D {
  if (isExtractorBuilding(type)) {
    return createExtractorPitMesh(type);
  }
  if (lod === 'simple') {
    return createLodBoxMesh(type, anchor?.sx, anchor?.sz, anchor?.residentialVariant);
  }

  const bakeKey = resolveBuildingBakeKey({
    type,
    lod,
    residentialVariant: anchor?.residentialVariant,
    civicTier: anchor?.civicTier,
  });
  if (bakeKey) {
    const baked = getCachedBakedMesh(bakeKey);
    if (baked) return cloneBakedGroup(baked);
    return buildMeshFromBakedParts(buildBakedPartsForBakeKey(bakeKey));
  }

  const blueprint = getBlueprint(
    anchor
      ? {
          type,
          anchorSx: anchor.sx,
          anchorSz: anchor.sz,
          residentialVariant: anchor.residentialVariant,
        }
      : type,
  );
  return buildMeshFromVoxelData(blueprint);
}

export function bakeKeyForPlacement(
  type: BuildingType,
  lod: BuildingLod,
  residentialVariant?: ResidentialVariant,
  civicTier?: CivicEvolutionTier,
): BuildingBakeKey | null {
  return resolveBuildingBakeKey({ type, lod, residentialVariant, civicTier });
}

export function subCellToWorld(sx: number, sz: number, baseY = 0): THREE.Vector3 {
  return new THREE.Vector3(
    sx * SUB_CELL_WORLD_SIZE + SUB_CELL_WORLD_SIZE / 2,
    baseY,
    sz * SUB_CELL_WORLD_SIZE + SUB_CELL_WORLD_SIZE / 2,
  );
}

/** Footprint anchor (min sub-cell corner) in world space — matches macro mesh origin. */
export function footprintAnchorToWorld(anchorSx: number, anchorSz: number, baseY = 0): THREE.Vector3 {
  return new THREE.Vector3(
    anchorSx * SUB_CELL_WORLD_SIZE,
    baseY,
    anchorSz * SUB_CELL_WORLD_SIZE,
  );
}
