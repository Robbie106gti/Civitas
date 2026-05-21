import type {
  FactionAgenda,
  FactionState,
  NeedFulfillment,
  SocietySnapshot,
} from '../../types';
import { averageNeedFulfillment } from './needs';

export const DEFAULT_FACTIONS: Pick<FactionState, 'id' | 'name' | 'agenda'>[] = [
  { id: 'senate', name: 'Senatorial order', agenda: 'order' },
  { id: 'merchants', name: 'Merchant guild', agenda: 'prosperity' },
  { id: 'plebs', name: 'Plebeian council', agenda: 'reform' },
  { id: 'priests', name: 'Collegium pontificum', agenda: 'tradition' },
];

export function createDefaultFactions(): FactionState[] {
  return DEFAULT_FACTIONS.map((f) => ({
    ...f,
    support: 25,
    loyalty: 50,
  }));
}

function agendaSatisfaction(agenda: FactionAgenda, needs: NeedFulfillment, society: SocietySnapshot): number {
  switch (agenda) {
    case 'order':
      return needs.safety * 0.6 + (100 - society.social.crime.rate) * 0.4;
    case 'prosperity':
      return needs.goods * 0.5 + needs.food * 0.3 + society.social.market.demandIndex * 0.2;
    case 'tradition':
      return needs.culture * 0.7 + society.religion.coveragePercent * 0.3;
    case 'reform':
      return averageNeedFulfillment(needs) * 0.5 + (100 - society.social.unrest.level) * 0.5;
  }
}

export function runFactionsTick(factions: FactionState[], society: SocietySnapshot, needs: NeedFulfillment): void {
  const totalSupport = factions.reduce((s, f) => s + f.support, 0) || 1;

  for (const faction of factions) {
    const target = agendaSatisfaction(faction.agenda, needs, society);
    const drift = (target - faction.support) * 0.04;
    faction.support = Math.max(5, Math.min(60, faction.support + drift));

    const share = faction.support / totalSupport;
    faction.loyalty = Math.max(
      0,
      Math.min(100, faction.loyalty + (share > 0.35 ? 0.15 : share < 0.15 ? -0.2 : 0)),
    );
  }

  normalizeFactionSupport(factions);
}

function normalizeFactionSupport(factions: FactionState[]): void {
  const sum = factions.reduce((s, f) => s + f.support, 0) || 1;
  for (const f of factions) {
    f.support = Math.round((f.support / sum) * 100);
  }
}

export function dominantFaction(factions: FactionState[]): FactionState {
  return factions.reduce((a, b) => (b.support > a.support ? b : a));
}
