import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, ShieldCheck, AlertCircle, Loader2, Save } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { toast } from 'sonner';
import { Badge } from '@grq/ui/atoms/badge';
import { cn } from '@grq/ui/lib/utils';

export function TelegramSettingsPanel() {
  const { t } = useTranslation();
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [autoSend, setAutoSend] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const config = await invoke<any>('get_telegram_config');
      setBotToken(config.bot_token || '');
      setChatId(config.chat_id || '');
      setEnabled(config.enabled || false);
      setAutoSend(config.auto_send || false);
    } catch (error) {
      console.error('Failed to load Telegram config:', error);
      toast.error(t('settings.telegram.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const normalizedBotToken = botToken.trim();
      const normalizedChatId = chatId.trim();

      await invoke('set_telegram_config', {
        botToken: normalizedBotToken || null,
        chatId: normalizedChatId || null,
        enabled,
        autoSend
      });
      setBotToken(normalizedBotToken);
      setChatId(normalizedChatId);
      await loadConfig();
      toast.success(t('settings.telegram.saveSuccess'));
    } catch (error) {
      console.error('Failed to save Telegram config:', error);
      toast.error(t('settings.telegram.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!botToken || !chatId) {
      toast.error(t('settings.telegram.testRequired'));
      return;
    }
    try {
      setTesting(true);
      await invoke('test_telegram_connection', { botToken, chatId });
      toast.success(t('settings.telegram.testSuccess'));
    } catch (error: any) {
      console.error('Test connection failed:', error);
      toast.error(t('settings.telegram.testFailed', { error }));
    } finally {
      setTesting(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            <CardTitle>{t('settings.telegram.title')}</CardTitle>
          </div>
          <Badge variant={enabled ? "default" : "secondary"} className={cn(enabled ? "bg-green-500" : "")}>
            {enabled ? t('settings.telegram.connected') : t('settings.telegram.notLinked')}
          </Badge>
        </div>
        <CardDescription>
          {t('settings.telegram.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">{t('settings.telegram.botToken')}</label>
            <Input
              type="password"
              placeholder={t('settings.telegram.botTokenPlaceholder', 'e.g. 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11')}
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              className="bg-background/50 border-primary/20 focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">{t('settings.telegram.chatId')}</label>
            <Input
              placeholder={t('settings.telegram.chatIdPlaceholder', 'e.g. -100123456789')}
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              className="bg-background/50 border-primary/20 focus:border-primary"
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 py-2">
          {/* Enable Integration Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-background/40 border-2 border-primary/10">
            <div className="space-y-0.5">
              <div className="text-sm font-bold flex items-center gap-2">
                {t('settings.telegram.enableIntegration')}
                {enabled && <ShieldCheck className="h-3 w-3 text-green-500" />}
              </div>
              <div className="text-[10px] text-muted-foreground">{t('settings.telegram.enableIntegrationDesc')}</div>
            </div>
            <button
               onClick={() => setEnabled(!enabled)}
               className={cn(
                 "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                 enabled ? "bg-primary" : "bg-muted"
               )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                enabled ? "ltr:translate-x-6 rtl:-translate-x-6" : "ltr:translate-x-1 rtl:-translate-x-1"
              )} />
            </button>
          </div>

          {/* Auto-Send Toggle */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-background/40 border-2 border-primary/10">
            <div className="space-y-0.5">
              <div className="text-sm font-bold">{t('settings.telegram.autoSend')}</div>
              <div className="text-[10px] text-muted-foreground">{t('settings.telegram.autoSendDesc')}</div>
            </div>
            <button
               disabled={!enabled}
               onClick={() => setAutoSend(!autoSend)}
               className={cn(
                 "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                 autoSend ? "bg-primary" : "bg-muted",
                 !enabled && "opacity-50 cursor-not-allowed"
               )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                autoSend ? "ltr:translate-x-6 rtl:-translate-x-6" : "ltr:translate-x-1 rtl:-translate-x-1"
              )} />
            </button>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-primary/10">
          <Button
            className="flex-1 rounded-xl h-11 font-bold shadow-lg shadow-primary/20"
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" />
              : <Save className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
            }
            {t('settings.telegram.saveConfig')}
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-xl h-11 font-bold border-primary/30 hover:bg-primary/5"
            onClick={handleTest}
            disabled={testing || !botToken || !chatId}
          >
            {testing
              ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" />
              : <Send className="h-4 w-4 ltr:mr-2 rtl:ml-2 text-primary" />
            }
            {t('settings.telegram.testConnection')}
          </Button>
        </div>

        {!botToken && !chatId && (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex gap-2 items-start">
            <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-yellow-700 leading-tight italic">
              {t('settings.telegram.setupHint')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
