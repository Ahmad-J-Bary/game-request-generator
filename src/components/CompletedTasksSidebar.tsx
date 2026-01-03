// src/components/CompletedTasksSidebar.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle, Clock, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { cn } from '../lib/utils';
import type { CompletedDailyTask } from '../types/daily-tasks.types';

interface CompletedTasksSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CompletedTasksSidebar({ isOpen, onClose }: CompletedTasksSidebarProps) {
    const { t } = useTranslation();
    const [completedTasks, setCompletedTasks] = useState<CompletedDailyTask[]>([]);
    const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

    // Load completed tasks from localStorage
    useEffect(() => {
        loadCompletedTasks();

        // Listen for completed task events
        const handleTaskCompleted = () => {
            loadCompletedTasks();
        };

        window.addEventListener('daily-task-completed', handleTaskCompleted);
        return () => window.removeEventListener('daily-task-completed', handleTaskCompleted);
    }, []);

    const loadCompletedTasks = () => {
        const today = new Date().toISOString().split('T')[0];
        const storageKey = `dailyTasks_completed_${today}`;
        const stored = localStorage.getItem(storageKey);


        if (stored) {
            try {
                const tasks: CompletedDailyTask[] = JSON.parse(stored);
                setCompletedTasks(tasks);

                // Note: We no longer auto-expand everything. 
                // New completions will naturally be collapsed (capped).
            } catch (error) {
                console.error('Error loading completed tasks:', error);
                setCompletedTasks([]);
            }
        } else {
            setCompletedTasks([]);
        }
    };

    const clearCompletedTasks = () => {
        const today = new Date().toISOString().split('T')[0];
        const storageKey = `dailyTasks_completed_${today}`;
        localStorage.removeItem(storageKey);
        setCompletedTasks([]);
        setExpandedAccounts(new Set());
    };

    const toggleAccountExpanded = (gameId: number, accountId: number) => {
        const key = `${gameId}-${accountId}`;
        setExpandedAccounts(prev => {
            const newSet = new Set(prev);
            if (newSet.has(key)) {
                newSet.delete(key);
            } else {
                newSet.add(key);
            }
            return newSet;
        });
    };

    // Group tasks by game, then by account within each game
    const tasksByGame = completedTasks.reduce((acc, task) => {
        if (!acc[task.gameId]) {
            acc[task.gameId] = {
                gameName: task.gameName,
                accounts: {}
            };
        }

        if (!acc[task.gameId].accounts[task.accountId]) {
            acc[task.gameId].accounts[task.accountId] = {
                accountName: task.accountName,
                tasks: []
            };
        }

        acc[task.gameId].accounts[task.accountId].tasks.push(task);
        return acc;
    }, {} as Record<number, { gameName: string; accounts: Record<number, { accountName: string; tasks: CompletedDailyTask[] }> }>);

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    };

    return (
        <div
            className={cn(
                "fixed inset-y-0 right-0 z-40 w-96 bg-card border-l shadow-lg transition-transform duration-300",
                isOpen ? "translate-x-0" : "translate-x-full"
            )}
        >
            <div className="flex h-full flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b p-4">
                    <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <h2 className="text-lg font-semibold">
                            {t('dailyTasks.completedToday', 'Completed Today')}
                        </h2>
                        <Badge variant="secondary">{completedTasks.length}</Badge>
                    </div>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Content */}
                <ScrollArea className="flex-1 p-4">
                    {completedTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8">
                            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold mb-2">
                                {t('dailyTasks.noCompletedTasks', 'No Completed Tasks')}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {t('dailyTasks.noCompletedTasksDescription', 'Complete tasks to see them here')}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {Object.entries(tasksByGame).map(([gameId, { gameName, accounts }]) => (
                                <div key={gameId} className="space-y-3">
                                    <div className="flex items-center gap-2 px-2">
                                        <Badge variant="outline" className="text-xs font-bold uppercase tracking-wider bg-primary/5">
                                            {gameName}
                                        </Badge>
                                    </div>
                                    
                                    <div className="space-y-2">
                                        {Object.entries(accounts).map(([accountId, { accountName, tasks }]) => {
                                            const isExpanded = expandedAccounts.has(`${gameId}-${accountId}`);
                                            const latestTask = tasks[tasks.length - 1];

                                            return (
                                                <Card key={accountId} className="overflow-hidden border-muted">
                                                    <div 
                                                        className="p-3 cursor-pointer hover:bg-accent/50 transition-colors flex items-center justify-between"
                                                        onClick={() => toggleAccountExpanded(Number(gameId), Number(accountId))}
                                                    >
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            {isExpanded ? (
                                                                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                            ) : (
                                                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                            )}
                                                            <span className="font-semibold text-sm truncate">{accountName}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                                            {!isExpanded && (
                                                                <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                                                    {latestTask.timeSpent}s
                                                                </span>
                                                            )}
                                                            <Badge variant="secondary" className="text-[10px] px-1.5">
                                                                {tasks.length}
                                                            </Badge>
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <CardContent className="p-3 pt-0 space-y-2 border-t bg-muted/10">
                                                            {tasks.map((task) => (
                                                                <div
                                                                    key={task.id}
                                                                    className={cn(
                                                                        "border rounded-md p-4 space-y-1 text-sm transition-colors",
                                                                        task.isPurchase
                                                                            ? "bg-amber-500/10 border-amber-500/20"
                                                                            : task.requestType === 'Level Session'
                                                                                ? "bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700"
                                                                                : task.requestType === 'Session Only'
                                                                                    ? "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-600"
                                                                                    : "bg-background border-border"
                                                                    )}
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge
                                                                                variant={(task.requestType as string).includes('Session') ? 'default' : 'secondary'}
                                                                                className={cn(
                                                                                    "text-[10px] h-4 px-1.5",
                                                                                    task.isPurchase && (task.requestType as string).includes('Session') && "bg-amber-600 hover:bg-amber-600",
                                                                                    task.isPurchase && (task.requestType as string).includes('Event') && "bg-amber-100 text-amber-900 border-amber-200",
                                                                                    !task.isPurchase && task.requestType === 'Level Session' && "bg-blue-600 hover:bg-blue-600 text-white",
                                                                                    !task.isPurchase && task.requestType === 'Session Only' && "bg-gray-600 hover:bg-gray-600 text-white"
                                                                                )}
                                                                            >
                                                                                {(task.requestType as string).includes('Session') ? 'Session' : 'Event'}
                                                                            </Badge>
                                                                            {task.eventToken && (
                                                                                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
                                                                                    {task.eventToken}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-[10px] font-medium text-muted-foreground">
                                                                            {task.timeSpent}s
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                                                                        <Clock className="h-3 w-3" />
                                                                        {formatTime(task.completionTime)}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </CardContent>
                                                    )}
                                                </Card>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>

                {/* Footer */}
                {completedTasks.length > 0 && (
                    <div className="border-t p-4">
                        <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={clearCompletedTasks}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('dailyTasks.clearCompleted', 'Clear Completed')}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
