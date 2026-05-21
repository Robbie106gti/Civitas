let started = false;

/**
 * Warm the play-phase JS graph (GameShell → GameCanvas → three vendor) while the
 * user is on the loading screen or menu. Idempotent; safe to call multiple times.
 */
export function prefetchPlayBundles(): void {
  if (started) return;
  started = true;
  void import('../components/GameShell.svelte');
  void import('../components/GameCanvas.svelte');
}
