import { ChunkManager } from './chunkManager';
import {
  applyFootprintLeveling,
  CONSTRUCTION_MESH_REFRESH_TICKS,
  constructionProgress,
  createConstructionSite,
  needsConstruction,
  splitConstructionTicks,
} from './construction';
import { gridElevationSampler } from './terrainSurface';
import { subKey, parseSubKey, subToChunk } from './chunkCoords';
import { prefetchBakedTerrainSections } from './terrainBakedStore';
import { TERRAIN_PREFETCH_RADIUS_CHUNKS } from './terrainSection';
import { HousingRegistry } from './housingState';
import { UpkeepRegistry, defaultUpkeepRecord } from './upkeepState';
import { buildingHasUpkeep } from './buildingUpkeepConfig';
import { getFootprint, isRoadType } from './footprints';
import { generateDeposits } from './resources';
import { getBuildingDef } from './buildings';
import {
  digTerrainCell,
  extractorTargetDugDepth,
  flattenTerrainCell,
  resolveTerrainStack,
  terrainStackForDepositType,
} from './terrain';
import { validateBuildingTerrain } from './terrainSurface';
import type { TerrainCell } from './terrain';
import type { TerrainCellSnapshot } from './types';
import type {
  BuildingPlacement,
  BuildingType,
  CitySnapshot,
  ConstructionSiteSnapshot,
  DepositCell,
  NaturalDeposit,
  SubGridCell,
} from './types';
import type { ConstructionSite } from './construction';
import {
  DEFAULT_MACRO_SIZE,
  DEFAULT_WORLD_SEED,
  SAVE_FORMAT_VERSION,
  SUB_CELLS_PER_TILE,
} from './constants';

/** Facade over infinite chunk-based sub-grid world. */
export class GameGrid {
  readonly chunks: ChunkManager;
  readonly housing = new HousingRegistry();
  readonly upkeep = new UpkeepRegistry();
  /** Legacy macro width for camera bootstrap (sub-cells = macro * SUB_CELLS). */
  readonly width: number;
  readonly height: number;
  readonly worldSeed: number;

  get revision(): number {
    return this.chunks.revision;
  }

  constructor(
    macroWidth = DEFAULT_MACRO_SIZE,
    macroHeight = DEFAULT_MACRO_SIZE,
    worldSeed = DEFAULT_WORLD_SEED,
  ) {
    this.width = macroWidth;
    this.height = macroHeight;
    this.worldSeed = worldSeed;
    this.chunks = new ChunkManager(worldSeed);
    const centerSx = Math.floor((macroWidth * SUB_CELLS_PER_TILE) / 2);
    const centerSz = Math.floor((macroHeight * SUB_CELLS_PER_TILE) / 2);
    this.chunks.updateActiveChunks(centerSx, centerSz);
  }

  /**
   * Fetch baked terrain from `public/terrain/{seed}/` and refresh loaded chunks.
   * Call once after construction (e.g. GameCanvas onMount) before first render.
   */
  static async prefetchTerrain(
    grid: GameGrid,
    centerSx: number,
    centerSz: number,
  ): Promise<number> {
    const { cx, cy } = subToChunk(centerSx, centerSz);
    const loaded = await prefetchBakedTerrainSections(
      grid.worldSeed,
      cx,
      cy,
      TERRAIN_PREFETCH_RADIUS_CHUNKS,
    );
    grid.chunks.refreshTerrainFromBake(
      cx,
      cy,
      TERRAIN_PREFETCH_RADIUS_CHUNKS + 2,
    );
    return loaded;
  }

  get subWidth(): number {
    return this.width * SUB_CELLS_PER_TILE;
  }

  get subHeight(): number {
    return this.height * SUB_CELLS_PER_TILE;
  }

  isInBounds(_sx: number, _sz: number): boolean {
    return true;
  }

  getBuilding(sx: number, sz: number): BuildingType | null {
    if (this.chunks.getConstructionSiteAt(sx, sz)) return null;
    const chunk = this.chunks.getChunkAtSub(sx, sz);
    const key = subKey(sx, sz);
    if (chunk.anchors.has(key)) return chunk.anchors.get(key)!;
    return this.chunks.getBuildingAt(sx, sz);
  }

  getConstructionSite(sx: number, sz: number): ConstructionSite | null {
    return this.chunks.getConstructionSiteAt(sx, sz);
  }

