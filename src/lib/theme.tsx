import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const THEME_PREFERENCE_KEY = 'badminton.themePreference';

export interface ThemeColors {
  background: string;
  card: string;
  border: string;
  text: string;
  subtext: string;
  primary: string;
  primaryText: string;
  success: string;
  danger: string;
  warning: string;
  chip: string;
}

const lightColors: ThemeColors = {
  background: '#F4F6F8',
  card: '#FFFFFF',
  border: '#E2E5E9',
  text: '#14181F',
  subtext: '#5B6472',
  primary: '#1E6F46',
  primaryText: '#FFFFFF',
  success: '#1E8E57',
  danger: '#C4423B',
  warning: '#B8781C',
  chip: '#EAF2ED',
};

const darkColors: ThemeColors = {
  background: '#0F1215',
  card: '#1B2027',
  border: '#2B323B',
  text: '#EDEFF2',
  subtext: '#9AA4B2',
  primary: '#3FA873',
  primaryText: '#06130D',
  success: '#3FA873',
  danger: '#E5675F',
  warning: '#D89A45',
  chip: '#1E2A24',
};

interface ThemeContextValue {
  preference: ThemePreference;
  scheme: ColorScheme;
  colors: ThemeColors;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(THEME_PREFERENCE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark' || stored === 'system') {
          setPreferenceState(stored);
        }
      })
      .finally(() => setLoaded(true));
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    AsyncStorage.setItem(THEME_PREFERENCE_KEY, next).catch(() => {});
  };

  const scheme: ColorScheme = preference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : preference;
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const value = useMemo(
    () => ({ preference, scheme, colors, setPreference }),
    [preference, scheme, colors],
  );

  if (!loaded) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
