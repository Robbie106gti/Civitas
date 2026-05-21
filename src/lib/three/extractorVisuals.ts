import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getFootprint } from '../game/footprints';
import { getBuildingDef } from '../game/buildings';
import { BUILDING_PALETTE } from '../game/buildingPalette';
import { EXTRACTOR_FOOTPRINT_DUG_DEPTH } from '../game/terrain';
import { SUB_CELL_WORLD_SIZE } from '../game/constants';
import type { BuildingType } from '../game/types';

import { TERRAIN_VOXEL_WORLD_SIZE } from '../game/terrainSection';

const VOXEL = TERRAIN_VOXEL_WORLD_SIZE * 2;
/** Matches terrain drop from {@link EXTRACTOR_FOOTPRINT_DUG_DEPTH}. */
const EXCAV_DEPTH = EXTRACTOR_FOOTPRINT_DUG_DEPTH * VOXEL;
const RIM_H = VOXEL * 0.45;

const PIT_MATERIALS: Partial<
  Record<BuildingType, { rim: keyof typeof BUILDING_PALETTE; floor: keyof typeof BUILDING_PALETTE }>
> = {
  clay_pit: { rim: 'clay_raw', floor: 'terracotta' },
  quarry: { rim: 'stone', floor: 'limestone' },
  sand_pit: { rim: 'travertine', floor: 'stucco_cream' },
  iron_mine: { rim: 'iron_dark', floor: 'stone' },
  gold_mine: { rim: 'bronze', floor: 'crop' },
  lumber_camp: { rim: 'wood_walnut', floor: 'cypress_green' },
};

const materialCache = new Map<number, THREE.MeshStandardMaterial>();

function materialForColor(color: number, roughness = 0.88, metalness = 0): THREE.MeshStandardMaterial {
  const key = color + roughness * 1e6 + metalness * 1e9;
  let mat = materialCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
    materialCache.set(key, mat);
  }
  return mat;
}

function colorForKey(key: keyof typeof BUILDING_PALETTE): THREE.MeshStandardMaterial {
  const def = BUILDING_PALETTE[key];
  return materialForColor(def.color, def.roughness ?? 0.88, def.metalness ?? 0);
}

export function isExtractorBuilding(type: BuildingType): boolean {
  return getBuildingDef(type).category === 'natural_extractor';
}

/** Solid walled excavation — rim at anchor Y, no hollow gap to sky. */
export function createExtractorPitMesh(type: BuildingType): THREE.Object3D {
  const fp = getFootprint(type);
  const mats = PIT_MATERIALS[type] ?? { rim: 'stone', floor: 'limestone' };
  const w = fp.w;
  const h = fp.h;
  const unit = SUB_CELL_WORLD_SIZE;
  const worldW = w * unit;
  const worldH = h * unit;
  const rimGeoms: THREE.BoxGeometry[] = [];
  const wallGeoms: THREE.BoxGeometry[] = [];
  const floorGeoms: THREE.BoxGeometry[] = [];

  const addBox = (
    list: THREE.BoxGeometry[],
    cx: number,
    cy: number,
    cz: number,
    bw: number,
    bh: number,
    bd: number,
  ): void => {
    const geom = new THREE.BoxGeometry(bw, bh, bd);
    geom.translate(cx, cy, cz);
    list.push(geom);
  };

  for (let lz = 0; lz < h; lz++) {
    for (let lx = 0; lx < w; lx++) {
      const onEdge = lx === 0 || lz === 0 || lx === w - 1 || lz === h - 1;
      const cx = lx * unit + unit / 2;
      const cz = lz * unit + unit / 2;
      if (onEdge) {
        addBox(rimGeoms, cx, RIM_H / 2, cz, unit * 0.98, RIM_H, unit * 0.98);
        addBox(
          wallGeoms,
          cx,
          RIM_H - EXCAV_DEPTH / 2,
          cz,
          unit * 0.94,
          EXCAV_DEPTH,
          unit * 0.94,
        );
      }
    }
  }

  if (w > 2 && h > 2) {
    const innerW = (w - 2) * unit * 0.98;
    const innerD = (h - 2) * unit * 0.98;
    addBox(
      floorGeoms,
      worldW / 2,
      RIM_H - EXCAV_DEPTH + VOXEL * 0.12,
      worldH / 2,
      innerW,
      VOXEL * 0.22,
      innerD,
    );
  }

  const group = new THREE.Group();
  for (const [geoms, matKey] of [
    [rimGeoms, mats.rim],
    [wallGeoms, mats.rim],
    [floorGeoms, mats.floor],
  ] as const) {
    if (!geoms.length) continue;
    const merged = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, colorForKey(matKey));
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
  }

  return group;
}

export function extractorSharedMaterials(): Set<THREE.Material> {
  return new Set(materialCache.values());
}
