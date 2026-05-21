<script lang="ts">
  import LoadingScreen from './components/LoadingScreen.svelte';
  import MainMenu from './components/MainMenu.svelte';
  import StartScreen from './components/StartScreen.svelte';
  import { loadSavedGame, resetNewGame } from './lib/game/persistCity';
  import { setGuestSession } from './lib/auth/sessionStore';
  import {
    appPhase,
    goToLoading,
    goToPlaying,
    hasSavedGame,
  } from './lib/stores/appPhaseStore';

  setGuestSession();

  async function handlePlay(): Promise<void> {
    resetNewGame();
    goToPlaying();
  }

  async function handleContinue(): Promise<void> {
    const loaded = await loadSavedGame();
    if (!loaded) {
      hasSavedGame.set(false);
      resetNewGame();
    }
    goToPlaying();
  }
</script>

{#if $appPhase === 'start'}
  <StartScreen onContinue={goToLoading} />
{:else if $appPhase === 'loading'}
  <LoadingScreen />
{:else if $appPhase === 'menu'}
  <MainMenu onPlay={handlePlay} onContinue={handleContinue} />
{:else}
  {#await import('./components/GameShell.svelte')}
    <div
      class="bg-stone flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p class="text-terracotta text-xs font-semibold tracking-[0.3em] uppercase">Loading</p>
      <p class="text-stone-dark text-sm">Preparing the city view…</p>
    </div>
    {:then { default: GameShell }}
    <GameShell />
  {/await}
{/if}


