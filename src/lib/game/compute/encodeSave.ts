import type { CitySnapshot } from '../types';

export function encodeSave(snapshot: CitySnapshot): string {
  return JSON.stringify(snapshot);
}
