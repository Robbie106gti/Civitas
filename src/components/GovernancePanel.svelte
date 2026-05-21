<script lang="ts">
  import { RESOURCE_EMOJI } from '../lib/game/buildings';
  import { REQUEST_DEADLINE_TICKS } from '../lib/game/sim/politics';
  import { TRADE_PRICES } from '../lib/game/sim/trade';
  import { averageDeityFavor } from '../lib/game/society';
  import { combinedLegitimacy } from '../lib/game/sim/social/legitimacy';
  import { dominantFaction } from '../lib/game/sim/social/factions';
  import { marketPriceMultiplier } from '../lib/game/sim/social/market';
  import { NEED_IDS } from '../lib/game/types';
  import { denarii, governanceError, society } from '../lib/stores/gameStore';
  import type { ResourceType, TaxRateLevel } from '../lib/game/types';

  interface Props {
    bridge: import('../lib/game/workerBridge').WorkerBridge | null;
    open: boolean;
  }

  let { bridge, open }: Props = $props();

  const taxLevels: { id: TaxRateLevel; label: string }[] = [
    { id: 'none', label: 'None' },
    { id: 'low', label: 'Low' },
    { id: 'medium', label: 'Medium' },
    { id: 'high', label: 'High' },
  ];

  const tradeResources: ResourceType[] = ['wheat', 'wood', 'clay', 'pottery', 'wine', 'weapons'];

  let tradeQty = $state(5);
  let selectedTradeResource = $state<ResourceType>('wheat');

  const s = $derived($society);
  const favorPct = $derived(s.politics.favorRating);
  const ticksLeft = $derived(
    s.politics.activeRequest
      ? Math.max(0, s.politics.activeRequest.deadlineTick - s.politics.tickCounter)
      : 0,
  );
  const deadlinePct = $derived(
    s.politics.activeRequest ? Math.round((ticksLeft / REQUEST_DEADLINE_TICKS) * 100) : 0,
  );
  const topFaction = $derived(dominantFaction(s.social.factions));
  const legitimacy = $derived(combinedLegitimacy(s.social.legitimacy));
  const tradePriceMult = $derived(
    marketPriceMultiplier(s.social.market, selectedTradeResource),
  );

  function setTax(level: TaxRateLevel): void {
    bridge?.setTaxRate(level);
  }

  function fulfill(): void {
    bridge?.fulfillEdict();
  }

  function trade(action: 'buy' | 'sell'): void {
    bridge?.trade(action, selectedTradeResource, tradeQty);
  }
</script>

