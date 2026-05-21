import { isSupabaseConfigured } from '../auth/supabaseClient';
import { localAdapter } from './localAdapter';
import { supabaseAdapter } from './supabaseAdapter';
import type { SyncAdapter } from './types';

let adapter: SyncAdapter = isSupabaseConfigured() ? supabaseAdapter : localAdapter;

export function getSyncAdapter(): SyncAdapter {
  return adapter;
}

export function setSyncAdapter(next: SyncAdapter): void {
  adapter = next;
}

export function useLocalSyncAdapter(): void {
  adapter = localAdapter;
}

export function useSupabaseSyncAdapter(): void {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase env vars missing — cannot enable cloud saves');
  }
  adapter = supabaseAdapter;
}
