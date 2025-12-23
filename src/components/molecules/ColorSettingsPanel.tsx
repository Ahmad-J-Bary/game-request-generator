// src/components/molecules/ColorSettingsPanel.tsx
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import { ColorPicker } from '../ui/color-picker';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';

export function ColorSettingsPanel() {
  const { t } = useTranslation();
  const { colors, updateColors, resetColors } = useSettings();
  
  // Ensure all colors are defined and valid
  const safeColors = {
    headerColor: colors.headerColor || 'rgb(144, 238, 144)',
    dataRowColor: colors.dataRowColor || 'rgb(255, 255, 255)',
    levelBonus: colors.levelBonus || 'rgb(220, 252, 231)',
    levelNormal: colors.levelNormal || 'rgb(219, 234, 254)',
    purchaseRestricted: colors.purchaseRestricted || 'rgb(254, 249, 195)',
    purchaseUnrestricted: colors.purchaseUnrestricted || 'rgb(243, 244, 246)',
    incompleteScheduledStyle: colors.incompleteScheduledStyle || 'rgb(255, 200, 200)',
    completeScheduledStyle: colors.completeScheduledStyle || 'rgb(200, 255, 200)'
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