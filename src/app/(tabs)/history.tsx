import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { listCompletedMatchesGroupedByWeek, listPlayerStats, PlayerStat, WeekGroup } from '@/lib/repositories/history';
import { useTheme } from '@/lib/theme';
import type { MatchWithTeams } from '@/lib/types';

export default function HistoryScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [weeks, setWeeks] = useState<WeekGroup[]>([]);
  const [stats, setStats] = useState<PlayerStat[]>([]);

  const reload = useCallback(async () => {
    const [weekGroups, playerStats] = await Promise.all([
      listCompletedMatchesGroupedByWeek(db),
      listPlayerStats(db),
    ]);
    setWeeks(weekGroups);
    setStats(playerStats);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  const sections = weeks.map((w) => ({ title: w.weekLabel, data: w.matches }));

  return (
    <SectionList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.list}
      sections={sections}
      keyExtractor={(item: MatchWithTeams) => String(item.id)}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 8 }}>
          <Text style={[styles.title, { color: colors.text }]}>Player standings</Text>
          {stats.length === 0 ? (
            <Text style={{ color: colors.subtext }}>No completed matches yet.</Text>
          ) : (
            <Card>
              <View style={styles.statsHeaderRow}>
                <Text style={[styles.statsCell, { flex: 2, color: colors.subtext, fontWeight: '700' }]}>Player</Text>
                <Text style={[styles.statsCell, { color: colors.subtext, fontWeight: '700' }]}>W-L</Text>
                <Text style={[styles.statsCell, { color: colors.subtext, fontWeight: '700' }]}>Pts</Text>
              </View>
              {stats.map((s) => (
                <View key={s.playerId} style={styles.statsHeaderRow}>
                  <Text style={[styles.statsCell, { flex: 2, color: colors.text }]}>{s.playerName}</Text>
                  <Text style={[styles.statsCell, { color: colors.text }]}>
                    {s.wins}-{s.losses}
                  </Text>
                  <Text style={[styles.statsCell, { color: colors.subtext }]}>
                    {s.pointsFor}/{s.pointsAgainst}
                  </Text>
                </View>
              ))}
            </Card>
          )}
          <Text style={[styles.title, { color: colors.text, marginTop: 12 }]}>Weekly history</Text>
          {weeks.length === 0 && <Text style={{ color: colors.subtext }}>Play and finish a match to see it here.</Text>}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <Text style={[styles.weekLabel, { color: colors.subtext, backgroundColor: colors.background }]}>
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <Card style={styles.matchCard}>
          <Text style={{ color: colors.text, fontWeight: '600' }}>
            {item.team_a_name} <Text style={{ color: colors.primary }}>{item.team_a_score}</Text> —{' '}
            <Text style={{ color: colors.primary }}>{item.team_b_score}</Text> {item.team_b_name}
          </Text>
          <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 4 }}>
            Winner: {item.winner_team_id === item.team_a_id ? item.team_a_name : item.team_b_name}
          </Text>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  statsHeaderRow: { flexDirection: 'row', paddingVertical: 6 },
  statsCell: { flex: 1, fontSize: 13 },
  weekLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', paddingVertical: 8 },
  matchCard: { marginBottom: 8 },
});
