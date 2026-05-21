import { taxUnrestRisk } from '../taxes';
import type { NeedFulfillment, SocietySnapshot, UnrestState } from '../../types';
import { averageNeedFulfillment } from './needs';

const UNREST_GAIN_PER_TICK = 0.12;
const UNREST_DECAY_PER_TICK = 0.08;
const PRESSURE_GAIN = 0.15;
const PRESSURE_DECAY = 0.05;

export function runUnrestTick(
  unrest: UnrestState,
  society: SocietySnapshot,
  needs: NeedFulfillment,
): void {
  const avgNeeds = averageNeedFulfillment(needs);
  const needDeficit = Math.max(0, 55 - avgNeeds);
  const taxRisk = taxUnrestRisk(society.tax.rateLevel);
  const religionUnrest = Math.max(0, society.religion.unrestModifier);
  const crimePush = society.social.crime.rate * 0.04;
  const legitimacyRelief = (society.social.legitimacy.ruler - 50) * 0.02;

  const pressureDelta =
    needDeficit * 0.04 + taxRisk * 0.5 + religionUnrest * 0.3 + crimePush - legitimacyRelief;

  if (pressureDelta > 0) {
    unrest.pressure = Math.min(100, unrest.pressure + pressureDelta * PRESSURE_GAIN);
    unrest.level = Math.min(100, unrest.level + pressureDelta * UNREST_GAIN_PER_TICK);
  } else {
    unrest.pressure = Math.max(0, unrest.pressure - PRESSURE_DECAY);
    unrest.level = Math.max(0, unrest.level - UNREST_DECAY_PER_TICK);
  }
}

export function unrestHappinessPenalty(unrest: UnrestState): number {
  return Math.round(unrest.level * 0.22 + unrest.pressure * 0.08);
}
