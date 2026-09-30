import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/TextField';
import { FALLBACK_DEFAULTS, loadSessionDefaults, saveSessionDefaults } from '@/lib/settings';
import { deleteSession, extendSessionSchedule, getLatestSession, createSessionWithSchedule, listScheduleSlots } from '@/lib/repositories/sessions';
import { listTeamsWithPlayers } from '@/lib/repositories/teams';
import { scoringRuleLabel } from '@/lib/scoring';
import { useTheme } from '@/lib/theme';
import type { ScheduleSlotWithTeams, ScoringRule, Session, TeamWithPlayers } from '@/lib/types';

const RULE_OPTIONS: { value: ScoringRule; label: string }[] = [
  { value: 'bwf21', label: 'BWF 21' },
  { value: 'classic15', label: 'Classic 15' },
];

export default function ScheduleScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();

  const [teams, setTeams] = useState<TeamWithPlayers[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [slots, setSlots] = useState<ScheduleSlotWithTeams[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [extending, setExtending] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sessionName, setSessionName] = useState('');
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<number>>(new Set());
  const [courtCount, setCourtCount] = useState(FALLBACK_DEFAULTS.courtCount);
  const [slotMinutes, setSlotMinutes] = useState(FALLBACK_DEFAULTS.slotMinutes);
  const [scoringRule, setScoringRule] = useState<ScoringRule>(FALLBACK_DEFAULTS.scoringRule);

  const reload = useCallback(async () => {
    const [teamRows, latestSession] = await Promise.all([listTeamsWithPlayers(db), getLatestSession(db)]);
    setTeams(teamRows);
    setSession(latestSession);
    if (latestSession) {
      setSlots(await listScheduleSlots(db, latestSession.id));
    } else {
      setSlots([]);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  async function openCreateForm() {
    const defaults = await loadSessionDefaults();
    setCourtCount(defaults.courtCount);
    setSlotMinutes(defaults.slotMinutes);
    setScoringRule(defaults.scoringRule);
    setSessionName(`Session – ${new Date().toLocaleDateString()}`);
    setSelectedTeamIds(new Set());
    setShowForm(true);
  }

  function toggleTeam(teamId: number) {
    setSelectedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  async function handleCreateSession() {
    if (selectedTeamIds.size < 2) {
      Alert.alert('Pick at least 2 teams', 'Select the teams playing in this session to build a schedule.');
      return;
    }
    setSaving(true);
    try {
      const teamIds = Array.from(selectedTeamIds);
      const sessionId = await createSessionWithSchedule(db, {
        name: sessionName.trim() || 'Session',
        sessionDate: new Date().toISOString().slice(0, 10),
        courtCount,
        slotMinutes,
        scoringRule,
        teamIds,
      });
      await saveSessionDefaults({ courtCount, slotMinutes, scoringRule });
      setShowForm(false);
      await reload();
      void sessionId;
    } finally {
      setSaving(false);
    }
  }

  async function handleExtend() {
    if (!session) return;
    setExtending(true);
    try {
      await extendSessionSchedule(db, session.id);
      await reload();
    } finally {
      setExtending(false);
    }
  }

  function handleDelete() {
    if (!session) return;
    Alert.alert(
      'Delete session?',
      `"${session.name}", its schedule and all its match results (including history and standings) will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSession(db, session.id);
              await reload();
            } catch {
              Alert.alert('Could not delete session', 'Please try again.');
            }
          },
        },
      ],
    );
  }

  const grouped = useMemo(() => {
    const byRound = new Map<number, ScheduleSlotWithTeams[]>();
    for (const slot of slots) {
      if (!byRound.has(slot.round_number)) byRound.set(slot.round_number, []);
      byRound.get(slot.round_number)!.push(slot);
    }
    return Array.from(byRound.entries()).sort(([a], [b]) => a - b);
  }, [slots]);

  if (showForm) {
    return (
      <FlatList
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={styles.formList}
        data={teams}
        keyExtractor={(t) => String(t.id)}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Text style={[styles.title, { color: colors.text }]}>New session</Text>
            <TextField label="Session name" value={sessionName} onChangeText={setSessionName} />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Courts"
                  keyboardType="number-pad"
                  value={String(courtCount)}
                  onChangeText={(v) => setCourtCount(Math.max(1, Number(v.replace(/[^0-9]/g, '')) || 1))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Minutes per match"
                  keyboardType="number-pad"
                  value={String(slotMinutes)}
                  onChangeText={(v) => setSlotMinutes(Math.max(5, Number(v.replace(/[^0-9]/g, '')) || 5))}
                />
              </View>
            </View>
            <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Default scoring rule</Text>
            <View style={styles.segmented}>
              {RULE_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setScoringRule(opt.value)}
                  style={[
                    styles.segment,
                    {
                      backgroundColor: scoringRule === opt.value ? colors.primary : colors.chip,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <Text style={{ color: scoringRule === opt.value ? colors.primaryText : colors.text, fontWeight: '600' }}>
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={{ color: colors.subtext, fontSize: 12 }}>{scoringRuleLabel(scoringRule)}</Text>
            <Text style={[styles.sectionLabel, { color: colors.subtext, marginTop: 8 }]}>
              Teams playing ({selectedTeamIds.size} selected)
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const selected = selectedTeamIds.has(item.id);
          return (
            <Pressable onPress={() => toggleTeam(item.id)}>
              <Card
                style={[
                  styles.teamPickCard,
                  { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.chip : colors.card },
                ]}
              >
                <Ionicons
                  name={selected ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={selected ? colors.primary : colors.subtext}
                />
                <Text style={{ color: colors.text, fontWeight: '600' }}>{item.name}</Text>
              </Card>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <Text style={{ color: colors.subtext, paddingVertical: 16 }}>
            No teams yet — add teams first from the Teams tab.
          </Text>
        }
        ListFooterComponent={
          <View style={styles.formActions}>
            <View style={{ flex: 1 }}>
              <Button label="Cancel" variant="secondary" onPress={() => setShowForm(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Generate schedule" onPress={handleCreateSession} loading={saving} />
            </View>
          </View>
        }
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {!session ? (
        <View style={styles.emptyState}>
          <Text style={{ color: colors.subtext, textAlign: 'center', marginBottom: 16 }}>
            No session yet. Create one to generate today&apos;s match schedule.
          </Text>
          <Button label="+ New session" onPress={openCreateForm} />
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={([round]) => String(round)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={{ gap: 4, marginBottom: 8 }}>
              <Text style={[styles.title, { color: colors.text }]}>{session.name}</Text>
              <Text style={{ color: colors.subtext }}>
                {session.court_count} court{session.court_count > 1 ? 's' : ''} · {session.slot_minutes} min/match ·{' '}
                {scoringRuleLabel(session.scoring_rule)}
              </Text>
            </View>
          }
          renderItem={({ item: [round, roundSlots] }) => (
            <View style={{ gap: 8, marginBottom: 4 }}>
              <Text style={[styles.roundLabel, { color: colors.subtext }]}>
                Round {round}
                {roundSlots[0]?.is_extension ? ` · Extension ${roundSlots[0].extension_number}` : ''}
              </Text>
              {roundSlots.map((slot) => (
                <Pressable
                  key={slot.id}
                  onPress={() => router.push({ pathname: '/match/[id]', params: { id: String(slot.id) } })}
                >
                  <Card style={styles.slotCard}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: colors.text, fontWeight: '600' }}>
                        {slot.team_a_name} vs {slot.team_b_name}
                      </Text>
                      <Text style={{ color: colors.subtext, fontSize: 12 }}>
                        Court {slot.court_number} · {formatOffset(slot.start_offset_minutes, session.created_at)}
                      </Text>
                    </View>
                    <StatusBadge status={slot.status} />
                  </Card>
                </Pressable>
              ))}
            </View>
          )}
          ListFooterComponent={
            <View style={{ gap: 10, marginTop: 12 }}>
              <Button label="Extend schedule" variant="secondary" onPress={handleExtend} loading={extending} />
              <Button label="+ New session" variant="secondary" onPress={openCreateForm} />
              <Button label="Delete session" variant="danger"onPress={handleDelete} />
            </View>
          }
        />
      )}
    </View>
  );
}

function formatOffset(startOffsetMinutes: number, baseTimeMs: number): string {
  const d = new Date(baseTimeMs + startOffsetMinutes * 60_000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }: { status: ScheduleSlotWithTeams['status'] }) {
  const { colors } = useTheme();
  const config = {
    pending: { label: 'Pending', color: colors.subtext },
    in_progress: { label: 'Live', color: colors.warning },
    completed: { label: 'Done', color: colors.success },
  }[status];
  return (
    <View style={[styles.badge, { backgroundColor: config.color + '22' }]}>
      <Text style={{ color: config.color, fontSize: 11, fontWeight: '700' }}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, gap: 8 },
  formList: { padding: 16, gap: 10 },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700' },
  sectionLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase' },
  row: { flexDirection: 'row', gap: 12 },
  segmented: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth },
  teamPickCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  roundLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 8 },
  slotCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
});
