<script lang="ts">
  import { onMount } from 'svelte';
  import { prefetchPlayBundles } from '../lib/bundlePrefetch';
  import { preloadGameAssets } from '../lib/game/preloadAssets';
  import { probeSavedGame } from '../lib/game/persistCity';
  import { goToMenu, hasSavedGame } from '../lib/stores/appPhaseStore';

  let progress = $state(0);
  let status = $state('Preparing the province…');

  onMount(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      try {
        status = 'Surveying terrain…';
        progress = 15;
        const saveProbe = probeSavedGame();
        prefetchPlayBundles();
        await preloadGameAssets();
        if (cancelled) return;
        progress = 85;
        status = 'Stocking the granaries…';
        const saved = await saveProbe;
        if (cancelled) return;
        hasSavedGame.set(saved);
        progress = 100;
        status = 'Ready.';
        await new Promise((r) => setTimeout(r, 280));
        if (!cancelled) goToMenu();
      } catch {
        if (!cancelled) {
          hasSavedGame.set(false);
          goToMenu();
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  });
</script>

<div
  class="screen-root bg-stone flex flex-col items-center justify-center gap-6 px-8 text-center"
  role="status"
  aria-live="polite"
  aria-busy="true"
>
  <p class="text-terracotta text-xs font-semibold tracking-[0.3em] uppercase">Loading</p>
  <h2 class="text-stone-dark text-2xl font-semibold">Establishing camp</h2>
  <p class="text-stone-dark/75 text-sm">{status}</p>

  <div class="bg-stone-dark/15 h-2 w-full max-w-xs overflow-hidden rounded-full">
    <div
      class="bg-terracotta h-full rounded-full transition-[width] duration-300 ease-out"
      style="width: {progress}%"
    ></div>
  </div>

  <p class="text-stone-dark/50 tabular-nums text-xs">{progress}%</p>
</div>

<style>
  .screen-root {
    min-height: 100dvh;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
