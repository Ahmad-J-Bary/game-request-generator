// src/contexts/SettingsContext.tsx

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { storageService } from '../services/storage.service';
import { useTheme } from './ThemeContext';

export interface ColorSettings {
  levelBonus: string;        // Levels with bonus
  levelNormal: string;       // Levels without bonus
  purchaseRestricted: string; // Restricted purchase events
  purchaseUnrestricted: string; // Unrestricted purchase events
  headerColor: string;       // Table header rows color
  dataRowColor: string;      // Table data cells color
  incompleteScheduledStyle: string;  // Incomplete scheduled events
  completeScheduledStyle: string;    // Complete scheduled events
}

// Theme-aware default colors
const LIGHT_DEFAULT_COLORS: ColorSettings = {
  levelBonus: 'rgb(220, 252, 231)',      // Light green for bonus levels
  levelNormal: 'rgb(219, 234, 254)',     // Light blue for normal levels
  purchaseRestricted: 'rgb(254, 249, 195)',  // Light yellow for restricted purchases
  purchaseUnrestricted: 'rgb(243, 244, 246)', // Light gray for unrestricted purchases
  headerColor: 'rgb(144, 238, 144)',    // Light green for headers
  dataRowColor: 'rgb(255, 255, 255)',   // White for data rows
  incompleteScheduledStyle: 'rgb(254, 226, 226)', // Light red for incomplete
  completeScheduledStyle: 'rgb(220, 252, 231)',   // Light green for complete
};

const DARK_DEFAULT_COLORS: ColorSettings = {
  levelBonus: 'rgb(16, 185, 129)',       // Emerald green for bonus levels - good contrast
  levelNormal: 'rgb(99, 102, 241)',      // Indigo blue for normal levels - vibrant but not harsh
  purchaseRestricted: 'rgb(245, 101, 101)', // Red-400 for restricted purchases - clear warning
  purchaseUnrestricted: 'rgb(107, 114, 128)', // Gray-500 for unrestricted purchases - neutral
  headerColor: 'rgb(55, 65, 81)',        // Gray-700 for headers - subtle contrast
  dataRowColor: 'rgb(17, 24, 39)',       // Gray-900 for data rows - dark but visible
  incompleteScheduledStyle: 'rgb(239, 68, 68)', // Red-500 for incomplete - clear error indication
  completeScheduledStyle: 'rgb(16, 185, 129)', // Emerald-500 for complete - success indication
};

const getDefaultColors = (theme: 'light' | 'dark'): ColorSettings => {
  return theme === 'light' ? LIGHT_DEFAULT_COLORS : DARK_DEFAULT_COLORS;
};

interface SettingsContextType {
  colors: ColorSettings;
  updateColors: (colors: Partial<ColorSettings>) => void;
  resetColors: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();

  const [colors, setColors] = useState<ColorSettings>(() => {
    const saved = storageService.get<ColorSettings>('colorSettings');
    return saved || getDefaultColors(theme);
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    const saved = storageService.get<boolean>('sidebarCollapsed');
    return saved ?? false;
  });

  // Reset colors when theme changes if user hasn't customized them
  useEffect(() => {
    const saved = storageService.get<ColorSettings>('colorSettings');
    if (!saved) {
      setColors(getDefaultColors(theme));
    }
  }, [theme]);

  useEffect(() => {
    storageService.set('colorSettings', colors);
  }, [colors]);

  useEffect(() => {
    storageService.set('sidebarCollapsed', sidebarCollapsed);
  }, [sidebarCollapsed]);

  const updateColors = (newColors: Partial<ColorSettings>) => {
    setColors(prev => ({ ...prev, ...newColors }));
  };

  const resetColors = () => {
    setColors(getDefaultColors(theme));
  };

  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  return (
    <SettingsContext.Provider value={{ colors, updateColors, resetColors, sidebarCollapsed, toggleSidebar }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}

// Hook to get color class based on type with proper type guards
export function useColorClass() {
  const { colors } = useSettings();
  
  return (kind: 'level' | 'purchase', isBonus?: boolean, isRestricted?: boolean): string => {
    if (kind === 'level') {
      return isBonus ? colors.levelBonus : colors.levelNormal;
    } else {
      return isRestricted ? colors.purchaseRestricted : colors.purchaseUnrestricted;
    }
  };
}

// Hook to get inline style for background color with appropriate text color
export function useColorStyle() {
  const { colors } = useSettings();

  const getTextColor = (backgroundColor: string, theme: 'light' | 'dark'): string => {
    // Simple brightness calculation to determine if we need light or dark text
    const rgb = backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (!rgb) return theme === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';

    const r = parseInt(rgb[1]);
    const g = parseInt(rgb[2]);
    const b = parseInt(rgb[3]);

    // Calculate relative luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Return white text for dark backgrounds, black text for light backgrounds
    return luminance < 0.5 ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';
  };

  return (kind: 'level' | 'purchase', isBonus?: boolean, isRestricted?: boolean, theme?: 'light' | 'dark'): React.CSSProperties => {
    let backgroundColor: string;

    if (kind === 'level') {
      backgroundColor = isBonus ? colors.levelBonus : colors.levelNormal;
    } else {
      backgroundColor = isRestricted ? colors.purchaseRestricted : colors.purchaseUnrestricted;
    }

    return {
      backgroundColor,
      color: getTextColor(backgroundColor, theme || 'light'),
      fontWeight: '500' // Make text slightly bolder for better readability
    };
  };
}