  getDeposit(sx: number, sz: number): NaturalDeposit | null {
    return this.chunks.getDepositAt(sx, sz);
  }

  getTerrain(sx: number, sz: number): TerrainCell {
    return this.chunks.getTerrainAt(sx, sz);
  }

  getTerrainSurfaceLayer(sx: number, sz: number) {
    return this.chunks.getTerrainSurfaceLayer(sx, sz);
  }

  digSubCell(sx: number, sz: number): boolean {
    const deposit = this.getDeposit(sx, sz);
    const stack = resolveTerrainStack(deposit);
    const cell = this.getTerrain(sx, sz);
    if (cell.dugDepth >= stack.length) return false;
    const next = digTerrainCell(cell, stack);
    if (next.dugDepth === cell.dugDepth) return false;
    this.chunks.setTerrainAt(sx, sz, next);
    return true;
  }

  hasWaterAt(sx: number, sz: number): boolean {
    return this.chunks.hasWaterAt(sx, sz);
  }

  /** True if any cell orthogonally outside the footprint touches water. */
  hasWaterAdjacentToFootprint(anchorSx: number, anchorSz: number, type: BuildingType): boolean {
    const fp = getFootprint(type);
    for (let dz = -1; dz <= fp.h; dz++) {
      for (let dx = -1; dx <= fp.w; dx++) {
        if (dx >= 0 && dx < fp.w && dz >= 0 && dz < fp.h) continue;
        if (this.hasWaterAt(anchorSx + dx, anchorSz + dz)) return true;
      }
    }
    return false;
  }

