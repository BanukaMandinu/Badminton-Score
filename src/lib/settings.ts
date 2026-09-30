import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ScoringRule } from '@/lib/types';

const DEFAULTS_KEY = 'badminton.sessionDefaults';

export interface SessionDefaults {
  courtCount: number;
  slotMinutes: number;
  scoringRule: ScoringRule;
}

export const FALLBACK_DEFAULTS: SessionDefaults = {
  courtCount: 1,
  slotMinutes: 15,
  scoringRule: 'bwf21',
};

export async function loadSessionDefaults(): Promise<SessionDefaults> {
  try {
    const raw = await AsyncStorage.getItem(DEFAULTS_KEY);
    if (!raw) return FALLBACK_DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...FALLBACK_DEFAULTS, ...parsed };
  } catch {
    return FALLBACK_DEFAULTS;
  }
}

export async function saveSessionDefaults(defaults: SessionDefaults): Promise<void> {
  await AsyncStorage.setItem(DEFAULTS_KEY, JSON.stringify(defaults));
}
