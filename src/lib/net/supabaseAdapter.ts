import type { SyncAdapter } from './types';

/**
 * Supabase Realtime + Postgres adapter — Online-2+.
 * Not implemented in v0.
 */
export const supabaseAdapter: SyncAdapter = {
  async loadCity() {
    throw new Error('Supabase adapter not configured — use localAdapter in v0');
  },
  async saveCity() {
    throw new Error('Supabase adapter not configured — use localAdapter in v0');
  },
};
