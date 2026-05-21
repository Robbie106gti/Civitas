import type { LegitimacyState, SocietySnapshot } from '../../types';

export function runLegitimacyTick(legitimacy: LegitimacyState, society: SocietySnapshot): void {
  const politicsTarget = society.politics.favorRating;
  const happinessTarget = society.happiness;
  const unrestPenalty = society.social.unrest.level * 0.35;
  const crimePenalty = society.social.crime.rate * 0.15;

  const rulerTarget = Math.max(
    0,
    Math.min(100, politicsTarget * 0.45 + happinessTarget * 0.35 - unrestPenalty - crimePenalty + 10),
  );
  const institutionsTarget = Math.max(
    0,
    Math.min(100, society.religion.coveragePercent * 0.35 + politicsTarget * 0.35 + 20 - unrestPenalty * 0.5),
  );

  legitimacy.ruler += (rulerTarget - legitimacy.ruler) * 0.05;
  legitimacy.institutions += (institutionsTarget - legitimacy.institutions) * 0.04;
  legitimacy.ruler = Math.round(Math.max(0, Math.min(100, legitimacy.ruler)));
  legitimacy.institutions = Math.round(Math.max(0, Math.min(100, legitimacy.institutions)));
}

export function combinedLegitimacy(legitimacy: LegitimacyState): number {
  return Math.round((legitimacy.ruler + legitimacy.institutions) / 2);
}
