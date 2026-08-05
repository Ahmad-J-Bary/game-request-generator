// src/pages/Dashboard.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGames } from '@grq/core/hooks/useGames';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@grq/ui/atoms/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@grq/ui/atoms/card';
import { Button } from '@grq/ui/atoms/button';
import { 
  Gamepad2, Users, CheckCircle, ClipboardList, Clock, 
  Trash2, ShieldCheck, MapPin,
  LayoutDashboard, Zap, Send
} from 'lucide-react';
import { TauriService } from '@grq/core/services/tauri.service';
import { asyncStorageService } from '@grq/core/services/storage.service';
import { calculateTimerState } from '@grq/core/utils/timer.utils';
import { parseAccountStartDate } from '@grq/core/utils/daily-tasks.utils';
import type { CompletedAccount, Account, DailyAccountStat, DailyRecentCompletion, DailyTask, AccountCompletionRecord, AccountStartState } from '@grq/api-bindings';
import { invoke } from '@tauri-apps/api/core';
import { NotificationService } from '@grq/core/utils/notifications';
import { Badge } from '@grq/ui/atoms/badge';
import { Progress } from '@grq/ui/atoms/progress';
import { proxyStateProgressClass } from '@grq/ui/lib/proxy-state-styles';
import { ExcelService } from '@grq/core/services/excel.service';
import { useSettings } from '@grq/ui/contexts/SettingsContext';
import { useTheme } from '@grq/ui/contexts/ThemeContext';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { games } = useGames();

  const [totalTasksToday, setTotalTasksToday] = useState(0);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [readyTasksCount, setReadyTasksCount] = useState(0);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [completedAccounts, setCompletedAccounts] = useState<CompletedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  
  const { colors } = useSettings();
  const { theme } = useTheme();

  const loadData = async () => {
    try {
      setLoading(true);
      const [accounts, completed] = await Promise.all([
        TauriService.getAllAccounts(),
        TauriService.getCompletedAccounts()
      ]);
      setAllAccounts(accounts);
      setCompletedAccounts(completed);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const confirmDeleteAccount = (id: number) => {
    setDeletingAccountId(id);
    setShowDeleteDialog(true);
  };

  const doDeleteAccount = async () => {
    if (deletingAccountId == null) return;
    try {
      await TauriService.deleteAccount(deletingAccountId);
      NotificationService.success(t('dashboard.accountDeleted', 'Account deleted successfully!'));
      setShowDeleteDialog(false);
      setDeletingAccountId(null);
      await loadData();
    } catch (e) {
      NotificationService.error(t('dashboard.deleteFailed', 'Failed to delete account.'));
    }
  };

  const handleSendToTelegram = async (account: CompletedAccount) => {
    try {
      const message = `${account.name}`;
      await invoke('send_to_telegram', { message });
      NotificationService.success(t('dashboard.reportSent', { name: account.name }));
    } catch (e: unknown) {
      console.error(e);
      const error = e as Error;
      NotificationService.error(error.message || t('errors.saveFailed'));
    }
  };

  const handleSendExcelReport = async () => {
    try {
      setIsReporting(true);
      NotificationService.info(t('settings.generatingReport', 'Generating report...'));
      
      const buffer = await ExcelService.generateAllGamesBuffer('vertical', colors, theme, 'event-only');
      
      if (!buffer) {
        throw new Error('Failed to generate Excel buffer');
      }

      const uint8Array = new Uint8Array(buffer);
      const filename = `Full_Report_${new Date().toISOString().split('T')[0]}.xlsx`;

      await invoke('send_excel_to_telegram', { 
        bytes: Array.from(uint8Array), 
        filename
      });

      NotificationService.success(t('settings.reportSent'));
    } catch (e: unknown) {
      console.error(e);
      const error = e as Error;
      NotificationService.error(error.message || t('errors.saveFailed'));
    } finally {
      setIsReporting(false);
    }
  };

  // Keep the latest accounts available to the stable loadStats callback without
  // forcing the main effect to re-run on every accounts change (which caused an
  // endless "Calling archives..." loop).
  const allAccountsRef = useRef<Account[]>([]);

  useEffect(() => {
    allAccountsRef.current = allAccounts;
  }, [allAccounts]);

  // Load daily task stats immediately from the bulk DB stats command. No need
  // to visit Daily Tasks first.
  const loadStats = useCallback(async () => {
    const today = new Date().toISOString().split('T')[0];
    const currentTime = Date.now();
    const accounts = allAccountsRef.current;

    let dailyStats: DailyAccountStat[] = [];
    let recentCompletions: DailyRecentCompletion[] = [];
    try {
      const result = await TauriService.getAllDailyStats(today);
      dailyStats = result.stats || [];
      recentCompletions = result.recentCompletions || [];
    } catch (err) {
      console.error('Error loading daily stats:', err);
    }

    // Total (Σ per-account N) and completed (card-consistent units). Completed
    // comes straight from the DB (lenient, includes manual completions from
    // Accounts Detail) instead of total - pending.
    let total = 0;
    let completed = 0;
    dailyStats.forEach((s) => {
      total += s.totalTasks ?? 0;
      completed += s.completedCards ?? 0;
    });
    setTotalTasksToday(total);
    setCompletedTodayCount(Math.max(0, completed));

    // Ready count: only the first pending card per account can be ready.
    try {
      const completionRecords = (await asyncStorageService.get<{ [accountId: number]: AccountCompletionRecord }>('accountCompletionRecords')) || {};
      const persistedStartStates = (await asyncStorageService.get<{ [accountId: number]: AccountStartState }>('accountStartStates')) || {};
      const accountsById: { [id: number]: Account } = {};
      accounts.forEach((a) => { accountsById[a.id] = a; });

      // Fall back to the account's last DB completion when this device has no
      // local record (e.g. the account was completed via Accounts Detail or on
      // another run), so the first-pending-card anchor is accurate.
      dailyStats.forEach((s) => {
        if (completionRecords[s.accountId]) return;
        if (s.lastCompletionTimeMs == null || s.lastCompletionTimeSpent == null) return;
        completionRecords[s.accountId] = {
          accountId: s.accountId,
          completionTime: s.lastCompletionTimeMs,
          timeSpent: s.lastCompletionTimeSpent,
          levelId: s.firstPendingLevelId ?? 0,
          eventToken: s.firstPendingEventToken ?? '',
        };
      });

      let ready = 0;
      dailyStats.forEach((s) => {
        if (s.firstPendingCardTimeSpent == null) return;
        const account = accountsById[s.accountId];
        if (!account) return;

        // Build a start state from the account when not persisted, so
        // first-task readiness (startTime + timeSpent) is still meaningful.
        const startStates = { ...persistedStartStates };
        if (!startStates[s.accountId]) {
          const parsed = parseAccountStartDate(account);
          if (!parsed) return;
          startStates[s.accountId] = {
            accountId: account.id,
            startTime: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}T${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}:${String(parsed.getSeconds()).padStart(2, '0')}`,
            firstRequestAllowedAt: parsed.getTime() + (s.firstPendingCardTimeSpent ?? 0) * 1000,
            isInitialized: true,
          };
        }

        const task = {
          account,
          requests: [{
            request_type: '',
            event_token: s.firstPendingEventToken ?? '',
            level_id: s.firstPendingLevelId ?? null,
            time_spent: s.firstPendingCardTimeSpent,
          }],
          requestGroups: [{ time_spent: s.firstPendingCardTimeSpent, requests: [] }],
          targetDate: today,
          completedTasks: new Set<string>(),
        } as unknown as DailyTask;

        const st = calculateTimerState(
          task,
          0,
          [],
          currentTime,
          completionRecords,
          startStates,
          recentCompletions,
        );
        if (st.isReady) ready += 1;
      });
      setReadyTasksCount(ready);
    } catch (err) {
      console.error('Error computing ready task count:', err);
    }
  }, []);

  // Run once on mount: load stats + accounts, then keep stats live via a
  // periodic timer and completion/progress events.
  useEffect(() => {
    loadStats();
    loadData();

    const interval = window.setInterval(loadStats, 45000);
    window.addEventListener('daily-task-completed', loadStats);
    window.addEventListener('progress-updated', loadStats);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('daily-task-completed', loadStats);
      window.removeEventListener('progress-updated', loadStats);
    };
  }, [loadStats]);

  // Recompute the ready count once accounts are loaded. This must NOT call
  // loadData (that would re-loop setting allAccounts -> effect -> loadData).
  useEffect(() => {
    if (allAccounts.length > 0) {
      loadStats();
    }
  }, [allAccounts, loadStats]);

  const stateDistribution = {
    FLORIDA: allAccounts.filter(a => a.proxy_state === 'FLORIDA').length,
    CALIFORNIA: allAccounts.filter(a => a.proxy_state === 'CALIFORNIA').length,
    TEXAS: allAccounts.filter(a => a.proxy_state === 'TEXAS').length,
    'New York': allAccounts.filter(a => a.proxy_state === 'New York').length,
    UK: allAccounts.filter(a => a.proxy_state === 'UK').length,
  };

  const successRate = totalTasksToday > 0 
    ? Math.round((completedTodayCount / totalTasksToday) * 100) 
    : 0;

  return (
    <div className="space-y-8 pb-10 animate-in fade-in duration-700">
      {/* --- HERO HEADER --- */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/10 via-background to-background border p-8 shadow-sm">
        <div className="absolute top-0 right-0 p-8 text-primary/5 opacity-20 pointer-events-none">
          <LayoutDashboard size={160} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight flex items-center gap-4 italic font-outfit">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl overflow-hidden bg-background shadow-lg border-2 border-primary/20 animate-in zoom-in duration-500">
                <img src="/icon.png" alt="Logo" className="h-full w-full object-cover" />
              </div>
              {t('dashboard.title')}
            </h2>
            <p className="text-muted-foreground text-lg max-w-lg">
              {t('dashboard.welcome')}
            </p>
          </div>
             <Button 
               size="lg" 
               variant="outline"
               className="rounded-full shadow-lg hover:scale-105 transition-transform font-bold border-primary/20 bg-background/50"
               onClick={handleSendExcelReport}
               disabled={isReporting}
             >
               <Send className={`mr-2 h-5 w-5 ${isReporting ? 'animate-pulse' : ''}`} />
               {isReporting ? t('common.loading') : t('settings.sendReport', 'Send Excel Report')}
             </Button>
             <Button 
               size="lg" 
               className="rounded-full shadow-lg hover:scale-105 transition-transform font-bold"
               onClick={() => navigate('/daily-tasks')}
             >
               <Clock className="mr-2 h-5 w-5" />
               {t('dashboard.startWorking', 'Start Today\'s Session')}
             </Button>
        </div>
      </div>

      {/* --- KPI STATS --- */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {((): Array<{
          label: string;
          val: number;
          icon: typeof Gamepad2;
          color: string;
          desc?: string;
          percent?: number;
          progressNote?: string;
        }> => [
          { label: t('dashboard.totalGames'), val: games.length, icon: Gamepad2, color: 'text-blue-500', desc: t('dashboard.managedTitles') },
          { label: t('dashboard.totalAccounts'), val: allAccounts.length, icon: Users, color: 'text-purple-500', desc: t('dashboard.acrossAllGames') },
          { label: t('dailyTasks.title'), val: totalTasksToday, icon: ClipboardList, color: 'text-orange-500', percent: successRate, progressNote: t('dashboard.completedOfTotal', { completed: completedTodayCount, total: totalTasksToday, percent: successRate }) },
          { label: t('dashboard.readyTasks'), val: readyTasksCount, icon: Zap, color: 'text-green-500', desc: t('dashboard.readyTasksDesc') },
        ])().map((stat, i) => (
          <Card key={i} className="group hover:border-primary/50 transition-all duration-300 overflow-hidden relative border-none bg-card/50 backdrop-blur-sm border-2">
            <div className={`absolute top-0 left-0 w-1 h-full bg-gradient-to-b ${stat.color.replace('text', 'from').replace('-500', '-600')} to-transparent opacity-50`} />
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                {stat.label}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color} group-hover:scale-110 transition-transform`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black">{stat.val}</div>
              {typeof stat.percent === 'number' ? (
                <>
                  <Progress value={stat.percent} className="h-2 mt-2" indicatorClassName="bg-orange-500" />
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1 font-medium">
                    {stat.progressNote}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 font-medium">
                  {stat.desc}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-12">
        {/* --- REGIONAL DISTRIBUTION --- */}
        <Card className="lg:col-span-8 bg-card/30 backdrop-blur-md border-none shadow-none">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="flex items-center gap-2 text-xl font-bold italic underline decoration-primary/30 decoration-4 underline-offset-4">
              <MapPin className="h-5 w-5 text-primary" />
              {t('dashboard.regionalDist')}
            </CardTitle>
            <CardDescription>{t('dashboard.regionalDistDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pt-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              {[
                { state: 'FLORIDA' },
                { state: 'CALIFORNIA' },
                { state: 'TEXAS' },
                { state: 'New York' },
                { state: 'UK' },
              ].map((loc) => {
                const progressClass = proxyStateProgressClass(loc.state);
                const count = stateDistribution[loc.state as keyof typeof stateDistribution];
                const percentage = allAccounts.length > 0 ? Math.round((count / allAccounts.length) * 100) : 0;
                return (
                  <div key={loc.state} className="space-y-3 p-4 rounded-2xl bg-card border shadow-sm group hover:ring-2 hover:ring-primary/20 transition-all">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{loc.state}</span>
                      <span className="text-lg font-black">{count}</span>
                    </div>
                    <Progress value={percentage} className="h-2" indicatorClassName={progressClass.color} />
                    <div className="text-[10px] text-muted-foreground font-bold flex justify-end uppercase">
                      {percentage}% {t('dashboard.percentageOfTotal')}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* --- HALL OF FAME --- */}
      <section className="space-y-6 pt-6">
        <div className="flex items-center justify-between border-b-2 pb-2">
          <div className="space-y-1">
            <h3 className="text-2xl font-black flex items-center gap-3 italic">
              <ShieldCheck className="h-7 w-7 text-green-500" />
              {t('dashboard.hallOfFame')}
            </h3>
            <CardDescription className="font-medium text-sm">
              {t('dashboard.hallOfFameDesc')}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="px-4 py-1 text-sm font-black border-2 bg-green-500 text-white rounded-full">
            {completedAccounts.length} {t('dashboard.legends')}
          </Badge>
        </div>

        <div className="pt-6">
          {loading ? (
             <div className="flex items-center justify-center p-20 text-muted-foreground italic">
               <div className="animate-pulse flex items-center gap-3">
                  <Zap className="h-6 w-6 text-primary animate-bounce" />
                  {t('dashboard.callingArchives')}
               </div>
             </div>
          ) : completedAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center p-16 rounded-3xl border-2 border-dashed bg-muted/20">
                <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6 opacity-40">
                  <ShieldCheck className="h-10 w-10" />
                </div>
                <h3 className="text-xl font-black text-muted-foreground uppercase tracking-widest leading-none mb-2">{t('dashboard.emptyGallery')}</h3>
                <p className="text-sm text-muted-foreground max-w-sm font-medium">
                  {t('dashboard.emptyGalleryDesc')}
                </p>
              </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {completedAccounts.map((account) => (
                <div 
                  key={account.id} 
                  className="group relative flex flex-col rounded-3xl border-2 bg-card p-6 shadow-sm hover:shadow-xl hover:border-green-500/50 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 flex gap-2 translate-x-4 -translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0 transition-all opacity-0 group-hover:opacity-100 z-20">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 rounded-full shadow-lg bg-background/80 backdrop-blur-sm border-primary/20 hover:border-primary hover:text-primary"
                      onClick={() => handleSendToTelegram(account)}
                      title={t('dashboard.sendToTelegram')}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-9 w-9 rounded-full shadow-lg"
                      onClick={() => confirmDeleteAccount(account.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="absolute -bottom-6 -right-6 text-green-500/10 pointer-events-none group-hover:scale-150 transition-transform duration-700">
                    <ShieldCheck size={120} />
                  </div>
                  
                  <div className="flex items-center gap-4 mb-6 relative z-10">
                    <div className="h-12 w-12 rounded-2xl bg-green-500 text-white flex items-center justify-center shadow-lg shadow-green-500/30">
                      <Gamepad2 className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-black text-lg truncate leading-tight" title={account.name}>{account.name}</h4>
                      <p className="text-xs text-muted-foreground font-bold tracking-tight truncate opacity-80" title={account.game_name}>{account.game_name}</p>
                    </div>
                  </div>
                  
                  <div className="mt-auto flex items-end justify-between border-t pt-4 relative z-10">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground font-black uppercase tracking-widest text-[9px] mb-1">{t('dashboard.enlistedOn')}</span>
                      <span className="font-bold text-sm">{account.start_date}</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-muted-foreground font-black uppercase tracking-widest text-[9px] mb-1">{t('dashboard.legacy')}</span>
                      <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-black text-sm italic">
                        {t('dailyTasks.completed')}
                        <CheckCircle className="h-4 w-4" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('accounts.deleteAccount')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dashboard.confirmDeleteAccount', 'Are you sure you want to delete this fully completed account?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowDeleteDialog(false); setDeletingAccountId(null); }}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteAccount} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}