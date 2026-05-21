import { writable } from 'svelte/store';

export type AppPhase = 'start' | 'loading' | 'menu' | 'playing';

export const appPhase = writable<AppPhase>('start');

/** Set during the initial loading screen after probing localStorage. */
export const hasSavedGame = writable(false);

export function goToLoading(): void {
  appPhase.set('loading');
}

export function goToMenu(): void {
  appPhase.set('menu');
}

export function goToPlaying(): void {
  appPhase.set('playing');
}
