<script lang="ts">
  import { onMount } from 'svelte';
  import { prefetchPlayBundles } from '../lib/bundlePrefetch';
  import { hasSavedGame } from '../lib/stores/appPhaseStore';

  onMount(() => {
    prefetchPlayBundles();
  });

  interface Props {
    onPlay: () => void;
    onContinue: () => void;
  }

  let { onPlay, onContinue }: Props = $props();
</script>

<div
  class="screen-root bg-stone flex flex-col items-center justify-center gap-8 px-6 text-center"
  role="navigation"
  aria-label="Main menu"
>
  <div class="flex flex-col items-center gap-2">
    <p class="text-terracotta text-xs font-semibold tracking-[0.35em] uppercase">Main Menu</p>
    <h1 class="text-stone-dark text-3xl font-bold sm:text-4xl">Civitas</h1>
  </div>

  <div class="flex w-full max-w-xs flex-col gap-3">
    <button type="button" class="btn-primary w-full" onclick={onPlay}>Play Game</button>
    {#if $hasSavedGame}
      <button type="button" class="btn-secondary w-full" onclick={onContinue}>Continue</button>
    {/if}
  </div>

  {#if $hasSavedGame}
    <p class="text-stone-dark/55 text-xs">A saved city was found in this browser.</p>
  {:else}
    <p class="text-stone-dark/55 text-xs">No save yet — start a new province.</p>
  {/if}
</div>

<style>
  .screen-root {
    min-height: 100dvh;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
