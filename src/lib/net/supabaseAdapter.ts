import type { CitySnapshot } from '../game/types';
import { getSupabaseClient } from '../auth/supabaseClient';
import type { SyncAdapter } from './types';

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Supabase is not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  }
  return client;
}

export const supabaseAdapter: SyncAdapter = {
  async loadCity(cityId: string): Promise<CitySnapshot | null> {
    const supabase = requireClient();
    const { data, error } = await supabase
      .from('city_saves')
      .select('snapshot')
      .eq('city_key', cityId)
      .maybeSingle();

    if (error) throw error;
    if (!data?.snapshot) return null;
    return data.snapshot as CitySnapshot;
  },

  async saveCity(cityId: string, snapshot: CitySnapshot): Promise<{ revision: number }> {
    const supabase = requireClient();
    const { error } = await supabase.from('city_saves').upsert(
      {
        city_key: cityId,
        snapshot,
        revision: snapshot.revision,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'city_key' },
    );

    if (error) throw error;
    return { revision: snapshot.revision };
  },
};
