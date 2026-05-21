<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import PerfOverlay from './PerfOverlay.svelte';
  import { togglePerf } from '../lib/perf/perfMonitor';
  import GovernancePanel from './GovernancePanel.svelte';
  import Toolbar from './Toolbar.svelte';
  import { persistCity } from '../lib/game/persistCity';
  import { governancePanelOpen, workerBridgeRef } from '../lib/stores/governanceStore';
  import { APP_VERSION } from '../lib/appVersion';
  import { RESOURCE_EMOJI } from '../lib/game/buildings';
  import { inventoryEntries } from '../lib/game/inventory';
  import {
    activeDisaster,
    activeSocialEvent,
    denarii,
    cityInventory,
    simTimeDisplay,
    society,
  } from '../lib/stores/gameStore';

  const AUTOSAVE_MS = 30_000;

  const visibleResources = $derived(inventoryEntries($cityInventory));

  let autosaveTimer: ReturnType<typeof setInterval> | null = null;

  function onBeforeUnload(): void {
    void persistCity();
  }

  function onPerfKey(e: KeyboardEvent): void {
    if (e.code === 'Backquote' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      togglePerf();
    }
  }

  onMount(() => {
    autosaveTimer = setInterval(() => {
      void persistCity();
    }, AUTOSAVE_MS);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onPerfKey);
  });

  onDestroy(() => {
    if (autosaveTimer) clearInterval(autosaveTimer);
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('keydown', onPerfKey);
    void persistCity();
  });
</script>

<main class="bg-stone relative flex h-dvh flex-col overflow-hidden">
  <header
    class="flex shrink-0 flex-col gap-1 px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] text-sm"
  >
    <div class="flex items-center justify-between gap-2">
      <h1 class="text-stone-dark font-semibold">Civitas</h1>
      <div class="text-stone-dark/90 flex items-center gap-2 max-sm:text-xs sm:gap-3">
        <span title="Treasury (denarii)">💰 {$denarii}</span>
        <span title="Emperor favor">🏛 {$society.politics.favorRating}</span>
        <span title="Citizen happiness">😊 {$society.happiness}</span>
        <span title="Unrest level">⚠ {$society.social.unrest.level}</span>
        <span title="Religious coverage" class="hidden sm:inline"
          >⛩ {$society.religion.coveragePercent}%</span
        >
        <span class="hidden sm:inline" title="Sim time"
          >⏱ {Math.floor($simTimeDisplay / 1000)}s</span
        >
        <span class="text-xs opacity-70">v{APP_VERSION}</span>
      </div>
    </div>
    {#if visibleResources.length > 0}
      <div
        class="text-stone-dark/90 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
        aria-label="City resources"
      >
        {#each visibleResources as { resource, amount } (resource)}
          <span class="inline-flex items-center gap-0.5" title={resource}>
            <span aria-hidden="true">{RESOURCE_EMOJI[resource]}</span>
            <span class="tabular-nums">{amount}</span>
          </span>
        {/each}
      </div>
    {/if}
  </header>

  {#if $activeDisaster}
    <div
      class="bg-terracotta/95 pointer-events-none absolute top-14 right-2 left-2 z-20 rounded px-3 py-2 text-center text-sm text-white shadow-lg"
      role="status"
    >
      {$activeDisaster.message}
    </div>
  {/if}

  {#if $activeSocialEvent}
    <div
      class="bg-stone-dark/90 pointer-events-none absolute {$activeDisaster
        ? 'top-24'
        : 'top-14'} right-2 left-2 z-20 rounded px-3 py-2 text-center text-sm text-amber-100 shadow-lg"
      role="status"
    >
      {$activeSocialEvent.message}
    </div>
  {/if}

  {#await import('./GameCanvas.svelte')}
    <div class="bg-stone/80 text-stone-dark flex flex-1 items-center justify-center text-sm">
      Loading world…
    </div>
  {:then { default: GameCanvas }}
    <GameCanvas />
  {/await}
  <PerfOverlay />
  <GovernancePanel bridge={$workerBridgeRef} open={$governancePanelOpen} />
  <Toolbar />
</main>
