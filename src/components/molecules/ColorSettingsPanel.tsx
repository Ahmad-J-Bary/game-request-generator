// src/components/molecules/ColorSettingsPanel.tsx
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { ColorPicker } from '../ui/color-picker';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';

export function ColorSettingsPanel() {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const { colors, updateColors, resetColors } = useSettings();
  
  // Ensure all colors are defined and valid, using theme-aware defaults
  const getThemeDefault = (colorKey: keyof typeof colors) => {
    const defaults = theme === 'light'
      ? {
          levelBonus: 'rgb(220, 252, 231)',
          levelNormal: 'rgb(219, 234, 254)',
          purchaseRestricted: 'rgb(254, 249, 195)',
          purchaseUnrestricted: 'rgb(243, 244, 246)',
          headerColor: 'rgb(144, 238, 144)',
          dataRowColor: 'rgb(255, 255, 255)',
          incompleteScheduledStyle: 'rgb(254, 226, 226)',
          completeScheduledStyle: 'rgb(220, 252, 231)'
        }
      : {
          levelBonus: 'rgb(34, 197, 94)',
          levelNormal: 'rgb(59, 130, 246)',
          purchaseRestricted: 'rgb(245, 158, 11)',
          purchaseUnrestricted: 'rgb(75, 85, 99)',
          headerColor: 'rgb(34, 197, 94)',
          dataRowColor: 'rgb(31, 41, 55)',
          incompleteScheduledStyle: 'rgb(239, 68, 68)',
          completeScheduledStyle: 'rgb(34, 197, 94)'
        };
    return defaults[colorKey];
  };

  const safeColors = {
    headerColor: colors.headerColor || getThemeDefault('headerColor'),
    dataRowColor: colors.dataRowColor || getThemeDefault('dataRowColor'),
    levelBonus: colors.levelBonus || getThemeDefault('levelBonus'),
    levelNormal: colors.levelNormal || getThemeDefault('levelNormal'),
    purchaseRestricted: colors.purchaseRestricted || getThemeDefault('purchaseRestricted'),
    purchaseUnrestricted: colors.purchaseUnrestricted || getThemeDefault('purchaseUnrestricted'),
    incompleteScheduledStyle: colors.incompleteScheduledStyle || getThemeDefault('incompleteScheduledStyle'),
    completeScheduledStyle: colors.completeScheduledStyle || getThemeDefault('completeScheduledStyle')
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('colorSettings.title')}</CardTitle>
        <CardDescription>
          {t('colorSettings.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold">{t('colorSettings.tableStructure')}</h3>
          <ColorPicker
            label={t('colorSettings.headerColor')}
            color={safeColors.headerColor}
            onChange={(color) => updateColors({ headerColor: color })}
          />
          <ColorPicker
            label={t('colorSettings.dataRowColor')}
            color={safeColors.dataRowColor}
            onChange={(color) => updateColors({ dataRowColor: color })}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">{t('colorSettings.columnSpecific')}</h3>
          <ColorPicker
            label={t('colorSettings.levelBonus')}
            color={safeColors.levelBonus}
            onChange={(color) => updateColors({ levelBonus: color })}
          />
          <ColorPicker
            label={t('colorSettings.levelNormal')}
            color={safeColors.levelNormal}
            onChange={(color) => updateColors({ levelNormal: color })}
          />
          <ColorPicker
            label={t('colorSettings.purchaseRestricted')}
            color={safeColors.purchaseRestricted}
            onChange={(color) => updateColors({ purchaseRestricted: color })}
          />
          <ColorPicker
            label={t('colorSettings.purchaseUnrestricted')}
            color={safeColors.purchaseUnrestricted}
            onChange={(color) => updateColors({ purchaseUnrestricted: color })}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <h3 className="text-sm font-semibold">{t('colorSettings.scheduledEvents')}</h3>
          <ColorPicker
            label={t('colorSettings.incompleteScheduled')}
            color={safeColors.incompleteScheduledStyle}
            onChange={(color) => updateColors({ incompleteScheduledStyle: color })}
          />
          <ColorPicker
            label={t('colorSettings.completeScheduled')}
            color={safeColors.completeScheduledStyle}
            onChange={(color) => updateColors({ completeScheduledStyle: color })}
          />
        </div>

        <Separator />

        <Button onClick={resetColors} variant="outline" className="w-full">
          {t('colorSettings.resetToDefaults')}
        </Button>
      </CardContent>
    </Card>
  );
}