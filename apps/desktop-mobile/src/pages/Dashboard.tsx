// src/pages/Dashboard.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGames } from '@grq/core/hooks/useGames';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@grq/ui/atoms/card';
import { Button } from '@grq/ui/atoms/button';
import { Gamepad2, Users, CheckCircle, Clock, ArrowRight, Calendar, Trash2, ShieldCheck } from 'lucide-react';
import { useSettings } from '@grq/ui/contexts/SettingsContext';
import type { CompletedDailyTask } from '@grq/api-bindings/types/daily-tasks.types';
import { TauriService } from '@grq/core/services/tauri.service';
import type { CompletedAccount } from '@grq/api-bindings';
import { NotificationService } from '@grq/core/utils/notifications';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { games } = useGames();
  const { toggleCompletedSidebar } = useSettings();

  const [todayTasksCount, setTodayTasksCount] = useState(0);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [completedAccounts, setCompletedAccounts] = useState<CompletedAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);

  const loadCompletedAccounts = async () => {
    try {
      setLoadingAccounts(true);
      const accounts = await TauriService.getCompletedAccounts();
      setCompletedAccounts(accounts);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleDeleteCompletedAccount = async (id: number) => {
    if (!window.confirm(t('dashboard.confirmDeleteAccount', 'Are you sure you want to delete this fully completed account?'))) return;
    try {
      await TauriService.deleteAccount(id);
      NotificationService.success(t('dashboard.accountDeleted', 'Account deleted successfully!'));
      await loadCompletedAccounts();
    } catch (e) {
      NotificationService.error(t('dashboard.deleteFailed', 'Failed to delete account.'));
    }
  };

  useEffect(() => {
    // Load daily task stats
    const loadStats = () => {
      const today = new Date().toISOString().split('T')[0];

      // Pending tasks
      const storedTasks = localStorage.getItem(`dailyTasks_batches_${today}`);
      if (storedTasks) {
        try {
          const parsed = JSON.parse(storedTasks);
          const batches = parsed.batches || [];
          let count = 0;
          batches.forEach((batch: { tasks: unknown[] }) => {
            count += batch.tasks.length;
          });
          setTodayTasksCount(count);
        } catch (e) {
          console.error(e);
        }
      }

      // Completed tasks
      const completedKey = `dailyTasks_completed_${today}`;
      const storedCompleted = localStorage.getItem(completedKey);
      if (storedCompleted) {
        try {
          const completed: CompletedDailyTask[] = JSON.parse(storedCompleted);
          setCompletedTodayCount(completed.length);
        } catch (e) {
          console.error(e);
        }
      }
    };

    loadStats();
    loadCompletedAccounts();

    // Listen for updates
    window.addEventListener('daily-task-completed', loadStats);
    window.addEventListener('progress-updated', loadStats);

    return () => {
      window.removeEventListener('daily-task-completed', loadStats);
      window.removeEventListener('progress-updated', loadStats);
    };
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{t('dashboard.title')}</h2>
        <p className="text-sm md:text-base text-muted-foreground">{t('dashboard.welcome')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Games Count */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('dashboard.totalGames')}
            </CardTitle>
            <Gamepad2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{games.length}</div>
            <p className="text-xs text-muted-foreground">
              Active games
            </p>
          </CardContent>
        </Card>

        {/* Today's Tasks */}
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => navigate('/daily-tasks')}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('dailyTasks.title', 'Daily Tasks')}
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{todayTasksCount}</div>
            <p className="text-xs text-muted-foreground">
              Pending tasks for today
            </p>
          </CardContent>
        </Card>

        {/* Completed Today */}
        <Card
          className="cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={toggleCompletedSidebar}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {t('dailyTasks.completedToday', 'Completed Today')}
            </CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTodayCount}</div>
            <p className="text-xs text-muted-foreground">
              Tasks finished today
            </p>
          </CardContent>
        </Card>

        {/* Total Accounts (Placeholder for now) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Across all games
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <Button
              variant="outline"
              className="h-24 flex flex-col items-center justify-center gap-2"
              onClick={() => navigate('/daily-tasks')}
            >
              <Calendar className="h-6 w-6" />
              <span>View Daily Tasks</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col items-center justify-center gap-2"
              onClick={() => navigate('/games')}
            >
              <Gamepad2 className="h-6 w-6" />
              <span>Manage Games</span>
            </Button>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Your recent task completions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {completedTodayCount > 0 ? (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium">
                  <CheckCircle className="h-4 w-4" />
                  <span>You completed {completedTodayCount} tasks today!</span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  No activity recorded today.
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start pl-0 text-primary hover:text-primary/80"
                onClick={toggleCompletedSidebar}
              >
                View all completed <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Completed Accounts Full Feature Section */}
      <Card className="border-t-4 border-t-green-500/80 shadow-md">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
          <div className="space-y-1">
            <CardTitle className="text-xl flex items-center gap-2 font-bold">
              <ShieldCheck className="h-6 w-6 text-green-500" />
              {t('dashboard.completedAccounts', 'Fully Completed Accounts')}
            </CardTitle>
            <CardDescription>
              {t('dashboard.completedAccountsDesc', 'Accounts that have successfully completed all levels and purchase events.')}
            </CardDescription>
          </div>
          <div className="bg-green-500/10 text-green-600 dark:text-green-400 px-3 py-1 rounded-full text-sm font-bold border border-green-500/20">
            {completedAccounts.length} Total
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {loadingAccounts ? (
             <div className="flex items-center justify-center p-8 text-muted-foreground">
               <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3"></div>
               Loading accounts...
             </div>
          ) : completedAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-12 border rounded-xl border-dashed bg-muted/20">
              <ShieldCheck className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground">No Completed Accounts Yet</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Finish all levels and purchase events for an account, and it will automatically appear here!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {completedAccounts.map((account) => (
                <div key={account.id} className="flex flex-col rounded-xl border bg-card p-4 shadow-sm hover:shadow transition-shadow group relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-8 w-8 rounded-full shadow-md hover:scale-105"
                      onClick={() => handleDeleteCompletedAccount(account.id)}
                      title={t('common.delete', 'Delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-3 mb-3 pr-10">
                    <div className="h-10 w-10 rounded-full bg-green-500/10 flex items-center justify-center text-green-600 dark:text-green-400">
                      <Gamepad2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-base truncate" title={account.name}>{account.name}</h4>
                      <p className="text-xs text-muted-foreground truncate" title={account.game_name}>{account.game_name}</p>
                    </div>
                  </div>
                  
                  <div className="mt-auto grid grid-cols-2 gap-2 text-xs border-t pt-3">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Start Date</span>
                      <span>{account.start_date}</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">Completion</span>
                      <span className="text-green-600 dark:text-green-400 font-semibold">100% DONE</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}