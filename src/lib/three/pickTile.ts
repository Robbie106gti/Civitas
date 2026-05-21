import * as THREE from 'three';
import { SUB_CELL_WORLD_SIZE } from '../game/constants';

export function pickTile(
  ndc: THREE.Vector2,
  camera: THREE.Camera,
  ground: THREE.Object3D,
): { sx: number; sz: number } | null {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(ground, false);
  const hit = hits[0];
  if (!hit?.point) return null;

  const sx = Math.floor(hit.point.x / SUB_CELL_WORLD_SIZE);
  const sz = Math.floor(hit.point.z / SUB_CELL_WORLD_SIZE);
  return { sx, sz };
}
