<script lang="ts">
  interface Props {
    onContinue: () => void;
  }

  let { onContinue }: Props = $props();

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onContinue();
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div
  class="screen-root bg-stone flex flex-col items-center justify-center gap-8 px-6 text-center"
  role="presentation"
>
  <div class="flex flex-col items-center gap-3">
    <p class="text-terracotta text-xs font-semibold tracking-[0.35em] uppercase">Imperium</p>
    <h1 class="text-stone-dark text-4xl font-bold tracking-tight sm:text-5xl">
      Civitas
    </h1>
    <p class="text-stone-dark/80 max-w-sm text-sm sm:text-base">
      Build your Roman city. Rule wisely.
    </p>
  </div>

  <button type="button" class="btn-primary" onclick={onContinue}>
    Press to Continue
  </button>

  <p class="text-stone-dark/50 text-xs">Enter or Space also works</p>
</div>

<style>
  .screen-root {
    min-height: 100dvh;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
</style>
