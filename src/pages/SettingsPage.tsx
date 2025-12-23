// src/pages/SettingsPage.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Input } from '../components/ui/input';
import { useSettings, ColorSettings } from '../contexts/SettingsContext';
import { Settings } from 'lucide-react';

const COLOR_PRESETS: Record<string, string> = {
  'bg-green-50': 'Green (Light)',
  'bg-blue-50': 'Blue (Light)',
  'bg-yellow-50': 'Yellow (Light)',
  'bg-gray-50': 'Gray (Light)',
  'bg-green-100': 'Green (Medium)',
  'bg-blue-100': 'Blue (Medium)',
  'bg-yellow-100': 'Yellow (Medium)',
  'bg-gray-100': 'Gray (Medium)',
  'bg-green-200': 'Green (Dark)',
  'bg-blue-200': 'Blue (Dark)',
  'bg-yellow-200': 'Yellow (Dark)',
  'bg-gray-200': 'Gray (Dark)',
  'bg-emerald-50': 'Emerald (Light)',
  'bg-cyan-50': 'Cyan (Light)',
  'bg-amber-50': 'Amber (Light)',
  'bg-slate-50': 'Slate (Light)',
};

export default function SettingsPage() {
  const { t } = useTranslation();
  const { colors, updateColors, resetColors } = useSettings();
  const [localColors, setLocalColors] = useState<ColorSettings>(colors);

  useEffect(() => {
    setLocalColors(colors);
  }, [colors]);

  const handleColorChange = (key: keyof ColorSettings, value: string) => {
    setLocalColors(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    updateColors(localColors);
  };

  const handleReset = () => {
    setLocalColors({
      levelBonus: 'bg-green-50',
      levelNormal: 'bg-blue-50',
      purchaseRestricted: 'bg-yellow-50',
      purchaseUnrestricted: 'bg-gray-50',
    });
    resetColors();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" />
        <h1 className="text-3xl font-bold">{t('settings.title') ?? 'Settings'}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.colors.title') ?? 'Color Settings'}</CardTitle>
          <CardDescription>
            {t('settings.colors.description') ?? 'Customize colors for levels and purchase events'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Level Bonus Color */}
            <div className="space-y-2">
              <Label htmlFor="levelBonus">
                {t('settings.colors.levelBonus') ?? 'Level with Bonus'}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="levelBonus"
                  value={localColors.levelBonus}
                  onChange={(e) => handleColorChange('levelBonus', e.target.value)}
                  placeholder="e.g., bg-green-50"
                  className="flex-1"
                />
                <div
                  className="w-12 h-10 rounded border"
                  style={{
                    backgroundColor: localColors.levelBonus.includes('green') ? '#f0fdf4' :
                                    localColors.levelBonus.includes('blue') ? '#eff6ff' :
                                    localColors.levelBonus.includes('yellow') ? '#fefce8' :
                                    localColors.levelBonus.includes('gray') ? '#f9fafb' :
                                    localColors.levelBonus.includes('emerald') ? '#ecfdf5' :
                                    localColors.levelBonus.includes('cyan') ? '#ecfeff' :
                                    localColors.levelBonus.includes('amber') ? '#fffbeb' :
                                    localColors.levelBonus.includes('slate') ? '#f8fafc' : '#ffffff'
                  }}
                />
              </div>
              <select
                value={localColors.levelBonus}
                onChange={(e) => handleColorChange('levelBonus', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {Object.entries(COLOR_PRESETS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Level Normal Color */}
            <div className="space-y-2">
              <Label htmlFor="levelNormal">
                {t('settings.colors.levelNormal') ?? 'Level without Bonus'}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="levelNormal"
                  value={localColors.levelNormal}
                  onChange={(e) => handleColorChange('levelNormal', e.target.value)}
                  placeholder="e.g., bg-blue-50"
                  className="flex-1"
                />
                <div
                  className="w-12 h-10 rounded border"
                  style={{
                    backgroundColor: localColors.levelNormal.includes('green') ? '#f0fdf4' :
                                    localColors.levelNormal.includes('blue') ? '#eff6ff' :
                                    localColors.levelNormal.includes('yellow') ? '#fefce8' :
                                    localColors.levelNormal.includes('gray') ? '#f9fafb' :
                                    localColors.levelNormal.includes('emerald') ? '#ecfdf5' :
                                    localColors.levelNormal.includes('cyan') ? '#ecfeff' :
                                    localColors.levelNormal.includes('amber') ? '#fffbeb' :
                                    localColors.levelNormal.includes('slate') ? '#f8fafc' : '#ffffff'
                  }}
                />
              </div>
              <select
                value={localColors.levelNormal}
                onChange={(e) => handleColorChange('levelNormal', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {Object.entries(COLOR_PRESETS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Purchase Restricted Color */}
            <div className="space-y-2">
              <Label htmlFor="purchaseRestricted">
                {t('settings.colors.purchaseRestricted') ?? 'Restricted Purchase Event'}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="purchaseRestricted"
                  value={localColors.purchaseRestricted}
                  onChange={(e) => handleColorChange('purchaseRestricted', e.target.value)}
                  placeholder="e.g., bg-yellow-50"
                  className="flex-1"
                />
                <div
                  className="w-12 h-10 rounded border"
                  style={{
                    backgroundColor: localColors.purchaseRestricted.includes('green') ? '#f0fdf4' :
                                    localColors.purchaseRestricted.includes('blue') ? '#eff6ff' :
                                    localColors.purchaseRestricted.includes('yellow') ? '#fefce8' :
                                    localColors.purchaseRestricted.includes('gray') ? '#f9fafb' :
                                    localColors.purchaseRestricted.includes('emerald') ? '#ecfdf5' :
                                    localColors.purchaseRestricted.includes('cyan') ? '#ecfeff' :
                                    localColors.purchaseRestricted.includes('amber') ? '#fffbeb' :
                                    localColors.purchaseRestricted.includes('slate') ? '#f8fafc' : '#ffffff'
                  }}
                />
              </div>
              <select
                value={localColors.purchaseRestricted}
                onChange={(e) => handleColorChange('purchaseRestricted', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {Object.entries(COLOR_PRESETS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            {/* Purchase Unrestricted Color */}
            <div className="space-y-2">
              <Label htmlFor="purchaseUnrestricted">
                {t('settings.colors.purchaseUnrestricted') ?? 'Unrestricted Purchase Event'}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="purchaseUnrestricted"
                  value={localColors.purchaseUnrestricted}
                  onChange={(e) => handleColorChange('purchaseUnrestricted', e.target.value)}
                  placeholder="e.g., bg-gray-50"
                  className="flex-1"
                />
                <div
                  className="w-12 h-10 rounded border"
                  style={{
                    backgroundColor: localColors.purchaseUnrestricted.includes('green') ? '#f0fdf4' :
                                    localColors.purchaseUnrestricted.includes('blue') ? '#eff6ff' :
                                    localColors.purchaseUnrestricted.includes('yellow') ? '#fefce8' :
                                    localColors.purchaseUnrestricted.includes('gray') ? '#f9fafb' :
                                    localColors.purchaseUnrestricted.includes('emerald') ? '#ecfdf5' :
                                    localColors.purchaseUnrestricted.includes('cyan') ? '#ecfeff' :
                                    localColors.purchaseUnrestricted.includes('amber') ? '#fffbeb' :
                                    localColors.purchaseUnrestricted.includes('slate') ? '#f8fafc' : '#ffffff'
                  }}
                />
              </div>
              <select
                value={localColors.purchaseUnrestricted}
                onChange={(e) => handleColorChange('purchaseUnrestricted', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {Object.entries(COLOR_PRESETS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleReset}>
              {t('settings.reset') ?? 'Reset to Default'}
            </Button>
            <Button onClick={handleSave}>
              {t('common.save') ?? 'Save Changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

