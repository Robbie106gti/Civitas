import type { ConflictState, SocialCrisisKind, SocialEvent, SocietySnapshot } from '../../types';
import { combinedLegitimacy } from './legitimacy';
import { dominantFaction } from './factions';

const REVOLUTION_RISK_THRESHOLD = 72;
const WAR_READINESS_THRESHOLD = 65;
const CRISIS_DURATION_TICKS = 120;

export function runConflictTick(conflict: ConflictState, society: SocietySnapshot, tick: number): SocialEvent[] {
  const events: SocialEvent[] = [];
  const legitimacy = combinedLegitimacy(society.social.legitimacy);
  const unrest = society.social.unrest;
  const top = dominantFaction(society.social.factions);

  conflict.revolutionRisk = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        unrest.level * 0.55 +
          unrest.pressure * 0.25 +
          (100 - legitimacy) * 0.35 +
          (top.agenda === 'reform' ? top.support * 0.15 : 0),
      ),
    ),
  );

  conflict.warReadiness = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        society.social.market.demandIndex * 0.3 +
          society.social.crime.rate * 0.2 +
          (top.agenda === 'order' ? top.support * 0.25 : 0) +
          Math.max(0, 50 - society.happiness) * 0.4,
      ),
    ),
  );

  if (conflict.crisis.ticksRemaining > 0) {
    conflict.crisis.ticksRemaining -= 1;
    if (conflict.crisis.ticksRemaining <= 0) {
      conflict.crisis.kind = null;
      conflict.crisis.severity = 0;
    }
    return events;
  }

  if (conflict.revolutionRisk >= REVOLUTION_RISK_THRESHOLD) {
    const kind: SocialCrisisKind = 'revolution_warning';
    conflict.crisis = { kind, severity: conflict.revolutionRisk, ticksRemaining: CRISIS_DURATION_TICKS };
    events.push({
      kind,
      message: '⚔️ Revolutionary sentiment spreads — legitimacy is collapsing.',
      tick,
    });
  } else if (unrest.level >= 80) {
    const kind: SocialCrisisKind = 'riot';
    conflict.crisis = { kind, severity: unrest.level, ticksRemaining: CRISIS_DURATION_TICKS };
    events.push({ kind, message: '🔥 Riot in the streets — unrest has boiled over.', tick });
  } else if (unrest.pressure >= 70 && unrest.level >= 55) {
    const kind: SocialCrisisKind = 'unrest_wave';
    conflict.crisis = { kind, severity: unrest.pressure, ticksRemaining: CRISIS_DURATION_TICKS };
    events.push({ kind, message: '📢 Mass protests demand relief from hunger and taxes.', tick });
  } else if (conflict.warReadiness >= WAR_READINESS_THRESHOLD) {
    const kind: SocialCrisisKind = 'war_threat';
    conflict.crisis = { kind, severity: conflict.warReadiness, ticksRemaining: CRISIS_DURATION_TICKS };
    events.push({
      kind,
      message: '🛡️ Neighboring powers sense weakness — war drums echo (stub).',
      tick,
    });
  }

  return events;
}
