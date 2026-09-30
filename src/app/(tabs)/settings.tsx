import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { TextField } from '@/components/TextField';
import { FALLBACK_DEFAULTS, loadSessionDefaults, saveSessionDefaults } from '@/lib/settings';
import { scoringRuleLabel } from '@/lib/scoring';
import { useTheme, type ThemePreference } from '@/lib/theme';
import type { ScoringRule } from '@/lib/types';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const RULE_OPTIONS: { value: ScoringRule; label: string }[] = [
  { value: 'bwf21', label: 'BWF 21' },
  { value: 'classic15', label: 'Classic 15' },
];

export default function SettingsScreen() {
  const { colors, preference, setPreference } = useTheme();
  const [courtCount, setCourtCount] = useState(FALLBACK_DEFAULTS.courtCount);
  const [slotMinutes, setSlotMinutes] = useState(FALLBACK_DEFAULTS.slotMinutes);
  const [scoringRule, setScoringRule] = useState<ScoringRule>(FALLBACK_DEFAULTS.scoringRule);

  useEffect(() => {
    loadSessionDefaults().then((d) => {
      setCourtCount(d.courtCount);
      setSlotMinutes(d.slotMinutes);
      setScoringRule(d.scoringRule);
    });
  }, []);

  async function persist(next: { courtCount?: number; slotMinutes?: number; scoringRule?: ScoringRule }) {
    const merged = {
      courtCount: next.courtCount ?? courtCount,
      slotMinutes: next.slotMinutes ?? slotMinutes,
      scoringRule: next.scoringRule ?? scoringRule,
    };
    setCourtCount(merged.courtCount);
    setSlotMinutes(merged.slotMinutes);
    setScoringRule(merged.scoringRule);
    await saveSessionDefaults(merged);
  }

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.list}>
      <Text style={[styles.title, { color: colors.text }]}>Appearance</Text>
      <Card style={styles.segmented}>
        {THEME_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            onPress={() => setPreference(opt.value)}
            style={[
              styles.segment,
              { backgroundColor: preference === opt.value ? colors.primary : 'transparent' },
            ]}
          >
            <Text style={{ color: preference === opt.value ? colors.primaryText : colors.text, fontWeight: '600' }}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </Card>

      <Text style={[styles.title, { color: colors.text, marginTop: 20 }]}>New session defaults</Text>
      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Courts"
              keyboardType="number-pad"
              value={String(courtCount)}
              onChangeText={(v) => persist({ courtCount: Math.max(1, Number(v.replace(/[^0-9]/g, '')) || 1) })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Minutes per match"
              keyboardType="number-pad"
              value={String(slotMinutes)}
              onChangeText={(v) => persist({ slotMinutes: Math.max(5, Number(v.replace(/[^0-9]/g, '')) || 5) })}
            />
          </View>
        </View>
        <Text style={[styles.label, { color: colors.subtext }]}>Default scoring rule</Text>
        <View style={styles.segmentedRow}>
          {RULE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              onPress={() => persist({ scoringRule: opt.value })}
              style={[
                styles.segment,
                {
                  flex: 1,
                  backgroundColor: scoringRule === opt.value ? colors.primary : colors.chip,
                  borderColor: colors.border,
                  borderWidth: StyleSheet.hairlineWidth,
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
        <Text style={{ color: colors.subtext, fontSize: 12 }}>
          The scoring rule can still be changed per match on the live score screen, up until the first point is
          played.
        </Text>
      </Card>

      <Text style={{ color: colors.subtext, fontSize: 12, marginTop: 20, textAlign: 'center' }}>
        All data is stored locally on this device.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '500' },
  row: { flexDirection: 'row', gap: 12 },
  segmented: { flexDirection: 'row', gap: 6, padding: 6 },
  segmentedRow: { flexDirection: 'row', gap: 8 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
});
