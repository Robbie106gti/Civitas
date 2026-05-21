import { get } from 'svelte/store';
import { createEmptyInventory } from './inventory';
import { GameGrid } from './grid';
import { createDefaultSocietySnapshot } from './society';
import { getSyncAdapter } from '../net/syncAdapter';
import {
  cityInventory,
  denarii,
  gameGrid,
  society,
} from '../stores/gameStore';

const LOCAL_CITY_ID = 'local';

export async function probeSavedGame(): Promise<boolean> {
  const snap = await getSyncAdapter().loadCity(LOCAL_CITY_ID);
  return snap != null;
}

export function resetNewGame(): void {
  gameGrid.set(new GameGrid());
  denarii.set(500);
  cityInventory.set(createEmptyInventory());
  society.set(createDefaultSocietySnapshot());
}

export async function loadSavedGame(): Promise<boolean> {
  const snap = await getSyncAdapter().loadCity(LOCAL_CITY_ID);
  if (!snap) return false;

  const grid = GameGrid.fromSnapshot(snap);
  gameGrid.set(grid);

  if (snap.resources) {
    denarii.set(snap.resources.denarii);
    cityInventory.set(snap.resources.inventory);
  }
  if (snap.society) {
    society.set(snap.society);
  }
  return true;
}

export async function persistCity(): Promise<void> {
  const grid = get(gameGrid);
  const snapshot = grid.toSnapshot(
    { denarii: get(denarii), inventory: get(cityInventory) },
    get(society),
  );
  await getSyncAdapter().saveCity(LOCAL_CITY_ID, snapshot);
}
