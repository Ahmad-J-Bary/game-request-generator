// src/pages/SettingsPage.tsx

import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { ColorSettingsPanel } from '../components/molecules/ColorSettingsPanel';

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6" />
        <h1 className="text-3xl font-bold">{t('settings.title')}</h1>
      </div>

      <ColorSettingsPanel />
    </div>
  );
}