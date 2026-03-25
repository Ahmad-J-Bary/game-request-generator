// src/pages/SettingsPage.tsx

import { useTranslation } from 'react-i18next';
import { Settings } from 'lucide-react';
import { ColorSettingsPanel } from '@grq/ui/molecules/ColorSettingsPanel';
import { DatabaseSettingsPanel } from '@grq/ui/molecules/DatabaseSettingsPanel';

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6 md:h-8 md:w-8" />
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
      </div>

      <DatabaseSettingsPanel />
      <ColorSettingsPanel />
    </div>
  );
}