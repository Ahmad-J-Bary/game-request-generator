// src/contexts/SettingsContext.tsx

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { storageService } from '../services/storage.service';

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

const DEFAULT_COLORS: ColorSettings = {
  levelBonus: 'rgb(220, 252, 231)',
  levelNormal: 'rgb(219, 234, 254)',
  purchaseRestricted: 'rgb(254, 249, 195)',
  purchaseUnrestricted: 'rgb(243, 244, 246)',
  headerColor: 'rgb(144, 238, 144)',      // Light green for headers
  dataRowColor: 'rgb(255, 255, 255)',     // White for data rows
  incompleteScheduledStyle: 'rgb(255, 200, 200)', // Light red for incomplete scheduled
  completeScheduledStyle: 'rgb(200, 255, 200)',   // Light green for complete scheduled
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
  const [colors, setColors] = useState<ColorSettings>(() => {
    const saved = storageService.get<ColorSettings>('colorSettings');
    return saved || DEFAULT_COLORS;
  });

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    const saved = storageService.get<boolean>('sidebarCollapsed');
    return saved ?? false;
  });

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
    setColors(DEFAULT_COLORS);
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

// Hook to get inline style for background color
export function useColorStyle() {
  const { colors } = useSettings();
  
  return (kind: 'level' | 'purchase', isBonus?: boolean, isRestricted?: boolean): React.CSSProperties => {
    let backgroundColor: string;
    
    if (kind === 'level') {
      backgroundColor = isBonus ? colors.levelBonus : colors.levelNormal;
    } else {
      backgroundColor = isRestricted ? colors.purchaseRestricted : colors.purchaseUnrestricted;
    }
    
    return { backgroundColor };
  };
}