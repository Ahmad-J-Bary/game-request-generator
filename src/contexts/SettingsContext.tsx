import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { storageService } from '../services/storage.service';

export interface ColorSettings {
  levelBonus: string;        // Levels with bonus
  levelNormal: string;       // Levels without bonus
  purchaseRestricted: string; // Restricted purchase events
  purchaseUnrestricted: string; // Unrestricted purchase events
}

const DEFAULT_COLORS: ColorSettings = {
  levelBonus: 'bg-green-50',
  levelNormal: 'bg-blue-50',
  purchaseRestricted: 'bg-yellow-50',
  purchaseUnrestricted: 'bg-gray-50',
};

interface SettingsContextType {
  colors: ColorSettings;
  updateColors: (colors: Partial<ColorSettings>) => void;
  resetColors: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [colors, setColors] = useState<ColorSettings>(() => {
    const saved = storageService.get<ColorSettings>('colorSettings');
    return saved || DEFAULT_COLORS;
  });

  useEffect(() => {
    storageService.set('colorSettings', colors);
  }, [colors]);

  const updateColors = (newColors: Partial<ColorSettings>) => {
    setColors(prev => ({ ...prev, ...newColors }));
  };

  const resetColors = () => {
    setColors(DEFAULT_COLORS);
  };

  return (
    <SettingsContext.Provider value={{ colors, updateColors, resetColors }}>
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

// Hook to get color class based on type
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

