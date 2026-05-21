import { ACTIVE_CHUNK_RADIUS, CHUNK_SIZE, DEFAULT_WORLD_SEED } from './constants';
import { chunkKey, chunkOrigin, subKey, subToChunk } from './chunkCoords';
import { getFootprint, isRoadType } from './footprints';
import { getCachedBakedSection } from './terrainBakedStore';
import {
  applyTerrainSectionToChunk,
  generateTerrainSection,
  terrainElevationAt,
} from './terrainSection';
import {
  defaultTerrainCell,
  normalizeTerrainCell,
  resolveTerrainStack,
  surfaceLayer,
  type TerrainCell,
  type TerrainLayer,
} from './terrain';
import type { FluidType } from './water';
import type { BuildingType, NaturalDeposit } from './types';
import type { ConstructionSite } from './construction';

export interface ChunkRecord {
  cx: number;
  cy: number;
  deposits: Map<string, NaturalDeposit>;
  /** Static water sub-cells (rivers, lakes, coast). */
  fluids: Map<string, FluidType>;
  /** Baked/procedural normalized elevation per sub-cell. */
  elevation: Map<string, number>;
  terrain: Map<string, TerrainCell>;
  /** Per-sub-cell building (roads) or anchor occupancy marker. */
  cells: Map<string, BuildingType>;
  /** Anchor placements for multi-cell footprints: anchorKey -> type */
  anchors: Map<string, BuildingType>;
  /** Anchor key -> site (footprint blocked until complete). */
  constructionSites: Map<string, ConstructionSite>;
  traffic: Map<string, number>;
  loaded: boolean;
  /** Bumped when buildings/deposits/terrain in this chunk change (render dirty). */
  contentRevision: number;
}

export interface SimSyncDelta {
  buildings: { key: string; building: BuildingType | null }[];
  deposits: { key: string; deposit: NaturalDeposit }[];
  traffic: { key: string; heat: number }[];
  occupancy: { key: string; building: BuildingType | null }[];
}

export class ChunkManager {
  readonly worldSeed: number;
  private readonly chunks = new Map<string, ChunkRecord>();
  readonly exploredChunks = new Set<string>();
  revision = 0;
  private readonly simDirtyBuildings = new Set<string>();
  private readonly simDirtyDeposits = new Set<string>();
  private readonly simDirtyTraffic = new Set<string>();
  private readonly simDirtyOccupancy = new Set<string>();

  constructor(worldSeed = DEFAULT_WORLD_SEED) {
    this.worldSeed = worldSeed;
    this.exploreChunk(0, 0);
    this.ensureChunk(0, 0);
  }

  exploreChunk(cx: number, cy: number): void {
    this.exploredChunks.add(chunkKey(cx, cy));
  }

  exploreAroundSub(sx: number, sz: number, radiusChunks = 1): void {
    const { cx, cy } = subToChunk(sx, sz);
    for (let dy = -radiusChunks; dy <= radiusChunks; dy++) {
      for (let dx = -radiusChunks; dx <= radiusChunks; dx++) {
        this.exploreChunk(cx + dx, cy + dy);
      }
    }
  }

  isExplored(cx: number, cy: number): boolean {
    return this.exploredChunks.has(chunkKey(cx, cy));
  }

