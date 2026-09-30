import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import {
  adjustScore,
  getMatch,
  getOrStartMatchForSlot,
  reopenMatch,
  resolveSetting,
  setMatchScoringRule,
} from '@/lib/repositories/matches';
import { getScheduleSlotById, getSessionById } from '@/lib/repositories/sessions';
import { evaluateScore, scoringRuleLabel } from '@/lib/scoring';
import { useTheme } from '@/lib/theme';
import type { MatchWithTeams, ScoringRule } from '@/lib/types';

export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const slotId = Number(id);
  const db = useSQLiteContext();
  const { colors } = useTheme();

  const [matchId, setMatchId] = useState<number | null>(null);
  const [match, setMatch] = useState<MatchWithTeams | null>(null);
  const [loading, setLoading] = useState(true);

  const reloadMatch = useCallback(
    async (id: number) => {
      const row = await getMatch(db, id);
      setMatch(row);
    },
    [db],
  );

  useEffect(() => {
    let cancelled = false;
    async function init() {
      const slot = await getScheduleSlotById(db, slotId);
      if (!slot) {
        setLoading(false);
        return;
      }
      const session = await getSessionById(db, slot.session_id);
      if (!session) {
        setLoading(false);
        return;
      }
      const id = await getOrStartMatchForSlot(db, slot, session);
      if (cancelled) return;
      setMatchId(id);
      await reloadMatch(id);
      setLoading(false);
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [db, slotId, reloadMatch]);

  const evaluation = useMemo(() => {
    if (!match) return null;
    return evaluateScore({
      scoringRule: match.scoring_rule,
      teamAScore: match.team_a_score,
      teamBScore: match.team_b_score,
      targetPoints: match.target_points,
      isSet: match.is_set,
    });
  }, [match]);

  async function handleAdjust(side: 'a' | 'b', delta: 1 | -1) {
    if (!matchId) return;
    await adjustScore(db, matchId, side, delta);
    await reloadMatch(matchId);
  }

  async function handleSetting(choice: 'set' | 'straight') {
    if (!matchId) return;
    await resolveSetting(db, matchId, choice);
    await reloadMatch(matchId);
  }

  async function handleRuleChange(rule: ScoringRule) {
    if (!matchId) return;
    await setMatchScoringRule(db, matchId, rule);
    await reloadMatch(matchId);
  }

  async function handleReopen() {
    if (!matchId) return;
    await reopenMatch(db, matchId);
    await reloadMatch(matchId);
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!match) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Match not found.</Text>
      </View>
    );
  }

  const isComplete = match.status === 'completed';
  const canChangeRule = match.team_a_score === 0 && match.team_b_score === 0 && !isComplete;
  const showSettingPrompt = !isComplete && evaluation?.needsSettingDecision;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {canChangeRule && (
        <View style={styles.ruleRow}>
          {(['bwf21', 'classic15'] as ScoringRule[]).map((rule) => (
            <Pressable
              key={rule}
              onPress={() => handleRuleChange(rule)}
              style={[
                styles.ruleChip,
                {
                  backgroundColor: match.scoring_rule === rule ? colors.primary : colors.chip,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={{ color: match.scoring_rule === rule ? colors.primaryText : colors.text, fontWeight: '600' }}>
                {rule === 'bwf21' ? 'BWF 21' : 'Classic 15'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      {!canChangeRule && (
        <Text style={[styles.ruleLabel, { color: colors.subtext }]}>{scoringRuleLabel(match.scoring_rule)}</Text>
      )}

      <View style={styles.scoreBoard}>
        <ScoreColumn
          name={match.team_a_name}
          score={match.team_a_score}
          isWinner={match.winner_team_id === match.team_a_id}
          disabled={isComplete || Boolean(showSettingPrompt)}
          onIncrement={() => handleAdjust('a', 1)}
          onDecrement={() => handleAdjust('a', -1)}
        />
        <View style={styles.vsColumn}>
          <Text style={{ color: colors.subtext, fontWeight: '700' }}>VS</Text>
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>Target {match.target_points}</Text>
        </View>
        <ScoreColumn
          name={match.team_b_name}
          score={match.team_b_score}
          isWinner={match.winner_team_id === match.team_b_id}
          disabled={isComplete || Boolean(showSettingPrompt)}
          onIncrement={() => handleAdjust('b', 1)}
          onDecrement={() => handleAdjust('b', -1)}
        />
      </View>

      {showSettingPrompt && (
        <View style={[styles.settingBanner, { backgroundColor: colors.chip, borderColor: colors.warning }]}>
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 10, textAlign: 'center' }}>
            Score is tied 14-14. Set the game?
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Button label="Play to 15" variant="secondary" onPress={() => handleSetting('straight')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Set to 17" onPress={() => handleSetting('set')} />
            </View>
          </View>
        </View>
      )}

      {isComplete && (
        <View style={[styles.completeBanner, { backgroundColor: colors.chip }]}>
          <Ionicons name="trophy" size={22} color={colors.success} />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>
            {match.winner_team_id === match.team_a_id ? match.team_a_name : match.team_b_name} wins!
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Button label="Reopen" variant="secondary" onPress={handleReopen} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Back to schedule" onPress={() => router.back()} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

function ScoreColumn({
  name,
  score,
  isWinner,
  disabled,
  onIncrement,
  onDecrement,
}: {
  name: string;
  score: number;
  isWinner: boolean;
  disabled: boolean;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.scoreColumn}>
      <Text numberOfLines={1} style={[styles.teamName, { color: colors.text }]}>
        {name}
        {isWinner ? ' 🏆' : ''}
      </Text>
      <Text style={[styles.scoreText, { color: colors.primary }]}>{score}</Text>
      <View style={styles.scoreButtons}>
        <Pressable
          disabled={disabled || score === 0}
          onPress={onDecrement}
          style={[styles.roundButton, { borderColor: colors.border, opacity: disabled || score === 0 ? 0.4 : 1 }]}
        >
          <Ionicons name="remove" size={22} color={colors.text} />
        </Pressable>
        <Pressable
          disabled={disabled}
          onPress={onIncrement}
          style={[styles.roundButton, { backgroundColor: colors.primary, opacity: disabled ? 0.4 : 1 }]}
        >
          <Ionicons name="add" size={22} color={colors.primaryText} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ruleRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  ruleChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth },
  ruleLabel: { textAlign: 'center', fontSize: 13 },
  scoreBoard: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  scoreColumn: { flex: 1, alignItems: 'center', gap: 10 },
  vsColumn: { width: 70, alignItems: 'center' },
  teamName: { fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 4 },
  scoreText: { fontSize: 64, fontWeight: '800' },
  scoreButtons: { flexDirection: 'row', gap: 12 },
  roundButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  settingBanner: { borderWidth: 1.5, borderRadius: 14, padding: 16 },
  completeBanner: { borderRadius: 14, padding: 16, alignItems: 'center', gap: 6 },
});
