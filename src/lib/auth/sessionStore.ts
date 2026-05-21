import { writable } from 'svelte/store';

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface AuthSession {
  user: SessionUser | null;
  accessToken: string | null;
}

const initial: AuthSession = { user: null, accessToken: null };

export const authSession = writable<AuthSession>(initial);

export function setGuestSession(): void {
  authSession.set({
    user: { id: 'guest', email: null },
    accessToken: null,
  });
}

export function clearSession(): void {
  authSession.set(initial);
}
