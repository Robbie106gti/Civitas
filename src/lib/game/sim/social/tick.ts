import type { BuildingType, CityInventory, SocialEvent, SocietySnapshot } from '../../types';
import { computeNeedFulfillment } from './needs';
import { runUnrestTick } from './unrest';
import { runCrimeTick } from './crime';
import { runFactionsTick } from './factions';
import { runLegitimacyTick } from './legitimacy';
import { runMarketTick } from './market';
import { runConflictTick } from './conflict';

export interface SocialTickResult {
  events: SocialEvent[];
}

export function runSocialTick(
  society: SocietySnapshot,
  buildings: Iterable<BuildingType>,
  inventory: CityInventory,
  simTick: number,
): SocialTickResult {
  const needs = computeNeedFulfillment(society, buildings, inventory);
  society.social.needs = needs;

  runMarketTick(society.social.market, inventory, society.population);
  runCrimeTick(society.social.crime, needs, society.tax.rateLevel, buildings);
  runUnrestTick(society.social.unrest, society, needs);
  runFactionsTick(society.social.factions, society, needs);
  runLegitimacyTick(society.social.legitimacy, society);

  const events = runConflictTick(society.social.conflict, society, simTick);
  return { events };
}

export { unrestHappinessPenalty } from './unrest';
export { crimeHappinessPenalty } from './crime';
