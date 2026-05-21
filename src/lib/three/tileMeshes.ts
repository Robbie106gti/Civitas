import * as THREE from 'three';
import type { BuildingType, NaturalDepositType } from '../game/types';

import { SUB_CELL_WORLD_SIZE } from '../game/constants';

const TILE_SIZE = SUB_CELL_WORLD_SIZE;
const TILE_GAP = 0.002;

const DEPOSIT_COLORS: Record<NaturalDepositType, number> = {
  clay: 0x8b6914,
  rock: 0x6b6b6b,
  sand: 0xc2b280,
  trees: 0x2d5a27,
  iron: 0x4a5568,
  gold: 0xd4af37,
};

export function createDepositOverlay(type: NaturalDepositType, richness: number): THREE.Object3D {
  const group = new THREE.Group();
  const size = TILE_SIZE - TILE_GAP;
  const alpha = Math.min(0.55, 0.25 + (richness / 200) * 0.3);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, 0.06, size),
    new THREE.MeshStandardMaterial({
      color: DEPOSIT_COLORS[type],
      transparent: true,
      opacity: alpha,
    }),
  );
  mesh.position.y = 0.03;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

function addBox(
  group: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  color: number,
  y: number,
): void {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color }),
  );
  mesh.position.y = y + h / 2;
  mesh.castShadow = true;
  group.add(mesh);
}

export function createBuildingMesh(type: BuildingType): THREE.Object3D {
  const group = new THREE.Group();
  const size = TILE_SIZE - TILE_GAP;

  switch (type) {
    case 'house': {
      addBox(group, size, size * 0.55, size, 0xe8dcc4, 0);
      addBox(group, size * 0.72, size * 0.22, size * 0.72, 0xc45c26, size * 0.55);
      const col = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.12, size * 0.45, size * 0.12),
        new THREE.MeshStandardMaterial({ color: 0xc9b896 }),
      );
      col.position.set(size * 0.22, size * 0.28, size * 0.08);
      col.castShadow = true;
      group.add(col);
      break;
    }
    case 'dirt_path':
    case 'road':
    case 'highway': {
      const colors = { dirt_path: 0x8b7355, road: 0x4a4a4a, highway: 0x2a2a2a } as const;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, 0.08, size),
        new THREE.MeshStandardMaterial({ color: colors[type] }),
      );
      mesh.position.y = 0.04;
      mesh.receiveShadow = true;
      group.add(mesh);
      break;
    }
    case 'forum':
      addBox(group, size, size * 1.1, size, 0xd4c4a8, 0);
      break;
    case 'tree': {
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 0.12, size * 0.15, size * 0.35, 8),
        new THREE.MeshStandardMaterial({ color: 0x5c4033 }),
      );
      trunk.position.y = (size * 0.35) / 2;
      trunk.castShadow = true;
      const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(size * 0.35, size * 0.55, 8),
        new THREE.MeshStandardMaterial({ color: 0x4a6741 }),
      );
      foliage.position.y = size * 0.35 + size * 0.25;
      foliage.castShadow = true;
      group.add(trunk, foliage);
      break;
    }
    case 'clay_pit':
      addBox(group, size * 0.85, size * 0.25, size * 0.85, 0x6b4423, 0);
      break;
    case 'quarry':
      addBox(group, size, size * 0.4, size, 0x7a7a7a, 0);
      break;
    case 'sand_pit':
      addBox(group, size * 0.9, size * 0.15, size * 0.9, 0xe8d5a3, 0);
      break;
    case 'iron_mine':
      addBox(group, size * 0.7, size * 0.9, size * 0.7, 0x3d4f5f, 0);
      break;
    case 'gold_mine':
      addBox(group, size * 0.75, size * 0.85, size * 0.75, 0xb8860b, 0);
      break;
    case 'lumber_camp':
      addBox(group, size * 0.6, size * 0.5, size * 0.8, 0x8b5a2b, 0);
      break;
    case 'farm_wheat': {
      addBox(group, size * 0.9, size * 0.12, size * 0.9, 0x9a7b4f, 0);
      const crop = new THREE.Mesh(
        new THREE.BoxGeometry(size * 0.15, size * 0.35, size * 0.15),
        new THREE.MeshStandardMaterial({ color: 0xc9a227 }),
      );
      crop.position.set(size * 0.25, size * 0.12 + size * 0.2, size * 0.25);
      crop.castShadow = true;
      group.add(crop);
      break;
    }
    case 'pottery_workshop':
      addBox(group, size * 0.85, size * 0.65, size * 0.85, 0xc67b4e, 0);
      break;
    case 'weaponsmith':
      addBox(group, size * 0.8, size * 0.75, size * 0.8, 0x4a3728, 0);
      break;
    case 'warehouse':
      addBox(group, size, size * 0.55, size * 1.1, 0x8b7355, 0);
      break;
    case 'shrine': {
      const base = size * 0.35;
      addBox(group, base, size * 0.5, base, 0xe8dcc8, 0);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(base * 0.9, size * 0.35, 4),
        new THREE.MeshStandardMaterial({ color: 0xc45c26 }),
      );
      roof.position.y = size * 0.5 + size * 0.2;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      group.add(roof);
      break;
    }
    case 'temple':
      addBox(group, size * 0.95, size * 0.35, size * 1.2, 0xf0e6d2, 0);
      addBox(group, size * 0.7, size * 0.55, size * 0.5, 0xd4af37, size * 0.35);
      break;
    case 'oracle':
      addBox(group, size * 0.5, size * 1.0, size * 0.5, 0x9b59b6, 0);
      break;
    case 'trade_post':
      addBox(group, size, size * 0.6, size * 0.85, 0xa67c52, 0);
      break;
    case 'market':
      addBox(group, size * 0.9, size * 0.45, size * 0.9, 0xcd853f, 0);
      break;
    case 'dock': {
      addBox(group, size, size * 0.2, size * 1.2, 0x5c6bc0, 0);
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(size * 0.06, size * 0.08, size * 0.55, 6),
        new THREE.MeshStandardMaterial({ color: 0x4e342e }),
      );
      post.position.set(size * 0.35, size * 0.2 + size * 0.3, size * 0.35);
      post.castShadow = true;
      group.add(post);
      break;
    }
    default: {
      const _exhaustive: never = type;
      void _exhaustive;
    }
  }

  return group;
}

