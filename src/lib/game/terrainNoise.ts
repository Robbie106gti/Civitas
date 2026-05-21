/** Deterministic hash → [0, 1). */
export function hash01(x: number, z: number, seed: number): number {
  let h = (seed ^ (x * 374761393) ^ (z * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Single-octave value noise in [0, 1] with continuous interpolation. */
export function valueNoise2D(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const v00 = hash01(x0, z0, seed);
  const v10 = hash01(x0 + 1, z0, seed);
  const v01 = hash01(x0, z0 + 1, seed);
  const v11 = hash01(x0 + 1, z0 + 1, seed);
  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), tz);
}

/** Fractal Brownian motion in [0, 1]. */
export function fbm2D(
  x: number,
  z: number,
  seed: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise2D(x * freq, z * freq, seed + i * 1013) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged multifractal in [0, 1] — thin natural veins, not sine bands. */
export function ridged2D(x: number, z: number, seed: number, octaves = 3): number {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = valueNoise2D(x * freq, z * freq, seed + i * 7919);
    const ridge = 1 - Math.abs(n * 2 - 1);
    sum += ridge * ridge * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}

/** Subtle per-cell jitter in [-range, range]. */
export function cellJitter(sx: number, sz: number, seed: number, range = 0.08): number {
  return (hash01(sx, sz, seed ^ 0x85ebca6b) - 0.5) * 2 * range;
}

/**
 * Normalized terrain elevation in [0, 1].
 * Low values: valleys, canyons, lakes; high values: rolling hills.
 */
export function sampleTerrainElevation(sx: number, sz: number, seed: number): number {
  const warpX = fbm2D(sx * 0.004, sz * 0.004, seed + 200, 3) * 18;
  const warpZ = fbm2D(sx * 0.004 + 77, sz * 0.004 + 33, seed + 201, 3) * 18;
  const wx = sx + warpX;
  const wz = sz + warpZ;

  const base = fbm2D(wx * 0.0065, wz * 0.0065, seed, 5) * 0.36 + 0.27;
  const hills = fbm2D(wx * 0.016, wz * 0.016, seed + 11, 5) * 0.48;
  const micro = fbm2D(wx * 0.048, wz * 0.048, seed + 22, 3) * 0.11;
  const roll = fbm2D(wx * 0.032, wz * 0.032, seed + 33, 2) * 0.07;

  const canyonVein = ridged2D(wx * 0.02, wz * 0.02, seed ^ 0x51ed270b, 4);
  const canyonMask = fbm2D(wx * 0.01, wz * 0.01, seed + 77, 3);
  const gorge = Math.pow(canyonVein, 1.85) * (0.44 + canyonMask * 0.36);

  let elev = base + hills + micro + roll - gorge;

  return Math.max(0, Math.min(1, elev));
}
