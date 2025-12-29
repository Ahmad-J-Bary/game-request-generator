// src/pages/Dashboard.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGames } from '../hooks/useGames';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Gamepad2, Users, CheckCircle, Clock, ArrowRight, Calendar } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import type { CompletedDailyTask } from '../types/daily-tasks.types';

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { games } = useGames();
  const { toggleCompletedSidebar } = useSettings();

  const [todayTasksCount, setTodayTasksCount] = useState(0);
  const [completedTodayCount, setCompletedTodayCount] = useState(0);

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
          batches.forEach((batch: any) => {
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
        <h2 className="text-3xl font-bold tracking-tight">{t('dashboard.title')}</h2>
        <p className="text-muted-foreground">{t('dashboard.welcome')}</p>
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
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="h-4 w-4 text-green-500" />
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
                className="w-full justify-start pl-0"
                onClick={toggleCompletedSidebar}
              >
                View all completed <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}