export function cellToWorld(sx: number, sz: number): THREE.Vector3 {
  return new THREE.Vector3(
    sx * SUB_CELL_WORLD_SIZE + SUB_CELL_WORLD_SIZE / 2,
    0,
    sz * SUB_CELL_WORLD_SIZE + SUB_CELL_WORLD_SIZE / 2,
  );
}

export function syncGridMeshes(
  parent: THREE.Object3D,
  grid: { forEachCell: (fn: (x: number, z: number, building: BuildingType) => void) => void },
  meshMap: Record<string, THREE.Object3D>,
): void {
  const seen = new Set<string>();

  grid.forEachCell((x, z, building) => {
    const key = `b:${x},${z}`;
    seen.add(key);
    let mesh = meshMap[key];
    if (!mesh) {
      mesh = createBuildingMesh(building);
      meshMap[key] = mesh;
      parent.add(mesh);
    }
    mesh.position.copy(cellToWorld(x, z));
  });

  for (const key of Object.keys(meshMap)) {
    if (key.startsWith('b:') && !seen.has(key)) {
      const mesh = meshMap[key];
      if (mesh) {
        parent.remove(mesh);
        disposeObject(mesh);
        delete meshMap[key];
      }
    }
  }
}

export function syncDepositMeshes(
  parent: THREE.Object3D,
  grid: {
    forEachDeposit: (
      fn: (x: number, z: number, deposit: import('../game/types').NaturalDeposit) => void,
    ) => void;
    forEachCell: (fn: (x: number, z: number, building: BuildingType) => void) => void;
  },
  meshMap: Record<string, THREE.Object3D>,
): void {
  const builtOn = new Set<string>();
  grid.forEachCell((x, z) => {
    builtOn.add(`${x},${z}`);
  });

  const seen = new Set<string>();

  grid.forEachDeposit((x, z, deposit) => {
    if (deposit.richness <= 0 || builtOn.has(`${x},${z}`)) return;
    const key = `d:${x},${z}`;
    seen.add(key);
    let mesh = meshMap[key];
    if (!mesh) {
      mesh = createDepositOverlay(deposit.type, deposit.richness);
      meshMap[key] = mesh;
      parent.add(mesh);
    }
    mesh.position.copy(cellToWorld(x, z));
  });

  for (const key of Object.keys(meshMap)) {
    if (key.startsWith('d:') && !seen.has(key)) {
      const mesh = meshMap[key];
      if (mesh) {
        parent.remove(mesh);
        disposeObject(mesh);
        delete meshMap[key];
      }
    }
  }
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  });
}
