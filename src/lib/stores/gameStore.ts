import { writable } from 'svelte/store';
import { createEmptyInventory } from '../game/inventory';
import { GameGrid } from '../game/grid';
import { createDefaultSocietySnapshot } from '../game/society';
import type { CityInventory, DisasterEvent, SocialEvent, SocietySnapshot } from '../game/types';

export const gameGrid = writable(new GameGrid());
export const denarii = writable(500);
export const cityInventory = writable<CityInventory>(createEmptyInventory());
export const society = writable<SocietySnapshot>(createDefaultSocietySnapshot());
export const simTimeDisplay = writable(0);
export const placementError = writable<string | null>(null);
export const governanceError = writable<string | null>(null);
export const activeDisaster = writable<DisasterEvent | null>(null);
export const activeSocialEvent = writable<SocialEvent | null>(null);
