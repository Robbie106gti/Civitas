import type { SyncAdapter } from './types';
import { localAdapter } from './localAdapter';

let adapter: SyncAdapter = localAdapter;

export function getSyncAdapter(): SyncAdapter {
  return adapter;
}

export function setSyncAdapter(next: SyncAdapter): void {
  adapter = next;
}