  /** Apply baked section data to chunks created before prefetch finished. */
  refreshTerrainFromBake(cx: number, cy: number, radius: number): number {
    let applied = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const chunk = this.chunks.get(chunkKey(cx + dx, cy + dy));
        if (!chunk) continue;
        const baked = getCachedBakedSection(this.worldSeed, chunk.cx, chunk.cy);
        if (!baked) continue;
        applyTerrainSectionToChunk(chunk, baked);
        this.bumpChunkContent(chunk);
        applied++;
      }
    }
    return applied;
  }

  private populateChunkTerrain(chunk: ChunkRecord): void {
    const baked = getCachedBakedSection(this.worldSeed, chunk.cx, chunk.cy);
    const section = baked ?? generateTerrainSection(chunk.cx, chunk.cy, this.worldSeed);
    applyTerrainSectionToChunk(chunk, section);
  }

  ensureChunk(cx: number, cy: number): ChunkRecord {
    const key = chunkKey(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = {
        cx,
        cy,
        deposits: new Map(),
        fluids: new Map(),
        elevation: new Map(),
        terrain: new Map(),
        cells: new Map(),
        anchors: new Map(),
        constructionSites: new Map(),
        traffic: new Map(),
        loaded: true,
        contentRevision: 0,
      };
      this.populateChunkTerrain(chunk);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  getChunk(cx: number, cy: number): ChunkRecord | null {
    return this.chunks.get(chunkKey(cx, cy)) ?? null;
  }

  /** Chunks currently resident in memory around the camera. */
  loadedChunkCount(): number {
    return this.chunks.size;
  }

  getChunkAtSub(sx: number, sz: number): ChunkRecord {
    const { cx, cy } = subToChunk(sx, sz);
    return this.ensureChunk(cx, cy);
  }

  updateActiveChunks(centerSx: number, centerSz: number): void {
    const { cx, cy } = subToChunk(centerSx, centerSz);
    const keep = new Set<string>();

    for (let dy = -ACTIVE_CHUNK_RADIUS; dy <= ACTIVE_CHUNK_RADIUS; dy++) {
      for (let dx = -ACTIVE_CHUNK_RADIUS; dx <= ACTIVE_CHUNK_RADIUS; dx++) {
        const c = this.ensureChunk(cx + dx, cy + dy);
        keep.add(chunkKey(c.cx, c.cy));
        this.exploreChunk(c.cx, c.cy);
      }
    }

    for (const [key, chunk] of this.chunks) {
      if (!keep.has(key)) {
        chunk.loaded = false;
        this.chunks.delete(key);
      }
    }
  }

  getBuildingAt(sx: number, sz: number): BuildingType | null {
    const chunk = this.getChunkAtSub(sx, sz);
    return chunk.cells.get(subKey(sx, sz)) ?? null;
  }

  getConstructionSiteAt(sx: number, sz: number): ConstructionSite | null {
    const chunk = this.getChunkAtSub(sx, sz);
    const key = subKey(sx, sz);
    const direct = chunk.constructionSites.get(key);
    if (direct) return direct;
    for (const site of chunk.constructionSites.values()) {
      const fp = getFootprint(site.building);
      if (
        sx >= site.sx &&
        sx < site.sx + fp.w &&
        sz >= site.sz &&
        sz < site.sz + fp.h
      ) {
        return site;
      }
    }
    for (const chunk2 of this.chunks.values()) {
      if (chunk2 === chunk) continue;
      for (const site of chunk2.constructionSites.values()) {
        const fp = getFootprint(site.building);
        if (
          sx >= site.sx &&
          sx < site.sx + fp.w &&
          sz >= site.sz &&
          sz < site.sz + fp.h
        ) {
          return site;
        }
      }
    }
    return null;
  }

  footprintBlockedByConstruction(anchorSx: number, anchorSz: number, w: number, h: number): boolean {
    for (const chunk of this.chunks.values()) {
      for (const site of chunk.constructionSites.values()) {
        const fp = getFootprint(site.building);
        const ax2 = site.sx + fp.w;
        const az2 = site.sz + fp.h;
        const bx2 = anchorSx + w;
        const bz2 = anchorSz + h;
        if (anchorSx < ax2 && bx2 > site.sx && anchorSz < az2 && bz2 > site.sz) {
          return true;
        }
      }
    }
    return false;
  }

  getDepositAt(sx: number, sz: number): NaturalDeposit | null {
    const chunk = this.getChunkAtSub(sx, sz);
    return chunk.deposits.get(subKey(sx, sz)) ?? null;
  }

  getFluidAt(sx: number, sz: number): FluidType {
    const chunk = this.getChunkAtSub(sx, sz);
    return chunk.fluids.get(subKey(sx, sz)) ?? 'none';
  }

  hasWaterAt(sx: number, sz: number): boolean {
    return this.getFluidAt(sx, sz) === 'water';
  }

  getElevationAt(sx: number, sz: number): number {
    const chunk = this.getChunkAtSub(sx, sz);
    const key = subKey(sx, sz);
    return terrainElevationAt(sx, sz, this.worldSeed, chunk.elevation.get(key));
  }

  getTerrainAt(sx: number, sz: number): TerrainCell {
    const chunk = this.getChunkAtSub(sx, sz);
    const key = subKey(sx, sz);
    const stored = chunk.terrain.get(key);
    if (stored) return stored;
    return defaultTerrainCell();
  }

  getTerrainSurfaceLayer(sx: number, sz: number): TerrainLayer {
    const cell = this.getTerrainAt(sx, sz);
    const deposit = this.getDepositAt(sx, sz);
    const stack = resolveTerrainStack(deposit);
    return surfaceLayer(stack, cell.dugDepth);
  }

  writeTerrainAt(sx: number, sz: number, cell: TerrainCell): ChunkRecord {
    const chunk = this.getChunkAtSub(sx, sz);
    chunk.terrain.set(subKey(sx, sz), normalizeTerrainCell(cell));
    return chunk;
  }

  writeElevationAt(sx: number, sz: number, elev: number): ChunkRecord {
    const chunk = this.getChunkAtSub(sx, sz);
    chunk.elevation.set(subKey(sx, sz), elev);
    return chunk;
  }

  forEachTerrainOverride(fn: (sx: number, sz: number, cell: TerrainCell) => void): void {
    for (const chunk of this.chunks.values()) {
      for (const [key, cell] of chunk.terrain) {
        const parsed = key.split(',');
        const sx = Number(parsed[0]);
        const sz = Number(parsed[1]);
        if (!Number.isNaN(sx) && !Number.isNaN(sz)) fn(sx, sz, cell);
      }
    }
  }

  setTerrainAt(sx: number, sz: number, cell: TerrainCell): void {
    const chunk = this.writeTerrainAt(sx, sz, cell);
    this.bumpChunkContent(chunk);
  }

  bumpChunkContent(chunk: ChunkRecord): void {
    chunk.contentRevision += 1;
    this.revision += 1;
  }

  markSimDirtyBuilding(key: string): void {
    this.simDirtyBuildings.add(key);
  }

  markSimDirtyOccupancy(key: string): void {
    this.simDirtyOccupancy.add(key);
  }

  markSimDirtyDeposit(key: string): void {
    this.simDirtyDeposits.add(key);
  }

  markSimDirtyTraffic(key: string): void {
    this.simDirtyTraffic.add(key);
  }

  /** Keys changed on main thread since last worker sync; clears dirty sets. */
  collectSimSyncDelta(): SimSyncDelta | null {
    if (
      this.simDirtyBuildings.size === 0 &&
      this.simDirtyDeposits.size === 0 &&
      this.simDirtyTraffic.size === 0 &&
      this.simDirtyOccupancy.size === 0
    ) {
      return null;
    }

    const buildings: SimSyncDelta['buildings'] = [];
    const deposits: SimSyncDelta['deposits'] = [];
    const traffic: SimSyncDelta['traffic'] = [];
    const occupancy: SimSyncDelta['occupancy'] = [];

    for (const key of this.simDirtyBuildings) {
      const parsed = key.split(',');
      const sx = Number(parsed[0]);
      const sz = Number(parsed[1]);
      if (Number.isNaN(sx) || Number.isNaN(sz)) continue;
      const chunk = this.getChunkAtSub(sx, sz);
      const anchor = chunk.anchors.get(key);
      if (anchor) {
        buildings.push({ key, building: anchor });
        continue;
      }
      const road = chunk.cells.get(key);
      if (road === 'dirt_path' || road === 'road' || road === 'highway') {
        buildings.push({ key, building: road });
        continue;
      }
      buildings.push({ key, building: null });
    }

    for (const key of this.simDirtyDeposits) {
      const parsed = key.split(',');
      const sx = Number(parsed[0]);
      const sz = Number(parsed[1]);
      if (Number.isNaN(sx) || Number.isNaN(sz)) continue;
      const chunk = this.getChunkAtSub(sx, sz);
      const deposit = chunk.deposits.get(key);
      if (deposit) deposits.push({ key, deposit: { ...deposit } });
    }

    for (const key of this.simDirtyTraffic) {
      const parsed = key.split(',');
      const sx = Number(parsed[0]);
      const sz = Number(parsed[1]);
      if (Number.isNaN(sx) || Number.isNaN(sz)) continue;
      const heat = this.getTrafficAt(sx, sz);
      traffic.push({ key, heat });
    }

    for (const key of this.simDirtyOccupancy) {
      const parsed = key.split(',');
      const sx = Number(parsed[0]);
      const sz = Number(parsed[1]);
      if (Number.isNaN(sx) || Number.isNaN(sz)) continue;
      const chunk = this.getChunkAtSub(sx, sz);
      const building = chunk.cells.get(key);
      occupancy.push({ key, building: building ?? null });
    }

    this.simDirtyBuildings.clear();
    this.simDirtyDeposits.clear();
    this.simDirtyTraffic.clear();
    this.simDirtyOccupancy.clear();

    return { buildings, deposits, traffic, occupancy };
  }

  getTrafficAt(sx: number, sz: number): number {
    const chunk = this.getChunkAtSub(sx, sz);
    return chunk.traffic.get(subKey(sx, sz)) ?? 0;
  }

  setTrafficAt(sx: number, sz: number, heat: number): void {
    const chunk = this.getChunkAtSub(sx, sz);
    const key = subKey(sx, sz);
    if (heat <= 0.01) chunk.traffic.delete(key);
    else chunk.traffic.set(key, heat);
  }

  forEachLoadedChunk(fn: (chunk: ChunkRecord) => void): void {
    for (const chunk of this.chunks.values()) {
      if (chunk.loaded) fn(chunk);
    }
  }

  forEachConstructionSite(fn: (site: ConstructionSite) => void): void {
    for (const chunk of this.chunks.values()) {
      for (const site of chunk.constructionSites.values()) {
        fn(site);
      }
    }
  }

  forEachAnchor(fn: (sx: number, sz: number, type: BuildingType) => void): void {
    for (const chunk of this.chunks.values()) {
      for (const [key, type] of chunk.anchors) {
        const parsed = key.split(',');
        const sx = Number(parsed[0]);
        const sz = Number(parsed[1]);
        if (!Number.isNaN(sx) && !Number.isNaN(sz)) fn(sx, sz, type);
      }
    }
  }

  forEachRoadCell(fn: (sx: number, sz: number, type: BuildingType) => void): void {
    for (const chunk of this.chunks.values()) {
      for (const [key, type] of chunk.cells) {
        if (type === 'dirt_path' || type === 'road' || type === 'highway') {
          const parsed = key.split(',');
          const sx = Number(parsed[0]);
          const sz = Number(parsed[1]);
          if (!Number.isNaN(sx) && !Number.isNaN(sz)) fn(sx, sz, type);
        }
      }
    }
  }

  /** Iterate all occupied sub-cells (roads + footprint fills). */
  forEachCell(fn: (sx: number, sz: number, building: BuildingType) => void): void {
    for (const chunk of this.chunks.values()) {
      for (const [key, building] of chunk.cells) {
        const parsed = key.split(',');
        const sx = Number(parsed[0]);
        const sz = Number(parsed[1]);
        if (!Number.isNaN(sx) && !Number.isNaN(sz)) fn(sx, sz, building);
      }
    }
  }

  forEachDeposit(fn: (sx: number, sz: number, deposit: NaturalDeposit) => void): void {
    for (const chunk of this.chunks.values()) {
      for (const [key, deposit] of chunk.deposits) {
        const parsed = key.split(',');
        const sx = Number(parsed[0]);
        const sz = Number(parsed[1]);
        if (!Number.isNaN(sx) && !Number.isNaN(sz)) fn(sx, sz, deposit);
      }
    }
  }

  patchDeposits(updates: { key: string; deposit: NaturalDeposit }[]): void {
    for (const { key, deposit } of updates) {
      const parsed = key.split(',');
      const sx = Number(parsed[0]);
      const sz = Number(parsed[1]);
      if (Number.isNaN(sx) || Number.isNaN(sz)) continue;
      const chunk = this.getChunkAtSub(sx, sz);
      if (chunk.deposits.has(key)) {
        chunk.deposits.set(key, { ...deposit });
        this.bumpChunkContent(chunk);
      }
    }
  }

  /** Building count for sim Hz / perf without allocating full `toSimMaps()`. */
  simBuildingCount(): number {
    let count = 0;
    for (const chunk of this.chunks.values()) {
      count += chunk.anchors.size;
      for (const type of chunk.cells.values()) {
        if (isRoadType(type)) count += 1;
      }
    }
    return count;
  }

  /** Chunks visible for rendering around camera sub-cell. */
  visibleChunks(centerSx: number, centerSz: number, radius: number): ChunkRecord[] {
    const { cx, cy } = subToChunk(centerSx, centerSz);
    const out: ChunkRecord[] = [];
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const c = this.ensureChunk(cx + dx, cy + dy);
        out.push(c);
      }
    }
    return out;
  }

  chunkBounds(
    cx: number,
    cy: number,
  ): {
    minSx: number;
    minSz: number;
    maxSx: number;
    maxSz: number;
  } {
    const { minSx, minSz } = chunkOrigin(cx, cy);
    return { minSx, minSz, maxSx: minSx + CHUNK_SIZE - 1, maxSz: minSz + CHUNK_SIZE - 1 };
  }

  toSimMaps(): {
    buildings: Map<string, BuildingType>;
    deposits: Map<string, NaturalDeposit>;
    traffic: Map<string, number>;
    /** Full occupancy for pathfinding / rendering. */
    occupancy: Map<string, BuildingType>;
  } {
    const buildings = new Map<string, BuildingType>();
    const deposits = new Map<string, NaturalDeposit>();
    const traffic = new Map<string, number>();
    const occupancy = new Map<string, BuildingType>();
    for (const chunk of this.chunks.values()) {
      for (const [k, v] of chunk.cells) occupancy.set(k, v);
      for (const [k, v] of chunk.anchors) {
        buildings.set(k, v);
        occupancy.set(k, v);
      }
      for (const [k, v] of chunk.cells) {
        if (v === 'dirt_path' || v === 'road' || v === 'highway') {
          buildings.set(k, v);
        }
      }
      for (const [k, v] of chunk.deposits) deposits.set(k, v);
      for (const [k, v] of chunk.traffic) traffic.set(k, v);
    }
    return { buildings, deposits, traffic, occupancy };
  }

  bumpRevision(): void {
    this.revision += 1;
  }

  /** Legacy global bump when chunk is unknown; prefer bumpChunkContent. */
  bumpRevisionForSub(sx: number, sz: number): void {
    this.bumpChunkContent(this.getChunkAtSub(sx, sz));
  }
}
