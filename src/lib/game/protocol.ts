import type { CityMetrics } from './sim/cityMetrics';
import type {
  BuildingType,
  CityInventory,
  CitySnapshot,
  DisasterEvent,
  NaturalDeposit,
  ResourceType,
  SocialEvent,
  SocietySnapshot,
  TaxRateLevel,
  WalkerState,
} from './types';

export type WorkerPingMessage = { type: 'ping' };
export type WorkerPongMessage = { type: 'pong' };

export type WorkerInitGridMessage = {
  type: 'initGrid';
  worldSeed: number;
  deposits: { key: string; deposit: NaturalDeposit }[];
  buildings: { key: string; building: BuildingType }[];
  traffic: { key: string; heat: number }[];
  inventory: CityInventory;
  society?: SocietySnapshot;
  housing?: { key: string; score: number; tier: 0 | 1 | 2 }[];
  upkeep?: {
    key: string;
    condition: number;
    entropy: number;
    lastMaintainedTick: number;
    evolutionScore?: number;
    materialStarved?: boolean;
  }[];
};

export type WorkerInitGridAckMessage = { type: 'initGridAck' };

export type WorkerSyncCityMessage = {
  type: 'syncCity';
  buildings: { key: string; building: BuildingType | null }[];
  deposits: { key: string; deposit: NaturalDeposit }[];
  traffic: { key: string; heat: number }[];
  occupancy: { key: string; building: BuildingType | null }[];
  inventory: CityInventory;
  society?: SocietySnapshot;
  /** When true, merge arrays into worker state instead of replacing maps. */
  partial?: boolean;
};

export type WorkerSetTaxRateMessage = {
  type: 'governance.setTaxRate';
  rateLevel: TaxRateLevel;
};

export type WorkerFulfillEdictMessage = { type: 'governance.fulfillEdict' };

export type WorkerTradeMessage = {
  type: 'governance.trade';
  action: 'buy' | 'sell';
  resource: ResourceType;
  quantity: number;
};

export type WorkerGovernanceAckMessage = {
  type: 'governance.ack';
  society: SocietySnapshot;
  inventory?: CityInventory;
};

export type WorkerGovernanceErrorMessage = {
  type: 'governance.error';
  reason: string;
};

export type WorkerSimTickMessage = {
  type: 'sim.tick';
  deltaMs: number;
  /** When true, worker returns timing breakdown (dev perf overlay only). */
  perf?: boolean;
};

export type WorkerPerfSnapshot = {
  tickMs: number;
  productionMs: number;
  walkersMs: number;
  animalsMs: number;
  disastersMs: number;
  economyFastMs: number;
  economySlowMs: number;
  housingMs: number;
  upkeepMs: number;
  engineersMs: number;
};

export type WorkerSimTickResultMessage = {
  type: 'sim.tickResult';
  simTime: number;
  revision: number;
  entities: number;
  resources: { denarii: number; inventory: CityInventory };
  /** Authoritative society refresh (slow tick only). */
  society?: SocietySnapshot;
  /** Latest compact metrics (every tick; from last slow recompute). */
  metrics: CityMetrics;
  slowTick: boolean;
  deposits?: { key: string; deposit: NaturalDeposit }[];
  walkers?: WalkerState[];
  disasters?: DisasterEvent[];
  trafficRoads?: { key: string; building: BuildingType }[];
  extractorDigAnchors?: { key: string; building: BuildingType }[];
  housingUpdates?: { key: string; score: number; tier: 0 | 1 | 2 }[];
  upkeepUpdates?: {
    key: string;
    condition: number;
    entropy: number;
    evolutionScore: number;
    materialStarved: boolean;
  }[];
  civicEvolution?: { key: string; evolutionScore: number; tierChanged: boolean }[];
  engineers?: { id: number; sx: number; sz: number; targetSx: number; targetSz: number }[];
  socialEvents?: SocialEvent[];
  perf?: WorkerPerfSnapshot;
};

export type WorkerAnimSamplePathsMessage = {
  type: 'anim.samplePaths';
  walkerIds: number[];
};

export type WorkerAnimPathBuffersMessage = {
  type: 'anim.pathBuffers';
  buffers: Float32Array[];
};

export type WorkerEncodeSaveMessage = {
  type: 'job.encodeSave';
  snapshot: CitySnapshot;
};

export type WorkerEncodeSaveResultMessage = {
  type: 'job.encodeSaveResult';
  json: string;
};

export type WorkerToMainMessage =
  | WorkerPongMessage
  | WorkerInitGridAckMessage
  | WorkerSimTickResultMessage
  | WorkerAnimPathBuffersMessage
  | WorkerEncodeSaveResultMessage
  | WorkerGovernanceAckMessage
  | WorkerGovernanceErrorMessage;

export type MainToWorkerMessage =
  | WorkerPingMessage
  | WorkerInitGridMessage
  | WorkerSimTickMessage
  | WorkerSyncCityMessage
  | WorkerSetTaxRateMessage
  | WorkerFulfillEdictMessage
  | WorkerTradeMessage
  | WorkerAnimSamplePathsMessage
  | WorkerEncodeSaveMessage;
