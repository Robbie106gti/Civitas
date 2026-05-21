import { canAfford, deductCost } from '../inventory';
import type { CityInventory, EdictRequest, PoliticsState, ResourceType } from '../types';

/** Sim ticks between new emperor requests (~50s at 12 Hz). */
export const REQUEST_INTERVAL_TICKS = 600;

/** Ticks to fulfill an active request (~30s at 12 Hz). */
export const REQUEST_DEADLINE_TICKS = 360;

const TRIBUTE_RESOURCES: ResourceType[] = ['wheat', 'pottery', 'wine', 'weapons', 'wood'];

let requestIdSeq = 0;

function nextRequestId(): string {
  requestIdSeq += 1;
  return `edict-${requestIdSeq}`;
}

export function createRandomEdict(tick: number): EdictRequest {
  const resource = TRIBUTE_RESOURCES[Math.floor(Math.random() * TRIBUTE_RESOURCES.length)]!;
  const amount = 5 + Math.floor(Math.random() * 11);
  return {
    id: nextRequestId(),
    type: 'tribute',
    resource,
    amount,
    createdAtTick: tick,
    deadlineTick: tick + REQUEST_DEADLINE_TICKS,
  };
}

export function runPoliticsTick(state: PoliticsState, tick: number): void {
  state.tickCounter = tick;

  if (!state.activeRequest && tick > 0 && tick % REQUEST_INTERVAL_TICKS === 0) {
    state.activeRequest = createRandomEdict(tick);
    state.emperorMood = 'neutral';
  }

  if (state.activeRequest && tick >= state.activeRequest.deadlineTick) {
    state.favorRating = Math.max(0, state.favorRating - 10);
    state.emperorMood = 'displeased';
    state.activeRequest = null;
  }

  updateEmperorMood(state);
}

function updateEmperorMood(state: PoliticsState): void {
  if (state.favorRating >= 70) {
    state.emperorMood = 'pleased';
  } else if (state.favorRating <= 35) {
    state.emperorMood = 'displeased';
  } else {
    state.emperorMood = 'neutral';
  }
}

export function fulfillActiveEdict(
  state: PoliticsState,
  inventory: CityInventory,
): { ok: true } | { ok: false; reason: string } {
  const req = state.activeRequest;
  if (!req) {
    return { ok: false, reason: 'No active request' };
  }
  const cost = { [req.resource]: req.amount } as Partial<Record<ResourceType, number>>;
  if (!canAfford(inventory, cost)) {
    return { ok: false, reason: `Need ${req.amount} ${req.resource}` };
  }
  deductCost(inventory, cost);
  state.favorRating = Math.min(100, state.favorRating + 8);
  state.activeRequest = null;
  updateEmperorMood(state);
  return { ok: true };
}

export function politicsHappinessModifier(state: PoliticsState): number {
  if (state.emperorMood === 'pleased') return 5;
  if (state.emperorMood === 'displeased') return -10;
  return 0;
}
