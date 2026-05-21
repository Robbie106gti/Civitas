import * as THREE from 'three';
import {
  constructionBuildingProgress,
  constructionLevelingProgress,
  type ConstructionSite,
} from '../game/construction';
import { getFootprint } from '../game/footprints';
import { SUB_CELL_WORLD_SIZE } from '../game/constants';
import { footprintAnchorToWorld } from './buildingComposer';

const scaffoldMat = new THREE.MeshStandardMaterial({
  color: 0xc4a574,
  roughness: 0.92,
  metalness: 0.02,
});

const padMat = new THREE.MeshStandardMaterial({
  color: 0x8a7a62,
  roughness: 0.95,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});

const beamGeo = new THREE.BoxGeometry(
  SUB_CELL_WORLD_SIZE * 0.12,
  SUB_CELL_WORLD_SIZE * 2.2,
  SUB_CELL_WORLD_SIZE * 0.12,
);

const padGeo = new THREE.BoxGeometry(1, SUB_CELL_WORLD_SIZE * 0.08, 1);

/**
 * Simple scaffold + cleared pad for a building site.
 * Partial structure is rendered separately via scaled instanced building mesh.
 */
export function createConstructionScaffoldGroup(
  site: ConstructionSite,
  anchorY: number,
): THREE.Group {
  const fp = getFootprint(site.building);
  const group = new THREE.Group();
  const world = footprintAnchorToWorld(site.sx, site.sz, anchorY);
  group.position.copy(world);

  const w = fp.w * SUB_CELL_WORLD_SIZE;
  const d = fp.h * SUB_CELL_WORLD_SIZE;
  const levelT =
    site.phase === 'leveling'
      ? constructionLevelingProgress(site)
      : 1;
  const buildT =
    site.phase === 'building' ? constructionBuildingProgress(site) : 0;

  const pad = new THREE.Mesh(padGeo, padMat);
  const padFill =
    site.phase === 'leveling' ? 0.55 + levelT * 0.35 : 0.92;
  pad.scale.set(w * padFill, 1, d * padFill);
  pad.position.set(w * 0.5, SUB_CELL_WORLD_SIZE * 0.04, d * 0.5);
  pad.receiveShadow = true;
  group.add(pad);
  const poleH =
    SUB_CELL_WORLD_SIZE *
    (site.phase === 'leveling' ? 0.6 + levelT * 0.5 : 1.2 + buildT * 2.2);
  const corners = [
    [0, 0],
    [w, 0],
    [0, d],
    [w, d],
  ] as const;
  for (const [cx, cz] of corners) {
    const pole = new THREE.Mesh(beamGeo, scaffoldMat);
    pole.scale.y = poleH / (SUB_CELL_WORLD_SIZE * 2.2);
    pole.position.set(cx, poleH * 0.5, cz);
    pole.castShadow = true;
    group.add(pole);
  }

  const midX = w * 0.5;
  const midZ = d * 0.5;
  if (site.phase === 'building') {
    const crossW = new THREE.Mesh(beamGeo, scaffoldMat);
    crossW.scale.set(w / (SUB_CELL_WORLD_SIZE * 0.12), 0.35, 0.35);
    crossW.position.set(midX, poleH * 0.65, 0);
    crossW.castShadow = true;
    group.add(crossW);

    const crossD = new THREE.Mesh(beamGeo, scaffoldMat);
    crossD.scale.set(0.35, 0.35, d / (SUB_CELL_WORLD_SIZE * 0.12));
    crossD.position.set(0, poleH * 0.65, midZ);
    crossD.castShadow = true;
    group.add(crossD);
  }

  return group;
}

/** Vertical scale for in-progress building reveal (0.12 → 1). */
export function constructionRevealScale(progress: number): number {
  return 0.12 + Math.min(1, Math.max(0, progress)) * 0.88;
}
