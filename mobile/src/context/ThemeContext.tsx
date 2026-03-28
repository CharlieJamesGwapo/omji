import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../constants/theme';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  colors: typeof COLORS;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within ThemeProvider');
  return context;
};

// Dark mode color overrides
const DARK_COLORS: Partial<typeof COLORS> = {
  // Backgrounds
  background: '#0F172A',
  white: '#1E293B',
  gray50: '#1E293B',
  gray100: '#334155',
  gray200: '#475569',
  gray300: '#64748B',
  gray400: '#94A3B8',
  gray500: '#CBD5E1',
  gray600: '#E2E8F0',
  gray700: '#F1F5F9',
  gray800: '#F8FAFC',
  gray900: '#FFFFFF',
  black: '#FFFFFF',
  surface: '#1E293B',
  surfaceElevated: '#334155',
  // Keep brand colors the same
  // Semantic backgrounds
  primaryBg: '#1C1917',
  accentBg: '#172554',
  successBg: '#052E16',
  warningBg: '#422006',
  errorBg: '#450A0A',
  infoBg: '#1E1B4B',
  pasundoBg: '#172554',
  pasugoBg: '#052E16',
  pasabayBg: '#2E1065',
  storeBg: '#422006',
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.7)',
  overlayLight: 'rgba(0, 0, 0, 0.5)',
};

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem('theme_mode').then(saved => {
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setModeState(saved);
      }
    }).catch(() => {});
  }, []);

  const setMode = (newMode: ThemeMode) => {
    setModeState(newMode);
    AsyncStorage.setItem('theme_mode', newMode).catch(() => {});
  };

  const isDark = mode === 'dark' || (mode === 'system' && systemScheme === 'dark');

  const colors = isDark ? { ...COLORS, ...DARK_COLORS } as typeof COLORS : COLORS;

  return (
    <ThemeContext.Provider value={{ mode, isDark, setMode, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}