{#if open}
  <section
    class="border-stone-dark/25 bg-stone/95 text-stone-dark max-h-[42vh] overflow-y-auto border-t px-3 py-2 text-xs"
    aria-label="Governance"
  >
    {#if $governanceError}
      <p class="text-terracotta mb-2 text-center">{$governanceError}</p>
    {/if}

    <div class="grid gap-3 sm:grid-cols-2">
      <div>
        <h3 class="mb-1 font-semibold">Taxes & treasury</h3>
        <p class="mb-1 opacity-80">Population: {s.population} · Treasury: {$denarii} denarii</p>
        <div class="flex flex-wrap gap-1">
          {#each taxLevels as level (level.id)}
            <button
              type="button"
              class="rounded px-2 py-1 {s.tax.rateLevel === level.id
                ? 'bg-terracotta text-white'
                : 'bg-stone-dark/10 hover:bg-stone-dark/20'}"
              onclick={() => setTax(level.id)}
            >
              {level.label}
            </button>
          {/each}
        </div>
      </div>

      <div>
        <h3 class="mb-1 font-semibold">Politics</h3>
        <div class="mb-1 flex items-center gap-2">
          <span class="w-14 shrink-0">Favor</span>
          <div class="bg-stone-dark/15 h-2 flex-1 overflow-hidden rounded">
            <div class="bg-terracotta h-full transition-all" style="width: {favorPct}%"></div>
          </div>
          <span class="tabular-nums">{favorPct}</span>
        </div>
        <p class="opacity-80">
          Emperor: {s.politics.emperorMood}
          {#if s.politics.activeRequest}
            · Request: {s.politics.activeRequest.amount}
            {RESOURCE_EMOJI[s.politics.activeRequest.resource]}
            ({ticksLeft} ticks, {deadlinePct}% time left)
          {:else}
            · No active request
          {/if}
        </p>
        {#if s.politics.activeRequest}
          <button
            type="button"
            class="bg-terracotta mt-1 rounded px-2 py-1 text-white"
            onclick={fulfill}
          >
            Deliver tribute
          </button>
        {/if}
      </div>

      <div>
        <h3 class="mb-1 font-semibold">Religion</h3>
        <p class="opacity-80">
          Coverage {s.religion.coveragePercent}% · Gods favor {averageDeityFavor(s.religion.favor)}
          · Unrest {s.religion.unrestModifier >= 0 ? '+' : ''}{s.religion.unrestModifier}
        </p>
        <p class="opacity-70">Temples consume wine each tick when stocked.</p>
      </div>

      <div>
        <h3 class="mb-1 font-semibold">Social needs & unrest</h3>
        <div class="mb-1 grid grid-cols-2 gap-x-2 gap-y-0.5 opacity-90">
          {#each NEED_IDS as need (need)}
            <span class="capitalize">{need}</span>
            <span class="tabular-nums text-right">{s.social.needs[need]}%</span>
          {/each}
        </div>
        <p class="opacity-80">
          Unrest {s.social.unrest.level} (pressure {s.social.unrest.pressure}) · Crime {Math.round(
            s.social.crime.rate,
          )} · Legitimacy {legitimacy}
        </p>
        <p class="opacity-70">
          Leading faction: {topFaction.name} ({topFaction.support}%) · Revolt risk {s.social
            .conflict.revolutionRisk}% · War readiness {s.social.conflict.warReadiness}% (stub)
        </p>
      </div>

      <div>
        <h3 class="mb-1 font-semibold">Happiness</h3>
        <div class="flex items-center gap-2">
          <span class="text-lg" aria-hidden="true">😊</span>
          <div class="bg-stone-dark/15 h-2 flex-1 overflow-hidden rounded">
            <div
              class="h-full transition-all {s.happiness >= 60
                ? 'bg-green-600'
                : s.happiness >= 40
                  ? 'bg-amber-500'
                  : 'bg-red-600'}"
              style="width: {s.happiness}%"
            ></div>
          </div>
          <span class="tabular-nums">{s.happiness}</span>
        </div>
      </div>

      <div class="sm:col-span-2">
        <h3 class="mb-1 font-semibold">Trade</h3>
        <p class="mb-1 opacity-70">
          Imports {$society.trade.lifetimeImports} · Exports {$society.trade.lifetimeExports}
        </p>
        <div class="flex flex-wrap items-end gap-2">
          <label class="flex flex-col gap-0.5">
            <span>Resource</span>
            <select class="bg-stone rounded border px-1 py-0.5" bind:value={selectedTradeResource}>
              {#each tradeResources as r (r)}
                <option value={r}>{RESOURCE_EMOJI[r]} {r}</option>
              {/each}
            </select>
          </label>
          <label class="flex flex-col gap-0.5">
            <span>Qty</span>
            <input
              type="number"
              min="1"
              max="99"
              class="bg-stone w-14 rounded border px-1 py-0.5"
              bind:value={tradeQty}
            />
          </label>
          <span class="opacity-80">
            Buy {Math.ceil(TRADE_PRICES[selectedTradeResource].buy * tradePriceMult)} / Sell {Math.floor(
              TRADE_PRICES[selectedTradeResource].sell * tradePriceMult,
            )} per unit (market ×{tradePriceMult.toFixed(2)})
          </span>
          <button
            type="button"
            class="bg-stone-dark/15 hover:bg-stone-dark/25 rounded px-2 py-1"
            onclick={() => trade('buy')}
          >
            Buy
          </button>
          <button
            type="button"
            class="bg-stone-dark/15 hover:bg-stone-dark/25 rounded px-2 py-1"
            onclick={() => trade('sell')}
          >
            Sell
          </button>
        </div>
      </div>
    </div>
  </section>
{/if}
