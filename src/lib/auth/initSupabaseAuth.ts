import { getSupabaseClient } from './supabaseClient';
import { authSession, clearSession, setGuestSession } from './sessionStore';

/** Sync Supabase auth state into `authSession` (guest when signed out). */
export function initSupabaseAuth(): void {
  const supabase = getSupabaseClient();
  if (!supabase) {
    setGuestSession();
    return;
  }

  const applySession = async () => {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.user) {
      setGuestSession();
      return;
    }
    authSession.set({
      user: { id: session.user.id, email: session.user.email ?? null },
      accessToken: session.access_token,
    });
  };

  void applySession();

  supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      clearSession();
      setGuestSession();
      return;
    }
    authSession.set({
      user: { id: session.user.id, email: session.user.email ?? null },
      accessToken: session.access_token,
    });
  });
}
