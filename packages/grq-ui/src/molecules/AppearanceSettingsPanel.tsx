import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { useTheme } from '@grq/ui/contexts/ThemeContext';
import { useLanguage } from '@grq/core/contexts/LanguageContext';
import { Moon, Sun, Languages } from 'lucide-react';
import { ColorSettingsPanel } from '@grq/ui/molecules/ColorSettingsPanel';
import { cn } from '@grq/ui/lib/utils';

export function AppearanceSettingsPanel() {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();
  const { language, setLanguage } = useLanguage();

  return (
    <div className="space-y-6">
      {/* Visual Toggles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Theme Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sun className="h-4 w-4 text-amber-500" /> 
              {t('settings.theme', 'Theme')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex justify-between gap-3">
            <button
              onClick={() => setTheme('light')}
              className={cn(
                "flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all",
                theme === 'light' ? "border-primary bg-primary/5 text-primary" : "border-border/60 hover:border-primary/50 text-muted-foreground"
              )}
            >
              <Sun className="h-6 w-6 mb-2" />
              <span className="text-xs font-semibold">Light</span>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={cn(
                "flex-1 flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all",
                theme === 'dark' ? "border-primary bg-primary/5 text-primary" : "border-border/60 hover:border-primary/50 text-muted-foreground"
              )}
            >
              <Moon className="h-6 w-6 mb-2" />
              <span className="text-xs font-semibold">Dark</span>
            </button>
          </CardContent>
        </Card>

        {/* Language Card */}
        <Card className="shadow-sm">
          <CardHeader className="pb-3 border-b border-border/40">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Languages className="h-4 w-4 text-emerald-500" /> 
              {t('settings.language', 'Language')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 flex flex-col gap-2">
            <button
              onClick={() => setLanguage('en')}
              className={cn(
                "w-full flex flex-row items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left",
                language === 'en' ? "border-primary bg-primary/5 text-primary" : "border-border/60 hover:border-primary/50 text-muted-foreground"
              )}
            >
              <span className="font-semibold text-sm">English (EN)</span>
              {language === 'en' && <div className="h-2 w-2 rounded-full bg-primary" />}
            </button>
            <button
              onClick={() => setLanguage('ar')}
              className={cn(
                "w-full flex flex-row items-center justify-between px-4 py-3 rounded-xl border-2 transition-all text-left",
                language === 'ar' ? "border-primary bg-primary/5 text-primary" : "border-border/60 hover:border-primary/50 text-muted-foreground"
              )}
            >
              <span className="font-semibold text-sm">العربية (AR)</span>
              {language === 'ar' && <div className="h-2 w-2 rounded-full bg-primary" />}
            </button>
          </CardContent>
        </Card>
      </div>

      <ColorSettingsPanel />
    </div>
  );
}
