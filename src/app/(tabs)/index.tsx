import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { TextField } from '@/components/TextField';
import { createTeam, deleteTeam, listTeamsWithPlayers, updateTeam } from '@/lib/repositories/teams';
import { useTheme } from '@/lib/theme';
import type { TeamWithPlayers } from '@/lib/types';

export default function TeamsScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const [teams, setTeams] = useState<TeamWithPlayers[]>([]);
  const [editingTeam, setEditingTeam] = useState<TeamWithPlayers | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [playerNames, setPlayerNames] = useState<string[]>(['', '']);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const rows = await listTeamsWithPlayers(db);
    setTeams(rows);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  function openCreateForm() {
    setEditingTeam(null);
    setTeamName('');
    setPlayerNames(['', '']);
    setShowForm(true);
  }

  function openEditForm(team: TeamWithPlayers) {
    setEditingTeam(team);
    setTeamName(team.name);
    setPlayerNames(team.players.length ? team.players.map((p) => p.name) : ['']);
    setShowForm(true);
  }

  function updatePlayerName(index: number, value: string) {
    setPlayerNames((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  function addPlayerField() {
    setPlayerNames((prev) => [...prev, '']);
  }

  function removePlayerField(index: number) {
    setPlayerNames((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!teamName.trim()) {
      Alert.alert('Team name required', 'Give this team a name before saving.');
      return;
    }
    const cleanedNames = playerNames.map((p) => p.trim()).filter(Boolean);
    setSaving(true);
    try {
      if (editingTeam) {
        await updateTeam(db, editingTeam.id, teamName, cleanedNames);
      } else {
        await createTeam(db, teamName, cleanedNames);
      }
      setShowForm(false);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(team: TeamWithPlayers) {
    Alert.alert('Delete team?', `"${team.name}" will be removed from any future scheduling.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteTeam(db, team.id);
          await reload();
        },
      },
    ]);
  }

  if (showForm) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={playerNames}
          keyExtractor={(_, i) => `player-${i}`}
          contentContainerStyle={styles.formList}
          ListHeaderComponent={
            <View style={{ gap: 12 }}>
              <Text style={[styles.title, { color: colors.text }]}>
                {editingTeam ? 'Edit team' : 'New team'}
              </Text>
              <TextField label="Team name" value={teamName} onChangeText={setTeamName} placeholder="e.g. Smashers" />
              <Text style={[styles.sectionLabel, { color: colors.subtext }]}>Players</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.playerRow}>
              <View style={{ flex: 1 }}>
                <TextField
                  value={item}
                  onChangeText={(v) => updatePlayerName(index, v)}
                  placeholder={`Player ${index + 1}`}
                />
              </View>
              <Pressable onPress={() => removePlayerField(index)} style={styles.removeButton}>
                <Ionicons name="close-circle" size={22} color={colors.danger} />
              </Pressable>
            </View>
          )}
          ListFooterComponent={
            <View style={{ gap: 12, marginTop: 8 }}>
              <Pressable onPress={addPlayerField} style={styles.addPlayerRow}>
                <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Add player</Text>
              </Pressable>
              <View style={styles.formActions}>
                <View style={{ flex: 1 }}>
                  <Button label="Cancel" variant="secondary" onPress={() => setShowForm(false)} />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Save team" onPress={handleSave} loading={saving} />
                </View>
              </View>
            </View>
          }
        />
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={teams}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.subtext }]}>
            No teams yet. Add your first team with its players to start scheduling matches.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => openEditForm(item)}>
            <Card style={styles.teamCard}>
              <View style={styles.teamHeader}>
                <Text style={[styles.teamName, { color: colors.text }]}>{item.name}</Text>
                <Pressable onPress={() => handleDelete(item)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
              <View style={styles.chipRow}>
                {item.players.length === 0 ? (
                  <Text style={{ color: colors.subtext }}>No players added</Text>
                ) : (
                  item.players.map((p) => (
                    <View key={p.id} style={[styles.chip, { backgroundColor: colors.chip }]}>
                      <Text style={{ color: colors.text, fontSize: 13 }}>{p.name}</Text>
                    </View>
                  ))
                )}
              </View>
            </Card>
          </Pressable>
        )}
      />
      <View style={styles.fabContainer}>
        <Button label="+ Add team" onPress={openCreateForm} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16, gap: 12 },
  formList: { padding: 16, gap: 10 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14, paddingHorizontal: 24 },
  title: { fontSize: 22, fontWeight: '700' },
  sectionLabel: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: 4 },
  teamCard: { gap: 10 },
  teamHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamName: { fontSize: 17, fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  removeButton: { padding: 4 },
  addPlayerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  formActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  fabContainer: { padding: 16 },
});