  canPlaceFootprint(
    anchorSx: number,
    anchorSz: number,
    type: BuildingType,
  ): { ok: true } | { ok: false; reason: string } {
    const fp = getFootprint(type);
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const sx = anchorSx + dx;
        const sz = anchorSz + dz;
        if (this.chunks.getBuildingAt(sx, sz) !== null) {
          return { ok: false, reason: 'Area occupied' };
        }
      }
    }
    if (this.chunks.footprintBlockedByConstruction(anchorSx, anchorSz, fp.w, fp.h)) {
      return { ok: false, reason: 'Area occupied' };
    }
    const terrainCheck = validateBuildingTerrain(this, anchorSx, anchorSz, type);
    if (!terrainCheck.ok) return terrainCheck;
    return { ok: true };
  }

  setConstructionSite(anchorSx: number, anchorSz: number, building: BuildingType): boolean {
    if (!needsConstruction(building)) {
      return this.setBuilding(anchorSx, anchorSz, building);
    }
    const check = this.canPlaceFootprint(anchorSx, anchorSz, building);
    if (!check.ok) return false;

    const chunk = this.chunks.getChunkAtSub(anchorSx, anchorSz);
    const aKey = subKey(anchorSx, anchorSz);
    const site = createConstructionSite(
      anchorSx,
      anchorSz,
      building,
      gridElevationSampler(this),
    );
    chunk.constructionSites.set(aKey, site);
    this.chunks.bumpChunkContent(chunk);
    return true;
  }

  /**
   * Advance all construction sites by one sim tick.
   * Returns anchor keys that finished this step and whether meshes should refresh.
   */
  tickConstruction(): { completed: string[]; meshDirty: boolean } {
    const completed: string[] = [];
    let meshDirty = false;

    const sites: { chunk: ReturnType<ChunkManager['getChunkAtSub']>; key: string; site: ConstructionSite }[] =
      [];
    this.chunks.forEachConstructionSite((site) => {
      const chunk = this.chunks.getChunkAtSub(site.sx, site.sz);
      sites.push({ chunk, key: subKey(site.sx, site.sz), site });
    });

    for (const { chunk, key, site } of sites) {
      site.ticksElapsed += 1;
      site.phaseTicksElapsed += 1;

      if (site.phase === 'leveling') {
        const levelT = site.phaseTicksElapsed / site.levelingTicks;
        if (applyFootprintLeveling(this, site, levelT)) {
          meshDirty = true;
        }
        if (site.phaseTicksElapsed >= site.levelingTicks) {
          applyFootprintLeveling(this, site, 1);
          site.phase = 'building';
          site.phaseTicksElapsed = 0;
          meshDirty = true;
        }
      }

      site.progress = constructionProgress(site);
      const done =
        site.phase === 'building' && site.phaseTicksElapsed >= site.buildingTicks;
      if (
        done ||
        site.ticksElapsed % CONSTRUCTION_MESH_REFRESH_TICKS === 0
      ) {
        this.chunks.bumpChunkContent(chunk);
        meshDirty = true;
      }
      if (done) {
        chunk.constructionSites.delete(key);
        if (this.placeCompletedBuilding(site.sx, site.sz, site.building)) {
          completed.push(key);
        }
      }
    }

    return { completed, meshDirty };
  }

  /** Place finished building without re-validating footprint (site already reserved). */
  private placeCompletedBuilding(
    anchorSx: number,
    anchorSz: number,
    building: BuildingType,
  ): boolean {
    const fp = getFootprint(building);
    const chunk = this.chunks.getChunkAtSub(anchorSx, anchorSz);
    const aKey = subKey(anchorSx, anchorSz);

    chunk.anchors.set(aKey, building);
    this.chunks.markSimDirtyBuilding(aKey);
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const cellKey = subKey(anchorSx + dx, anchorSz + dz);
        chunk.cells.set(cellKey, building);
        this.chunks.markSimDirtyOccupancy(cellKey);
      }
    }

    this.chunks.bumpChunkContent(chunk);
    if (building === 'house') {
      this.housing.set(aKey, { score: 8, tier: 0 });
    }
    if (buildingHasUpkeep(building)) {
      this.upkeep.set(aKey, defaultUpkeepRecord(0));
    }
    const def = getBuildingDef(building);
    if (def.category === 'natural_extractor') {
      this.digExtractorFootprint(anchorSx, anchorSz, building);
    }
    return true;
  }

  setBuilding(anchorSx: number, anchorSz: number, building: BuildingType | null): boolean {
    if (building === null) {
      return this.eraseAt(anchorSx, anchorSz);
    }

    const fp = getFootprint(building);
    const check = this.canPlaceFootprint(anchorSx, anchorSz, building);
    if (!check.ok) return false;

    const chunk = this.chunks.getChunkAtSub(anchorSx, anchorSz);

    const aKey = subKey(anchorSx, anchorSz);
    if (isRoadType(building)) {
      chunk.cells.set(aKey, building);
      this.chunks.writeTerrainAt(
        anchorSx,
        anchorSz,
        flattenTerrainCell(this.getTerrain(anchorSx, anchorSz)),
      );
      this.chunks.markSimDirtyBuilding(aKey);
      this.chunks.markSimDirtyOccupancy(aKey);
    } else {
      chunk.anchors.set(aKey, building);
      this.chunks.markSimDirtyBuilding(aKey);
      for (let dz = 0; dz < fp.h; dz++) {
        for (let dx = 0; dx < fp.w; dx++) {
          const cellKey = subKey(anchorSx + dx, anchorSz + dz);
          chunk.cells.set(cellKey, building);
          this.chunks.markSimDirtyOccupancy(cellKey);
        }
      }
    }

    this.chunks.bumpChunkContent(chunk);
    if (building === 'house') {
      this.housing.set(aKey, { score: 8, tier: 0 });
    }
    if (buildingHasUpkeep(building)) {
      this.upkeep.set(aKey, defaultUpkeepRecord(0));
    }
    return true;
  }

  digExtractorFootprint(anchorSx: number, anchorSz: number, tool: BuildingType): void {
    const def = getBuildingDef(tool);
    if (def.category !== 'natural_extractor') return;
    const fp = getFootprint(tool);
    const pitStack =
      def.requiredDeposit != null
        ? terrainStackForDepositType(def.requiredDeposit)
        : resolveTerrainStack(null);
    const pitDepth = extractorTargetDugDepth(pitStack);
    for (let dz = 0; dz < fp.h; dz++) {
      for (let dx = 0; dx < fp.w; dx++) {
        const sx = anchorSx + dx;
        const sz = anchorSz + dz;
        if (this.hasWaterAt(sx, sz)) continue;
        const stack = resolveTerrainStack(this.getDeposit(sx, sz));
        const target = Math.min(pitDepth, stack.length);
        const cell = this.getTerrain(sx, sz);
        if (cell.dugDepth >= target) continue;
        this.chunks.setTerrainAt(sx, sz, { dugDepth: target });
      }
    }
  }

  /** Called each sim tick for active extractors (anchor keys). */
  digExtractorTick(anchors: { sx: number; sz: number; tool: BuildingType }[]): void {
    for (const { sx, sz, tool } of anchors) {
      this.digExtractorFootprint(sx, sz, tool);
    }
  }

  canEraseAt(sx: number, sz: number): boolean {
    if (this.chunks.getConstructionSiteAt(sx, sz)) return true;
    if (this.chunks.getBuildingAt(sx, sz)) return true;

    const chunk = this.chunks.getChunkAtSub(sx, sz);
    const key = subKey(sx, sz);
    if (chunk.anchors.has(key)) return true;
    if (chunk.cells.has(key)) return true;

    for (const [aKey, type] of chunk.anchors) {
      const [axs, azs] = aKey.split(',');
      const ax = Number(axs);
      const az = Number(azs);
      if (Number.isNaN(ax) || Number.isNaN(az)) continue;
      const fp = getFootprint(type);
      if (sx >= ax && sx < ax + fp.w && sz >= az && sz < az + fp.h) return true;
    }
    return false;
  }

  eraseAt(sx: number, sz: number): boolean {
    const site = this.chunks.getConstructionSiteAt(sx, sz);
    if (site) {
      const chunk = this.chunks.getChunkAtSub(site.sx, site.sz);
      const anchorKey = subKey(site.sx, site.sz);
      chunk.constructionSites.delete(anchorKey);
      this.chunks.bumpChunkContent(chunk);
      return true;
    }

    const existing = this.chunks.getBuildingAt(sx, sz);
    if (!existing) return false;

    const chunk = this.chunks.getChunkAtSub(sx, sz);
    const anchorKey = subKey(sx, sz);
    if (chunk.anchors.has(anchorKey)) {
      const type = chunk.anchors.get(anchorKey)!;
      const fp = getFootprint(type);
      chunk.anchors.delete(anchorKey);
      this.chunks.markSimDirtyBuilding(anchorKey);
      for (let dz = 0; dz < fp.h; dz++) {
        for (let dx = 0; dx < fp.w; dx++) {
          const cellKey = subKey(sx + dx, sz + dz);
          chunk.cells.delete(cellKey);
          this.chunks.markSimDirtyOccupancy(cellKey);
        }
      }
      this.chunks.bumpChunkContent(chunk);
      return true;
    }

    if (chunk.cells.has(subKey(sx, sz))) {
      const cellKey = subKey(sx, sz);
      chunk.cells.delete(cellKey);
      this.chunks.markSimDirtyBuilding(cellKey);
      this.chunks.markSimDirtyOccupancy(cellKey);
      this.chunks.bumpChunkContent(chunk);
      return true;
    }

    for (const [aKey, type] of chunk.anchors) {
      const [axs, azs] = aKey.split(',');
      const ax = Number(axs);
      const az = Number(azs);
      if (Number.isNaN(ax) || Number.isNaN(az)) continue;
      const fp = getFootprint(type);
      if (sx >= ax && sx < ax + fp.w && sz >= az && sz < az + fp.h) {
        if (type === 'house') {
          this.housing.delete(aKey);
        }
        this.upkeep.delete(aKey);
        chunk.anchors.delete(aKey);
        this.chunks.markSimDirtyBuilding(aKey);
        for (let dz = 0; dz < fp.h; dz++) {
          for (let dx = 0; dx < fp.w; dx++) {
            const cellKey = subKey(ax + dx, az + dz);
            chunk.cells.delete(cellKey);
            this.chunks.markSimDirtyOccupancy(cellKey);
          }
        }
        this.chunks.bumpChunkContent(chunk);
        return true;
      }
    }

    return false;
  }

  forEachCell(fn: (sx: number, sz: number, building: BuildingType) => void): void {
    this.chunks.forEachAnchor(fn);
    this.chunks.forEachRoadCell(fn);
  }

  forEachDeposit(fn: (sx: number, sz: number, deposit: NaturalDeposit) => void): void {
    this.chunks.forEachDeposit(fn);
  }

  patchDeposits(updates: { key: string; deposit: NaturalDeposit }[]): void {
    this.chunks.patchDeposits(updates);
  }

  updateActiveChunks(centerSx: number, centerSz: number): void {
    this.chunks.updateActiveChunks(centerSx, centerSz);
    this.chunks.exploreAroundSub(centerSx, centerSz);
  }

  toSimMaps(): ReturnType<ChunkManager['toSimMaps']> {
    return this.chunks.toSimMaps();
  }

  collectSimSyncDelta(): ReturnType<ChunkManager['collectSimSyncDelta']> {
    return this.chunks.collectSimSyncDelta();
  }

  applyTrafficRoad(sx: number, sz: number, building: BuildingType): void {
    const chunk = this.chunks.getChunkAtSub(sx, sz);
    chunk.cells.set(subKey(sx, sz), building);
    this.chunks.writeTerrainAt(sx, sz, flattenTerrainCell(this.getTerrain(sx, sz)));
    this.chunks.bumpChunkContent(chunk);
  }

  applyWorkerBuildingRemoval(sx: number, sz: number): void {
    this.eraseAt(sx, sz);
  }

  toSnapshot(
    resources: CitySnapshot['resources'],
    society?: CitySnapshot['society'],
  ): CitySnapshot {
    const placements: BuildingPlacement[] = [];
    const constructionSites: ConstructionSiteSnapshot[] = [];
    const cells: SubGridCell[] = [];

    this.chunks.forEachConstructionSite((site) => {
      constructionSites.push({
        sx: site.sx,
        sz: site.sz,
        building: site.building,
        ticksElapsed: site.ticksElapsed,
        totalTicks: site.totalTicks,
      });
    });
    this.chunks.forEachAnchor((sx, sz, building) => {
      placements.push({ sx, sz, building });
    });
    this.chunks.forEachRoadCell((sx, sz, building) => {
      cells.push({ sx, sz, building });
    });

    const deposits: DepositCell[] = [];
    this.forEachDeposit((sx, sz, deposit) => {
      deposits.push({ sx, sz, deposit: { ...deposit } });
    });

    const terrain: TerrainCellSnapshot[] = [];
    this.chunks.forEachTerrainOverride((sx, sz, cell) => {
      if (cell.dugDepth > 0) terrain.push({ sx, sz, dugDepth: cell.dugDepth });
    });

    const traffic: { key: string; heat: number }[] = [];
    const { traffic: trafficMap } = this.chunks.toSimMaps();
    for (const [key, heat] of trafficMap) {
      traffic.push({ key, heat });
    }

    return {
      saveFormatVersion: SAVE_FORMAT_VERSION,
      revision: this.revision,
      worldSeed: this.worldSeed,
      placements,
      constructionSites: constructionSites.length ? constructionSites : undefined,
      cells,
      deposits,
      terrain,
      traffic,
      exploredChunks: [...this.chunks.exploredChunks],
      resources: {
        denarii: society?.tax.treasury ?? resources.denarii,
        inventory: resources.inventory,
      },
      society,
      housing: this.housing.toSnapshots(),
      upkeep: this.upkeep.toSnapshots(),
    };
  }

  applyHousingUpdates(updates: { key: string; score: number; tier: 0 | 1 | 2 }[]): boolean {
    let tierChanged = false;
    for (const u of updates) {
      const prev = this.housing.get(u.key);
      if (prev?.tier !== u.tier) tierChanged = true;
      this.housing.set(u.key, { score: u.score, tier: u.tier });
    }
    if (tierChanged) {
      for (const u of updates) {
        const p = parseSubKey(u.key);
        if (p) this.chunks.bumpChunkContent(this.chunks.getChunkAtSub(p.sx, p.sz));
      }
    }
    return tierChanged;
  }

  applyUpkeepUpdates(
    updates: {
      key: string;
      condition: number;
      entropy: number;
      evolutionScore: number;
      materialStarved: boolean;
    }[],
    civicEvolution: { key: string; tierChanged: boolean }[] | undefined,
  ): boolean {
    let meshDirty = false;
    for (const u of updates) {
      const prev = this.upkeep.get(u.key);
      this.upkeep.set(u.key, {
        condition: u.condition,
        entropy: u.entropy,
        lastMaintainedTick: prev?.lastMaintainedTick ?? 0,
        evolutionScore: u.evolutionScore,
        materialStarved: u.materialStarved,
      });
    }
    for (const c of civicEvolution ?? []) {
      if (!c.tierChanged) continue;
      const p = parseSubKey(c.key);
      if (p) {
        this.chunks.bumpChunkContent(this.chunks.getChunkAtSub(p.sx, p.sz));
        meshDirty = true;
      }
    }
    return meshDirty;
  }

  static fromSnapshot(snapshot: CitySnapshot): GameGrid {
    const grid = new GameGrid(DEFAULT_MACRO_SIZE, DEFAULT_MACRO_SIZE, snapshot.worldSeed);

    if (snapshot.saveFormatVersion < 4) {
      return GameGrid.migrateFromV3(snapshot);
    }

    for (const s of snapshot.constructionSites ?? []) {
      const chunk = grid.chunks.getChunkAtSub(s.sx, s.sz);
      const site = createConstructionSite(
        s.sx,
        s.sz,
        s.building,
        gridElevationSampler(grid),
      );
      site.ticksElapsed = s.ticksElapsed;
      site.totalTicks = s.totalTicks;
      const { levelingTicks, buildingTicks } = splitConstructionTicks(site.totalTicks);
      site.levelingTicks = levelingTicks;
      site.buildingTicks = buildingTicks;
      if (site.ticksElapsed <= levelingTicks) {
        site.phase = 'leveling';
        site.phaseTicksElapsed = site.ticksElapsed;
      } else {
        site.phase = 'building';
        site.phaseTicksElapsed = site.ticksElapsed - levelingTicks;
        applyFootprintLeveling(grid, site, 1);
      }
      site.progress = constructionProgress(site);
      chunk.constructionSites.set(subKey(s.sx, s.sz), site);
      grid.chunks.bumpChunkContent(chunk);
    }
    for (const p of snapshot.placements ?? []) {
      grid.setBuilding(p.sx, p.sz, p.building);
    }
    for (const c of snapshot.cells ?? []) {
      grid.setBuilding(c.sx, c.sz, c.building);
    }

    for (const d of snapshot.deposits ?? []) {
      const chunk = grid.chunks.getChunkAtSub(d.sx, d.sz);
      chunk.deposits.set(subKey(d.sx, d.sz), { ...d.deposit });
    }

    for (const key of snapshot.exploredChunks ?? []) {
      grid.chunks.exploredChunks.add(key);
    }

    for (const t of snapshot.traffic ?? []) {
      const parsed = t.key.split(',');
      const sx = Number(parsed[0]);
      const sz = Number(parsed[1]);
      if (!Number.isNaN(sx) && !Number.isNaN(sz)) {
        grid.chunks.setTrafficAt(sx, sz, t.heat);
      }
    }

    for (const cell of snapshot.terrain ?? []) {
      grid.chunks.setTerrainAt(cell.sx, cell.sz, { dugDepth: cell.dugDepth });
    }

    if (snapshot.housing?.length) {
      grid.housing.loadSnapshots(snapshot.housing);
    }

    if (snapshot.upkeep?.length) {
      grid.upkeep.loadSnapshots(snapshot.upkeep);
    }

    grid.chunks.revision = snapshot.revision;
    return grid;
  }

  static migrateFromV3(snapshot: CitySnapshot): GameGrid {
    const w = snapshot.gridWidth ?? DEFAULT_MACRO_SIZE;
    const h = snapshot.gridHeight ?? DEFAULT_MACRO_SIZE;
    const grid = new GameGrid(w, h, snapshot.worldSeed ?? DEFAULT_WORLD_SEED);
    const scale = SUB_CELLS_PER_TILE;

    const depositMap =
      snapshot.deposits.length > 0
        ? new Map(
            snapshot.deposits.map((d) => {
              const mx = d.x ?? Math.floor(d.sx / scale);
              const mz = d.z ?? Math.floor(d.sz / scale);
              return [`${mx},${mz}`, d.deposit] as const;
            }),
          )
        : generateDeposits(w, h, grid.worldSeed);

    for (const [key, deposit] of depositMap) {
      const [mx, mz] = key.split(',');
      const sx = Number(mx) * scale;
      const sz = Number(mz) * scale;
      if (Number.isNaN(sx) || Number.isNaN(sz)) continue;
      const chunk = grid.chunks.getChunkAtSub(sx, sz);
      for (let dz = 0; dz < scale; dz++) {
        for (let dx = 0; dx < scale; dx++) {
          chunk.deposits.set(subKey(sx + dx, sz + dz), { ...deposit });
        }
      }
    }

    for (const cell of snapshot.cells ?? []) {
      const sx = cell.sx ?? (cell.x ?? 0) * scale;
      const sz = cell.sz ?? (cell.z ?? 0) * scale;
      grid.setBuilding(sx, sz, cell.building);
    }

    grid.chunks.revision = snapshot.revision;
    return grid;
  }
}
