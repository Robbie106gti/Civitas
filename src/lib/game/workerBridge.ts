import { isPerfEnabled } from '../perf/perfMonitor';
import type { MainToWorkerMessage, WorkerSimTickResultMessage, WorkerToMainMessage } from './protocol';
import type { GameGrid } from './grid';
import type { CityInventory, ResourceType, SocietySnapshot, TaxRateLevel } from './types';

type MessageHandler = (message: WorkerToMainMessage) => void;
type TickResultHandler = (message: WorkerSimTickResultMessage) => void;
type BuildingCountFn = () => number;

const SIM_HZ_DEFAULT = 12;
const SIM_HZ_TINY = 4;
const TINY_CITY_MAX_BUILDINGS = 12;

function gridToSyncPayload(grid: GameGrid, inventory: CityInventory, society?: SocietySnapshot) {
  const { buildings, deposits, traffic, occupancy } = grid.toSimMaps();
  return {
    buildings: [...buildings.entries()].map(([key, building]) => ({ key, building })),
    deposits: [...deposits.entries()].map(([key, deposit]) => ({ key, deposit: { ...deposit } })),
    traffic: [...traffic.entries()].map(([key, heat]) => ({ key, heat })),
    occupancy: [...occupancy.entries()].map(([key, building]) => ({ key, building })),
    inventory: { ...inventory },
    society: society ? structuredClone(society) : undefined,
  };
}

export function simHzForBuildingCount(count: number): number {
  return count <= TINY_CITY_MAX_BUILDINGS ? SIM_HZ_TINY : SIM_HZ_DEFAULT;
}

export class WorkerBridge {
  private readonly worker: Worker;
  private readonly handlers = new Set<MessageHandler>();
  private tickResultHandler: TickResultHandler | null = null;
  private simTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private getBuildingCount: BuildingCountFn = () => 0;

  constructor() {
    this.worker = new Worker(new URL('../../workers/game.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.addEventListener('message', (event: MessageEvent<WorkerToMainMessage>) => {
      const message = event.data;
      if (message.type === 'sim.tickResult') {
        this.tickResultHandler?.(message);
        return;
      }
      this.dispatch(message);
    });
  }

  /** Sim ticks are delivered here immediately (not only on render frames). */
  onTickResult(handler: TickResultHandler): () => void {
    this.tickResultHandler = handler;
    return () => {
      if (this.tickResultHandler === handler) this.tickResultHandler = null;
    };
  }

  startSimLoop(getBuildingCount?: BuildingCountFn): void {
    if (this.simTimeoutId !== null) return;
    if (getBuildingCount) this.getBuildingCount = getBuildingCount;
    this.scheduleSimTick();
  }

  stopSimLoop(): void {
    if (this.simTimeoutId !== null) {
      clearTimeout(this.simTimeoutId);
      this.simTimeoutId = null;
    }
  }

  private scheduleSimTick(): void {
    const hz = simHzForBuildingCount(this.getBuildingCount());
    const deltaMs = 1000 / hz;
    this.simTimeoutId = setTimeout(() => {
      this.simTimeoutId = null;
      if (isPerfEnabled()) {
        this.post({ type: 'sim.tick', deltaMs, perf: true });
      } else {
        this.post({ type: 'sim.tick', deltaMs });
      }
      this.scheduleSimTick();
    }, deltaMs);
  }

  post(message: MainToWorkerMessage, transfer?: Transferable[]): void {
    if (transfer?.length) {
      this.worker.postMessage(message, transfer);
    } else {
      this.worker.postMessage(message);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  ping(): void {
    this.post({ type: 'ping' });
  }

  initGrid(grid: GameGrid, inventory: CityInventory, society?: SocietySnapshot): void {
    const { buildings, deposits, traffic } = grid.toSimMaps();
    this.post({
      type: 'initGrid',
      worldSeed: grid.worldSeed,
      buildings: [...buildings.entries()].map(([key, building]) => ({ key, building })),
      deposits: [...deposits.entries()].map(([key, deposit]) => ({ key, deposit: { ...deposit } })),
      traffic: [...traffic.entries()].map(([key, heat]) => ({ key, heat })),
      inventory: { ...inventory },
      society: society ? structuredClone(society) : undefined,
      housing: [...grid.housing.toSnapshots()],
      upkeep: [...grid.upkeep.toSnapshots()],
    });
  }

  syncCity(grid: GameGrid, inventory: CityInventory, society?: SocietySnapshot): void {
    const delta = grid.collectSimSyncDelta();
    if (delta) {
      this.post({
        type: 'syncCity',
        ...delta,
        inventory: { ...inventory },
        society: society ? structuredClone(society) : undefined,
        partial: true,
      });
      return;
    }
    const payload = gridToSyncPayload(grid, inventory, society);
    this.post({ type: 'syncCity', ...payload });
  }

  setTaxRate(rateLevel: TaxRateLevel): void {
    this.post({ type: 'governance.setTaxRate', rateLevel });
  }

  fulfillEdict(): void {
    this.post({ type: 'governance.fulfillEdict' });
  }

  trade(action: 'buy' | 'sell', resource: ResourceType, quantity: number): void {
    this.post({ type: 'governance.trade', action, resource, quantity });
  }

  terminate(): void {
    this.stopSimLoop();
    this.worker.terminate();
    this.handlers.clear();
    this.tickResultHandler = null;
  }

  private dispatch(message: WorkerToMainMessage): void {
    for (const handler of this.handlers) {
      handler(message);
    }
  }
}
