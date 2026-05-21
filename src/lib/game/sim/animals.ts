import { createSeededRng } from '../resources';
import { subKey } from '../chunkCoords';
import type { BuildingType } from '../types';

export interface AnimalState {
  id: number;
  sx: number;
  sz: number;
  species: 'deer' | 'boar';
}

export interface AnimalSimState {
  animals: AnimalState[];
  nextId: number;
}

export function createAnimalState(): AnimalSimState {
  return { animals: [], nextId: 1 };
}

/** Stub: spawn animals near tree deposits at chunk edges. */
export function tickAnimals(
  state: AnimalSimState,
  deposits: Map<string, import('../types').NaturalDeposit>,
  buildings: Map<string, BuildingType>,
  worldSeed: number,
  simTime: number,
): AnimalState[] {
  if (state.animals.length >= 12) return state.animals;

  const rng = createSeededRng(worldSeed ^ Math.floor(simTime / 5000));
  if (rng() > 0.02) return state.animals;

  for (const [key, deposit] of deposits) {
    if (deposit.type !== 'trees' || deposit.richness <= 0) continue;
    const [xs, zs] = key.split(',');
    const sx = Number(xs);
    const sz = Number(zs);
    if (Number.isNaN(sx) || Number.isNaN(sz)) continue;
    if (buildings.has(key)) continue;
    state.animals.push({
      id: state.nextId++,
      sx: sx + (rng() > 0.5 ? 1 : -1),
      sz: sz + (rng() > 0.5 ? 1 : -1),
      species: rng() > 0.5 ? 'deer' : 'boar',
    });
    break;
  }

  for (const a of state.animals) {
    if (rng() > 0.7) {
      a.sx += rng() > 0.5 ? 1 : -1;
      a.sz += rng() > 0.5 ? 1 : -1;
    }
  }

  return state.animals;
}

export function animalSubKeys(animals: AnimalState[]): string[] {
  return animals.map((a) => subKey(Math.round(a.sx), Math.round(a.sz)));
}
