import type { CitySnapshot, GameCommand } from '../game/types';
import type { SyncAdapter } from './types';

const STORAGE_KEY = 'civitas-city-v1';
const LEGACY_STORAGE_KEY = 'caesar-clone-city-v1';

export const localAdapter: SyncAdapter = {
  async loadCity(_cityId: string): Promise<CitySnapshot | null> {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CitySnapshot;
    } catch {
      return null;
    }
  },

  async saveCity(_cityId: string, snapshot: CitySnapshot): Promise<{ revision: number }> {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return { revision: snapshot.revision };
  },

  broadcastCommand(_command: GameCommand): void {
    // No-op in offline v0
  },

  onRemoteCommand(_handler: (command: GameCommand) => void): () => void {
    return () => {};
  },
};
