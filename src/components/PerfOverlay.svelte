<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { flushPerfDisplay, perfDisplay, perfEnabled } from '../lib/perf/perfMonitor';

  let flushId: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    flushId = setInterval(() => {
      if ($perfEnabled) flushPerfDisplay();
    }, 1000);
  });

  onDestroy(() => {
    if (flushId !== null) clearInterval(flushId);
  });

  function fmtMs(n: number | undefined): string {
    if (n === undefined) return '—';
    return n < 10 ? n.toFixed(1) : String(Math.round(n));
  }
</script>

{#if $perfEnabled && $perfDisplay}
  <aside
    class="perf-panel pointer-events-none absolute top-14 left-2 z-30 max-w-[min(100%,20rem)] rounded border border-stone-600/80 bg-stone-dark/92 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-stone-100 shadow-lg sm:text-[11px]"
    aria-label="Performance overlay"
  >
    <div class="mb-1 text-[9px] tracking-wide text-amber-200/90 uppercase">Perf</div>
    <div class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
      <span class="text-stone-400">rAF</span>
      <span>{$perfDisplay.rafFps} fps · {$perfDisplay.frameMs} ms</span>
      <span class="text-stone-400">Render</span>
      <span>{$perfDisplay.renderFps} fps · {$perfDisplay.rendersPerSec}/s draws</span>
      <span class="text-stone-400">Sim</span>
      <span
        >{$perfDisplay.simHz} Hz ({$perfDisplay.simHzTarget}) · tick
        {$perfDisplay.lastTickMs} ms</span
      >
      {#if $perfDisplay.lastSlowTickMs !== null}
        <span class="text-stone-400">Slow</span>
        <span>{$perfDisplay.lastSlowTickMs} ms</span>
      {/if}
      <span class="text-stone-400">GPU</span>
      <span>{$perfDisplay.triangles.toLocaleString()} tri · {$perfDisplay.drawCalls} dc</span>
      <span class="text-stone-400">GPU mem</span>
      <span>{$perfDisplay.geometries} geo · {$perfDisplay.textures} tex</span>
      {#if $perfDisplay.heapMb !== null}
        <span class="text-stone-400">Heap</span>
        <span>{$perfDisplay.heapMb} MB</span>
      {/if}
      <span class="text-stone-400">Chunks</span>
      <span>{$perfDisplay.visibleChunks} vis · {$perfDisplay.meshRebuildsPerSec}/s rebuild</span>
    </div>
    {#if $perfDisplay.worker}
      {@const w = $perfDisplay.worker}
      <div class="mt-1.5 border-t border-stone-600/60 pt-1.5 text-stone-300">
        <div class="mb-0.5 text-[9px] text-stone-400 uppercase">Worker</div>
        <div class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
          <span class="text-stone-500">prod</span><span>{fmtMs(w.productionMs)} ms</span>
          <span class="text-stone-500">walk</span><span>{fmtMs(w.walkersMs)} ms</span>
          <span class="text-stone-500">econ</span>
          <span>{fmtMs(w.economyFastMs)} / {fmtMs(w.economySlowMs)} ms</span>
          <span class="text-stone-500">house</span><span>{fmtMs(w.housingMs)} ms</span>
          <span class="text-stone-500">upkeep</span><span>{fmtMs(w.upkeepMs)} ms</span>
          <span class="text-stone-500">eng</span><span>{fmtMs(w.engineersMs)} ms</span>
        </div>
      </div>
    {/if}
  </aside>
{/if}
