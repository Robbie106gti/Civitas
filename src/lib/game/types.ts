/** Raw materials and manufactured goods tracked in city inventory. */
export const RESOURCE_TYPES = [
  'clay',
  'rock',
  'sand',
  'wood',
  'iron',
  'gold',
  'wheat',
  'pottery',
  'weapons',
  'olive_oil',
  'wine',
] as const;

export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const NATURAL_DEPOSIT_TYPES = ['clay', 'rock', 'sand', 'trees', 'iron', 'gold'] as const;

export type NaturalDepositType = (typeof NATURAL_DEPOSIT_TYPES)[number];

export type BuildingCategory =
  | 'natural_extractor'
  | 'farm'
  | 'factory'
  | 'housing'
  | 'civic'
  | 'religion'
  | 'trade'
  | 'road'
  | 'decorative'
  | 'storage';

export const BUILDING_TYPES = [
  'house',
  'dirt_path',
  'road',
  'highway',
  'forum',
  'tree',
  'clay_pit',
  'quarry',
  'sand_pit',
  'iron_mine',
  'gold_mine',
  'lumber_camp',
  'farm_wheat',
  'pottery_workshop',
  'weaponsmith',
  'warehouse',
  'shrine',
  'temple',
  'oracle',
  'trade_post',
  'market',
  'dock',
] as const;

export type BuildingType = (typeof BUILDING_TYPES)[number];

export type ToolId = BuildingType | 'erase';

export interface BuildingDef {
  type: BuildingType;
  category: BuildingCategory;
  label: string;
  emoji: string;
  cost: Partial<Record<ResourceType, number>>;
  outputs?: Partial<Record<ResourceType, number>>;
  inputs?: Partial<Record<ResourceType, number>>;
  labor?: number;
  requiredDeposit?: NaturalDepositType;
  /** Sim ticks until built (0 = instant). Default from category in `construction.ts`. */
  buildTicks?: number;
}

export interface NaturalDeposit {
  type: NaturalDepositType;
  richness: number;
}

/** v4: anchor placement for multi sub-cell buildings. */
export interface BuildingPlacement {
  sx: number;
  sz: number;
  building: BuildingType;
}

/** v5: building under construction at anchor. */
export interface ConstructionSiteSnapshot {
  sx: number;
  sz: number;
  building: BuildingType;
  ticksElapsed: number;
  totalTicks: number;
}

/** v4: single sub-cell occupancy (roads). */
export interface SubGridCell {
  sx: number;
  sz: number;
  building: BuildingType;
  /** v3 macro coords */
  x?: number;
  z?: number;
}

export interface DepositCell {
  sx: number;
  sz: number;
  deposit: NaturalDeposit;
  /** v3 macro coords */
  x?: number;
  z?: number;
}

export interface TerrainCellSnapshot {
  sx: number;
  sz: number;
  dugDepth: number;
}

/** Legacy v3 macro cell (migration only). */
export interface GridCell {
  x: number;
  z: number;
  building: BuildingType;
}

export type CityInventory = Record<ResourceType, number>;

export interface CityResources {
  denarii: number;
  inventory: CityInventory;
}

export const DEITIES = ['jupiter', 'mars', 'ceres'] as const;
export type DeityId = (typeof DEITIES)[number];

export interface ReligionState {
  coveragePercent: number;
  favor: Record<DeityId, number>;
  unrestModifier: number;
}

export type TaxRateLevel = 'none' | 'low' | 'medium' | 'high';

export interface TaxState {
  rateLevel: TaxRateLevel;
  treasury: number;
}

export type EmperorMood = 'pleased' | 'neutral' | 'displeased';

export interface EdictRequest {
  id: string;
  type: 'tribute';
  resource: ResourceType;
  amount: number;
  createdAtTick: number;
  deadlineTick: number;
}

export interface PoliticsState {
  favorRating: number;
  emperorMood: EmperorMood;
  activeRequest: EdictRequest | null;
  tickCounter: number;
}

export interface TradeState {
  lifetimeImports: number;
  lifetimeExports: number;
}

export const NEED_IDS = ['food', 'shelter', 'safety', 'goods', 'culture'] as const;
export type NeedId = (typeof NEED_IDS)[number];

