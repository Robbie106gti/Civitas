/** Sub-cells per legacy macro tile (Minecraft-style micro grid). */
export const SUB_CELLS_PER_TILE = 10;

/** World units per sub-cell (1 macro tile = 1 world unit). */
export const SUB_CELL_WORLD_SIZE = 1 / SUB_CELLS_PER_TILE;

/**
 * Terrain surface micro-voxels per sub-cell edge (render only; sim/dig/bake stay 1 sub-cell).
 * Matches building voxel stride (SUB_CELL_WORLD_SIZE × 0.22 ≈ 1/5 sub-cell).
 */
export const TERRAIN_SURFACE_SUBDIV = 5;

/** Sub-cells along one edge of a chunk. */
export const CHUNK_SIZE = 32;

/** Keep (2×radius+1)² chunks loaded around camera — default 5×5. */
export const ACTIVE_CHUNK_RADIUS = 2;

/** Add chunk meshes within this Manhattan/chebyshev radius (5×5 at 2). */
export const RENDER_CHUNK_RADIUS = 2;

/** Fog-of-war: chunks beyond explored set use mist overlay. */
export const EXPLORE_CHUNK_RADIUS = 1;

export const MAX_WALKERS = 50;

/** Walker movement speed in sub-cells per second. */
export const WALKER_SPEED = 4;

/** Traffic heat added per walker step on a road sub-cell. */
export const TRAFFIC_STEP_HEAT = 2;

/** Heat thresholds for auto road upgrades (worker). */
export const TRAFFIC_DIRT_THRESHOLD = 8;
export const TRAFFIC_ROAD_THRESHOLD = 24;
export const TRAFFIC_HIGHWAY_THRESHOLD = 60;

/** Per-tick decay on traffic heat map. */
export const TRAFFIC_DECAY = 0.92;

/** Random disaster roll per sim second (worker). */
export const DISASTER_CHANCE_PER_SEC = 0.002;

export const DEFAULT_MACRO_SIZE = 16;
export const DEFAULT_WORLD_SEED = 42_069;

export const SAVE_FORMAT_VERSION = 5;

/** Full voxel buildings within this sub-cell distance of camera center. */
export const BUILDING_LOD_NEAR_SUB = 55;

/** Camera LOD bucket size in sub-cells (larger = fewer building mesh rebuilds while panning). */
export const BUILDING_LOD_BUCKET_SUB = 32;

/** Max box primitives merged into one mesh (split if exceeded). */
export const MAX_MERGE_PRIMITIVES = 2048;

/**
 * Terrain column detail within this Chebyshev chunk distance of the camera chunk (3×3 at 1).
 * Farther visible chunks render only the surface stratum to cut triangle count while panning.
 * Full detail: ~18 tris/sub-cell (1 fill box + 2 tris × stratum); ~1–2M tris at 49×32² chunks.
 */
export const TERRAIN_LOD_FULL_CHUNK_RADIUS = 1;
