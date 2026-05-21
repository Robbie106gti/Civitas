import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getBuildingDef } from '../game/buildings';
import { getFootprint } from '../game/footprints';
import { SUB_CELL_WORLD_SIZE } from '../game/constants';
import type { BuildingType } from '../game/types';

/** Mediterranean Roman palette */
const COLORS = {
  stucco: 0xe8dcc4,
  stuccoOchre: 0xd4b896,
  stuccoShadow: 0xc9a87c,
  stone: 0xa89888,
  limestone: 0xc9b896,
  terracotta: 0xc45c26,
  roofTile: 0xb84a20,
  wood: 0x6b4423,
  impluvium: 0xd8d0c0,
  courtyard: 0x9a7b4f,
} as const;

const BLOCK_GAP = 0.02;
const unit = SUB_CELL_WORLD_SIZE - BLOCK_GAP;
const blockH = unit * 0.85;

const materialCache = new Map<number, THREE.MeshStandardMaterial>();

function materialForColor(color: number): THREE.MeshStandardMaterial {
  let mat = materialCache.get(color);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0.02 });
    materialCache.set(color, mat);
  }
  return mat;
}

export function isResidentialBuilding(type: BuildingType): boolean {
  return getBuildingDef(type).category === 'housing';
}

type GeomBucket = Map<number, THREE.BoxGeometry[]>;

function bucket(
  buckets: GeomBucket,
  color: number,
  x: number,
  z: number,
  y: number,
  w: number,
  h: number,
  d: number,
): void {
  const geom = new THREE.BoxGeometry(w, h, d);
  geom.translate(
    x * SUB_CELL_WORLD_SIZE + (w * SUB_CELL_WORLD_SIZE) / 2,
    y + h / 2,
    z * SUB_CELL_WORLD_SIZE + (d * SUB_CELL_WORLD_SIZE) / 2,
  );
  const list = buckets.get(color) ?? [];
  list.push(geom);
  buckets.set(color, list);
}

function wallRing(
  buckets: GeomBucket,
  S: number,
  y: number,
  innerMin: number,
  innerMax: number,
  skipDoor = false,
): void {
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const inCourtyard = x >= innerMin && x <= innerMax && z >= innerMin && z <= innerMax;
      if (inCourtyard) continue;
      const onPerimeter = x === 0 || z === 0 || x === S - 1 || z === S - 1;
      if (!onPerimeter) continue;
      if (skipDoor && z === 0 && x >= 4 && x <= 5) continue;
      const tone =
        (x + z) % 3 === 0
          ? COLORS.stuccoOchre
          : (x + z) % 3 === 1
            ? COLORS.stucco
            : COLORS.stuccoShadow;
      bucket(buckets, tone, x, z, y, unit, blockH, unit);
    }
  }
}

