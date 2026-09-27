export type ScoringRule = 'bwf21' | 'classic15';

/**
 * Two supported rule sets:
 *
 * - `bwf21`: current official BWF rally-point scoring. First to 21, win by
 *   2 clear points, capped at 30 (30-29 wins outright).
 * - `classic15`: the pre-2006 "games to 15" system. First to 15 wins
 *   outright UNLESS the score reaches 14-14, at which point the side that
 *   reached 14 first (in practice: whoever is asked) chooses to either play
 *   straight to 15, or "set" the game so the target becomes 17 (first to
 *   17 wins, no further setting). This is a simplification of the historical
 *   BWF "setting" law kept intentionally simple for casual/club play — treat
 *   it as a house rule, not an official regulation.
 */

export const BWF21_BASE_TARGET = 21;
export const BWF21_CAP = 30;
export const CLASSIC15_BASE_TARGET = 15;
export const CLASSIC15_SET_TARGET = 17;
export const CLASSIC15_TIE_POINT = 14;

export interface ScoreState {
  scoringRule: ScoringRule;
  teamAScore: number;
  teamBScore: number;
  targetPoints: number;
  isSet: number;
}

export interface ScoreEvaluation {
  winner: 'a' | 'b' | null;
  needsSettingDecision: boolean;
}

export function defaultTargetPoints(rule: ScoringRule): number {
  return rule === 'bwf21' ? BWF21_BASE_TARGET : CLASSIC15_BASE_TARGET;
}

export function evaluateScore(state: ScoreState): ScoreEvaluation {
  const { scoringRule, teamAScore, teamBScore, targetPoints, isSet } = state;

  if (scoringRule === 'bwf21') {
    if (teamAScore >= BWF21_CAP) return { winner: 'a', needsSettingDecision: false };
    if (teamBScore >= BWF21_CAP) return { winner: 'b', needsSettingDecision: false };
    const leader = Math.max(teamAScore, teamBScore);
    const diff = Math.abs(teamAScore - teamBScore);
    if (leader >= BWF21_BASE_TARGET && diff >= 2) {
      return { winner: teamAScore > teamBScore ? 'a' : 'b', needsSettingDecision: false };
    }
    return { winner: null, needsSettingDecision: false };
  }

  // classic15
  if (!isSet && teamAScore === CLASSIC15_TIE_POINT && teamBScore === CLASSIC15_TIE_POINT) {
    return { winner: null, needsSettingDecision: true };
  }
  if (teamAScore >= targetPoints) return { winner: 'a', needsSettingDecision: false };
  if (teamBScore >= targetPoints) return { winner: 'b', needsSettingDecision: false };
  return { winner: null, needsSettingDecision: false };
}

export function scoringRuleLabel(rule: ScoringRule): string {
  return rule === 'bwf21' ? 'BWF rally point (21, win by 2, cap 30)' : 'Classic 15 (with setting at 14-all)';
}
