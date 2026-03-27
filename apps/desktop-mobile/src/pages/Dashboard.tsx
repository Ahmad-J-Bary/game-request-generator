// src/pages/Dashboard.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGames } from '@grq/core/hooks/useGames';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@grq/ui/atoms/card';
import { Button } from '@grq/ui/atoms/button';
import { 
  Gamepad2, Users, CheckCircle, Clock, ArrowRight, 
  Trash2, ShieldCheck, MapPin, TrendingUp,
  LayoutDashboard, Zap, Star
} from 'lucide-react';
import { TauriService } from '@grq/core/services/tauri.service';
import type { CompletedAccount, Account, CompletedDailyTask } from '@grq/api-bindings';
import { NotificationService } from '@grq/core/utils/notifications';
import { Badge } from '@grq/ui/atoms/badge';
import { Progress } from '@grq/ui/atoms/progress';
export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { games } = useGames();

  const [todayTasksCount, setTodayTasksCount] = useState(0);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [completedAccounts, setCompletedAccounts] = useState<CompletedAccount[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleDeleteCompletedAccount = async (id: number) => {
    if (!window.confirm(t('dashboard.confirmDeleteAccount', 'Are you sure you want to delete this fully completed account?'))) return;
    try {
      await TauriService.deleteAccount(id);
      NotificationService.success(t('dashboard.accountDeleted', 'Account deleted successfully!'));
      await loadData();
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
    loadData();

    // Listen for updates
    window.addEventListener('daily-task-completed', loadStats);
    window.addEventListener('progress-updated', loadStats);

    return () => {
      window.removeEventListener('daily-task-completed', loadStats);
      window.removeEventListener('progress-updated', loadStats);
    };
  }, []);

  const stateDistribution = {
    FLORIDA: allAccounts.filter(a => a.proxy_state === 'FLORIDA').length,
    CALIFORNIA: allAccounts.filter(a => a.proxy_state === 'CALIFORNIA').length,
    TEXAS: allAccounts.filter(a => a.proxy_state === 'TEXAS').length,
    'New York': allAccounts.filter(a => a.proxy_state === 'New York').length,
  };

  const successRate = todayTasksCount > 0 
    ? Math.round((completedTodayCount / (todayTasksCount + completedTodayCount)) * 100) 
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
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight flex items-center gap-3 italic">
              <Zap className="h-8 w-8 text-yellow-500 fill-yellow-500 animate-pulse" />
              {t('dashboard.title')}
            </h2>
            <p className="text-muted-foreground text-lg max-w-lg">
              {t('dashboard.welcome')}
            </p>
          </div>
          <div className="flex gap-4">
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
      </div>

      {/* --- KPI STATS --- */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t('dashboard.totalGames'), val: games.length, icon: Gamepad2, color: 'text-blue-500', desc: 'Managed titles' },
          { label: t('dashboard.totalAccounts', 'Total Accounts'), val: allAccounts.length, icon: Users, color: 'text-purple-500', desc: 'Across all games' },
          { label: t('dailyTasks.title'), val: todayTasksCount, icon: Clock, color: 'text-orange-500', desc: 'Pending for today' },
          { label: 'Success Rate', val: `${successRate}%`, icon: TrendingUp, color: 'text-green-500', desc: 'Task completion' },
        ].map((stat, i) => (
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
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1 font-medium">
                {stat.desc}
              </p>
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
              Regional Proxy Distribution
            </CardTitle>
            <CardDescription>Account spread across US proxy locations</CardDescription>
          </CardHeader>
          <CardContent className="px-0 pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { state: 'FLORIDA', color: 'bg-orange-500', iconColor: 'text-orange-500', light: 'bg-orange-500/10' },
                { state: 'CALIFORNIA', color: 'bg-blue-500', iconColor: 'text-blue-500', light: 'bg-blue-500/10' },
                { state: 'TEXAS', color: 'bg-red-500', iconColor: 'text-red-500', light: 'bg-red-500/10' },
                { state: 'New York', color: 'bg-slate-700', iconColor: 'text-slate-700', light: 'bg-slate-700/10' },
              ].map((loc) => {
                const count = stateDistribution[loc.state as keyof typeof stateDistribution];
                const percentage = allAccounts.length > 0 ? Math.round((count / allAccounts.length) * 100) : 0;
                return (
                  <div key={loc.state} className="space-y-3 p-4 rounded-2xl bg-card border shadow-sm group hover:ring-2 hover:ring-primary/20 transition-all">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{loc.state}</span>
                      <span className="text-lg font-black">{count}</span>
                    </div>
                    <Progress value={percentage} className="h-2" indicatorClassName={loc.color} />
                    <div className="text-[10px] text-muted-foreground font-bold flex justify-end uppercase">
                      {percentage}% of total
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* --- QUICK ACCESS --- */}
        <div className="lg:col-span-4 space-y-6">
           <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-bold">Recommended</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button 
                variant="default" 
                className="w-full justify-between h-12 rounded-xl group"
                onClick={() => navigate('/daily-tasks')}
              >
                <span className="flex items-center gap-2">
                  <Zap className="h-4 w-4" />
                  Proceed to Daily Tasks
                </span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-between h-12 bg-background/50 rounded-xl"
                onClick={() => navigate('/games')}
              >
                <span className="flex items-center gap-2 text-muted-foreground group-hover:text-foreground">
                  <Gamepad2 className="h-4 w-4" />
                  Manage Inventory
                </span>
              </Button>
            </CardContent>
          </Card>

          <Card className="border-none shadow-none bg-transparent">
             <CardHeader className="px-0 pb-3">
                <CardTitle className="text-lg font-bold italic">Latest Win</CardTitle>
             </CardHeader>
             <CardContent className="px-0">
                {completedAccounts.length > 0 ? (
                  <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20 flex gap-4 items-center">
                    <div className="h-10 w-10 flex-shrink-0 rounded-full bg-green-500/20 flex items-center justify-center text-green-600">
                      <Star className="h-5 w-5 fill-green-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold truncate max-w-[150px]">{completedAccounts[0].name}</p>
                      <p className="text-[10px] text-green-600 dark:text-green-400 font-black uppercase tracking-tighter">Achievement Unlocked</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground p-4 italic">No accounts completed yet. Keep pushing!</div>
                )}
             </CardContent>
          </Card>
        </div>
      </div>

      {/* --- HALL OF FAME --- */}
      <section className="space-y-6 pt-6">
        <div className="flex items-center justify-between border-b-2 pb-2">
          <div className="space-y-1">
            <h3 className="text-2xl font-black flex items-center gap-3 italic">
              <ShieldCheck className="h-7 w-7 text-green-500" />
              THE HALL OF FAME
            </h3>
            <CardDescription className="font-medium text-sm">
              Legendary accounts that reached 100% completion
            </CardDescription>
          </div>
          <Badge variant="secondary" className="px-4 py-1 text-sm font-black border-2 bg-green-500 text-white rounded-full">
            {completedAccounts.length} LEGENDS
          </Badge>
        </div>

        <div className="pt-6">
          {loading ? (
             <div className="flex items-center justify-center p-20 text-muted-foreground italic">
               <div className="animate-pulse flex items-center gap-3">
                 <Zap className="h-6 w-6 text-primary animate-bounce" />
                 Calling archives...
               </div>
             </div>
          ) : completedAccounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center p-16 rounded-3xl border-2 border-dashed bg-muted/20">
              <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mb-6 opacity-40">
                <ShieldCheck className="h-10 w-10" />
              </div>
              <h3 className="text-xl font-black text-muted-foreground uppercase tracking-widest leading-none mb-2">Empty Gallery</h3>
              <p className="text-sm text-muted-foreground max-w-sm font-medium">
                Complete an account to immortalize it in the hall of fame. Every journey begins with a single request.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {completedAccounts.map((account) => (
                <div 
                  key={account.id} 
                  className="group relative flex flex-col rounded-3xl border-2 bg-card p-6 shadow-sm hover:shadow-xl hover:border-green-500/50 hover:-translate-y-1 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 translate-x-4 -translate-y-4 group-hover:translate-x-0 group-hover:translate-y-0 transition-all opacity-0 group-hover:opacity-100 z-20">
                    <Button
                      variant="destructive"
                      size="icon"
                      className="h-9 w-9 rounded-full shadow-lg"
                      onClick={() => handleDeleteCompletedAccount(account.id)}
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
                      <h4 className="font-black text-lg truncate leading-tight uppercase" title={account.name}>{account.name}</h4>
                      <p className="text-xs text-muted-foreground font-bold tracking-tight truncate opacity-80" title={account.game_name}>{account.game_name}</p>
                    </div>
                  </div>
                  
                  <div className="mt-auto flex items-end justify-between border-t pt-4 relative z-10">
                    <div className="flex flex-col">
                      <span className="text-muted-foreground font-black uppercase tracking-widest text-[9px] mb-1">Enlisted On</span>
                      <span className="font-bold text-sm">{account.start_date}</span>
                    </div>
                    <div className="flex flex-col text-right">
                      <span className="text-muted-foreground font-black uppercase tracking-widest text-[9px] mb-1">Legacy</span>
                      <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 font-black text-sm italic">
                        COMPLETED
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
    </div>
  );
}