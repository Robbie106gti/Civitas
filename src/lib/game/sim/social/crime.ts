import type { BuildingType, CrimeState, NeedFulfillment, TaxRateLevel } from '../../types';
import { averageNeedFulfillment } from './needs';

const CRIME_RISE = 0.18;
const CRIME_FALL = 0.22;

function countForums(buildings: Iterable<BuildingType>): number {
  let n = 0;
  for (const t of buildings) {
    if (t === 'forum') n += 1;
  }
  return n;
}

export function runCrimeTick(
  crime: CrimeState,
  needs: NeedFulfillment,
  taxRate: TaxRateLevel,
  buildings: Iterable<BuildingType>,
): void {
  const avgNeeds = averageNeedFulfillment(needs);
  const forums = countForums(buildings);
  const taxPush = taxRate === 'high' ? 6 : taxRate === 'medium' ? 2 : 0;
  const safetyGap = Math.max(0, 50 - needs.safety);

  const rise = (100 - avgNeeds) * 0.02 + taxPush + safetyGap * 0.05;
  const fall = forums * 3 + Math.max(0, needs.safety - 40) * 0.04;

  if (rise > fall) {
    crime.rate = Math.min(100, crime.rate + (rise - fall) * CRIME_RISE * 0.1);
  } else {
    crime.rate = Math.max(0, crime.rate - (fall - rise) * CRIME_FALL * 0.1);
  }
}

export function crimeHappinessPenalty(crime: CrimeState): number {
  return Math.round(crime.rate * 0.12);
}