function mergeBuckets(buckets: GeomBucket): THREE.Group {
  const group = new THREE.Group();
  for (const [color, geoms] of buckets) {
    if (!geoms.length) continue;
    const merged = mergeGeometries(geoms, false);
    geoms.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, materialForColor(color));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/** Insula-style Roman domus read: courtyard, stucco, terracotta roof, balcony, stone accents. */
export function createRomanHouseMesh(): THREE.Object3D {
  const fp = getFootprint('house');
  const S = fp.w;
  const buckets: GeomBucket = new Map();
  const courtMin = 3;
  const courtMax = S - 4;
  let y = 0;

  // Stone base course
  for (let z = 0; z < S; z++) {
    for (let x = 0; x < S; x++) {
      const edge = x === 0 || z === 0 || x === S - 1 || z === S - 1;
      if (!edge) continue;
      bucket(buckets, COLORS.stone, x, z, y, unit, blockH * 0.45, unit);
    }
  }
  y += blockH * 0.45;

  // Ground floor stucco + door opening toward -Z (front row z=0)
  wallRing(buckets, S, y, courtMin, courtMax, true);
  y += blockH;

  // Courtyard floor (atrium / impluvium hint)
  for (let z = courtMin; z <= courtMax; z++) {
    for (let x = courtMin; x <= courtMax; x++) {
      const cx = (courtMin + courtMax) / 2;
      const cz = (courtMin + courtMax) / 2;
      const dist = Math.max(Math.abs(x - cx), Math.abs(z - cz));
      const color = dist <= 0.5 ? COLORS.impluvium : COLORS.courtyard;
      bucket(buckets, color, x, z, y - blockH * 0.35, unit, blockH * 0.12, unit);
    }
  }

  // Stone lintel + column hints flanking door
  for (const x of [3, 6] as const) {
    bucket(
      buckets,
      COLORS.limestone,
      x,
      0,
      y - blockH * 0.15,
      unit * 0.55,
      blockH * 1.05,
      unit * 0.55,
    );
  }
  for (let x = 3; x <= 6; x++) {
    bucket(buckets, COLORS.limestone, x, 0, y - blockH * 0.05, unit, blockH * 0.18, unit * 0.35);
  }

  wallRing(buckets, S, y, courtMin, courtMax, true);
  y += blockH;

  // Upper insula floor (set back one cell from front) + wooden balcony
  const inset = 1;
  for (let z = inset; z < S - inset; z++) {
    for (let x = inset; x < S - inset; x++) {
      const inCourt = x >= courtMin && x <= courtMax && z >= courtMin && z <= courtMax;
      if (inCourt) continue;
      const edge = x === inset || z === inset || x === S - 1 - inset || z === S - 1 - inset;
      if (!edge) continue;
      bucket(buckets, COLORS.stuccoOchre, x, z, y, unit, blockH, unit);
    }
  }
  for (let x = 2; x <= 7; x++) {
    bucket(buckets, COLORS.wood, x, 0, y + blockH * 0.55, unit * 0.92, blockH * 0.14, unit * 0.42);
  }
  y += blockH;

  // Third floor setback (smaller insula crown)
  const inset2 = 2;
  for (let z = inset2; z < S - inset2; z++) {
    for (let x = inset2; x < S - inset2; x++) {
      const edge = x === inset2 || z === inset2 || x === S - 1 - inset2 || z === S - 1 - inset2;
      if (!edge) continue;
      bucket(buckets, COLORS.stucco, x, z, y, unit, blockH * 0.9, unit);
    }
  }
  y += blockH * 0.9;

  // Stepped terracotta roof (tiled cap + ridge)
  const roofH = blockH * 0.55;
  for (let ring = 0; ring < 3; ring++) {
    const margin = ring;
    for (let z = margin; z < S - margin; z++) {
      for (let x = margin; x < S - margin; x++) {
        const edge = x === margin || z === margin || x === S - 1 - margin || z === S - 1 - margin;
        if (!edge && ring < 2) continue;
        if (ring === 2 && !(x >= 4 && x <= 5 && z >= 4 && z <= 5)) continue;
        const tone = (x + z + ring) % 2 === 0 ? COLORS.roofTile : COLORS.terracotta;
        bucket(buckets, tone, x, z, y, unit, roofH, unit);
      }
    }
    y += roofH * 0.92;
  }

  return mergeBuckets(buckets);
}

/** Simplified warm stucco block for distant LOD. */
export function createRomanHouseLodMesh(): THREE.Object3D {
  const fp = getFootprint('house');
  const w = fp.w * SUB_CELL_WORLD_SIZE;
  const d = fp.h * SUB_CELL_WORLD_SIZE;
  const height = blockH * 4.2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.9, height, d * 0.9),
    materialForColor(COLORS.stuccoOchre),
  );
  mesh.position.set(w / 2, height / 2, d / 2);
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.72, blockH * 0.8, d * 0.72),
    materialForColor(COLORS.terracotta),
  );
  cap.position.set(w / 2, height + blockH * 0.35, d / 2);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  cap.castShadow = true;
  const group = new THREE.Group();
  group.add(mesh, cap);
  return group;
}

export const ROMAN_HOUSE_LOD_COLOR = COLORS.stuccoOchre;
