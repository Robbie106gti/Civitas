import type { CitySnapshot, GameCommand } from '../game/types';

export type SessionMode = 'companion' | 'coop';

export interface StatePatch {
  revision: number;
  ops: GameCommand[];
}

export interface SyncAdapter {
  loadCity(cityId: string): Promise<CitySnapshot | null>;
  saveCity(cityId: string, snapshot: CitySnapshot): Promise<{ revision: number }>;
  broadcastCommand?(command: GameCommand): void;
  onRemoteCommand?(handler: (command: GameCommand) => void): () => void;
}