export type FactionAgenda = 'order' | 'prosperity' | 'tradition' | 'reform';

export interface NeedFulfillment {
  food: number;
  shelter: number;
  safety: number;
  goods: number;
  culture: number;
}

export interface UnrestState {
  level: number;
  pressure: number;
}

export interface CrimeState {
  rate: number;
}

export interface FactionState {
  id: string;
  name: string;
  agenda: FactionAgenda;
  support: number;
  loyalty: number;
}

export interface LegitimacyState {
  ruler: number;
  institutions: number;
}

export interface MarketPressureState {
  demandIndex: number;
  priceModifiers: Partial<Record<ResourceType, number>>;
}

export type SocialCrisisKind = 'riot' | 'unrest_wave' | 'revolution_warning' | 'war_threat';

export interface SocialCrisisState {
  kind: SocialCrisisKind | null;
  severity: number;
  ticksRemaining: number;
}

export interface ConflictState {
  revolutionRisk: number;
  warReadiness: number;
  crisis: SocialCrisisState;
}

export interface SocialState {
  needs: NeedFulfillment;
  unrest: UnrestState;
  crime: CrimeState;
  factions: FactionState[];
  legitimacy: LegitimacyState;
  market: MarketPressureState;
  conflict: ConflictState;
}

export interface SocialEvent {
  kind: SocialCrisisKind;
  message: string;
  tick: number;
}

export interface SocietySnapshot {
  religion: ReligionState;
  tax: TaxState;
  politics: PoliticsState;
  trade: TradeState;
  social: SocialState;
  happiness: number;
  population: number;
}

/** Per-house evolution persisted in saves (anchor subKey). */
export interface HouseEvolutionSnapshot {
  key: string;
  score: number;
  tier: 0 | 1 | 2;
}

/** Per-anchor building upkeep / civic evolution (persisted in saves). */
export interface BuildingUpkeepSnapshot {
  key: string;
  condition: number;
  entropy: number;
  lastMaintainedTick: number;
  evolutionScore?: number;
  materialStarved?: boolean;
}

export interface EngineerWalkerSnapshot {
  id: number;
  sx: number;
  sz: number;
  targetSx: number;
  targetSz: number;
}

export type DisasterType = 'fire' | 'earthquake' | 'flood' | 'plague';

export interface DisasterEvent {
  type: DisasterType;
  sx: number;
  sz: number;
  message: string;
  tick: number;
}

export interface WalkerState {
  id: number;
  sx: number;
  sz: number;
  targetSx: number;
  targetSz: number;
  role?: 'citizen' | 'engineer';
  /** Cached A* steps; cleared when the target moves. */
  path?: { sx: number; sz: number }[];
}

export interface CitySnapshot {
  saveFormatVersion: number;
  revision: number;
  worldSeed: number;
  /** v4 sparse anchor placements. */
  placements: BuildingPlacement[];
  /** v5 sites in progress (not yet in `placements`). */
  constructionSites?: ConstructionSiteSnapshot[];
  /** v4 per-sub-cell roads. */
  cells: SubGridCell[];
  deposits: DepositCell[];
  /** Sparse dug-depth overrides (stack from deposit blueprint). */
  terrain?: TerrainCellSnapshot[];
  traffic?: { key: string; heat: number }[];
  exploredChunks?: string[];
  resources: CityResources;
  society?: SocietySnapshot;
  housing?: HouseEvolutionSnapshot[];
  upkeep?: BuildingUpkeepSnapshot[];
  /** v3 migration fields */
  gridWidth?: number;
  gridHeight?: number;
}

export type PlaceBuildingCommand = {
  type: 'placeBuilding';
  tool: BuildingType;
  sx: number;
  sz: number;
};

export type EraseBuildingCommand = {
  type: 'eraseBuilding';
  sx: number;
  sz: number;
};

export type DigTerrainCommand = {
  type: 'digTerrain';
  sx: number;
  sz: number;
};

export type GameCommand = PlaceBuildingCommand | EraseBuildingCommand | DigTerrainCommand;

export { SAVE_FORMAT_VERSION, DEFAULT_MACRO_SIZE, DEFAULT_WORLD_SEED } from './constants';
