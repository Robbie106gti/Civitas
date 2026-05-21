import * as THREE from 'three';
import type { GameGrid } from '../game/grid';
import { SUB_CELL_WORLD_SIZE } from '../game/constants';
import { getFootprint } from '../game/footprints';
import { gridElevationSampler, sampleFootprintSurface } from '../game/terrainSurface';
import type { ToolId } from '../game/types';
import { evaluatePlacement } from '../game/applyCommand';
import { footprintAnchorToWorld } from './buildingComposer';

const VALID_COLOR = 0x4ade80;
const INVALID_COLOR = 0xf87171;
const ERASE_COLOR = 0xfbbf24;

const validMat = new THREE.MeshBasicMaterial({
  color: VALID_COLOR,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
});

const invalidMat = new THREE.MeshBasicMaterial({
  color: INVALID_COLOR,
  transparent: true,
  opacity: 0.32,
  depthWrite: false,
});

const eraseMat = new THREE.MeshBasicMaterial({
  color: ERASE_COLOR,
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});

const outlineMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});

const padGeo = new THREE.PlaneGeometry(1, 1);
padGeo.rotateX(-Math.PI / 2);

export function createPlacementHighlight(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'placementHighlight';
  group.visible = false;

  const pad = new THREE.Mesh(padGeo, validMat);
  pad.name = 'pad';
  group.add(pad);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(padGeo),
    outlineMat,
  );
  edges.name = 'outline';
  group.add(edges);

  return group;
}

export function updatePlacementHighlight(
  group: THREE.Group,
  grid: GameGrid,
  tool: ToolId,
  anchorSx: number,
  anchorSz: number,
): void {
  const pad = group.getObjectByName('pad') as THREE.Mesh | undefined;
  const outline = group.getObjectByName('outline') as THREE.LineSegments | undefined;
  if (!pad || !outline) return;

  const fp =
    tool === 'erase' ? { w: 1, h: 1 } : getFootprint(tool);
  const result = evaluatePlacement(grid, tool, anchorSx, anchorSz);

  const sample = gridElevationSampler(grid);
  const surface = sampleFootprintSurface(anchorSx, anchorSz, fp, sample, (sx, sz) =>
    grid.getTerrain(sx, sz).dugDepth,
  );
  const anchorY = surface.baseY + SUB_CELL_WORLD_SIZE * 0.06;
  const world = footprintAnchorToWorld(anchorSx, anchorSz, anchorY);
  group.position.copy(world);

  const w = fp.w * SUB_CELL_WORLD_SIZE;
  const d = fp.h * SUB_CELL_WORLD_SIZE;
  pad.scale.set(w * 0.96, d * 0.96, 1);
  outline.scale.copy(pad.scale);
  outline.position.set(w * 0.5, 0, d * 0.5);
  pad.position.set(w * 0.5, 0, d * 0.5);

  if (tool === 'erase') {
    pad.material = eraseMat;
  } else {
    pad.material = result.ok ? validMat : invalidMat;
  }

  group.visible = true;
}

export function hidePlacementHighlight(group: THREE.Group): void {
  group.visible = false;
}
