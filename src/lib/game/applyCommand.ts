import { getBuildingDef } from './buildings';
import { needsConstruction } from './construction';
import { depositMatchesExtractor } from './resources';
import type { BuildingType, GameCommand, ToolId } from './types';
import type { GameGrid } from './grid';
import { getFootprint } from './footprints';

export type ApplyCommandResult = { ok: true } | { ok: false; reason: string };

export function applyCommand(grid: GameGrid, command: GameCommand): ApplyCommandResult {
  switch (command.type) {
    case 'placeBuilding':
      return tryPlaceBuilding(grid, command.tool, command.sx, command.sz);
    case 'eraseBuilding':
      return tryEraseBuilding(grid, command.sx, command.sz);
    case 'digTerrain':
      return tryDigTerrain(grid, command.sx, command.sz);
    default: {
      const _exhaustive: never = command;
      return _exhaustive;
    }
  }
}

export function evaluatePlacement(
  grid: GameGrid,
  tool: ToolId,
  sx: number,
  sz: number,
): ApplyCommandResult {
  if (tool === 'erase') {
    return grid.canEraseAt(sx, sz)
      ? { ok: true }
      : { ok: false, reason: 'Nothing to erase' };
  }
  return evaluateBuildingPlacement(grid, tool, sx, sz);
}

function evaluateBuildingPlacement(
  grid: GameGrid,
  tool: BuildingType,
  sx: number,
  sz: number,
): ApplyCommandResult {
  const def = getBuildingDef(tool);
  const fp = getFootprint(tool);

  if (def.category === 'natural_extractor') {
    let foundDeposit = false;
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const deposit = grid.getDeposit(sx + dx, sz + dz);
        if (depositMatchesExtractor(deposit, def.requiredDeposit)) {
          foundDeposit = true;
          break;
        }
      }
      if (foundDeposit) break;
    }
    if (!foundDeposit) {
      return {
        ok: false,
        reason: def.requiredDeposit
          ? `Requires ${def.requiredDeposit} deposit under footprint`
          : 'Invalid extractor placement',
      };
    }
  }

  const check = grid.canPlaceFootprint(sx, sz, tool);
  if (!check.ok) return check;

  if (tool === 'dock' && !grid.hasWaterAdjacentToFootprint(sx, sz, tool)) {
    return { ok: false, reason: 'Dock must be adjacent to water' };
  }

  return { ok: true };
}

function tryPlaceBuilding(
  grid: GameGrid,
  tool: BuildingType,
  sx: number,
  sz: number,
): ApplyCommandResult {
  const check = evaluateBuildingPlacement(grid, tool, sx, sz);
  if (!check.ok) return check;

  const placed = needsConstruction(tool)
    ? grid.setConstructionSite(sx, sz, tool)
    : grid.setBuilding(sx, sz, tool);
  if (!placed) {
    return { ok: false, reason: 'Could not place building' };
  }
  return { ok: true };
}

function tryEraseBuilding(grid: GameGrid, sx: number, sz: number): ApplyCommandResult {
  if (!grid.eraseAt(sx, sz)) {
    return { ok: false, reason: 'Nothing to erase' };
  }
  return { ok: true };
}

function tryDigTerrain(grid: GameGrid, sx: number, sz: number): ApplyCommandResult {
  if (grid.hasWaterAt(sx, sz)) {
    return { ok: false, reason: 'Cannot dig underwater' };
  }
  if (!grid.digSubCell(sx, sz)) {
    return { ok: false, reason: 'Already at max depth' };
  }
  return { ok: true };
}
