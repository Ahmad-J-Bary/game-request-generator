// src/components/CompletedTasksSidebar.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle, Clock, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@grq/ui/atoms/button';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { Badge } from '@grq/ui/atoms/badge';
import { ScrollArea } from '@grq/ui/atoms/scroll-area';

import { cn } from '@grq/ui/lib/utils';
import type { CompletedDailyTask } from '@grq/api-bindings/types/daily-tasks.types';
import { TauriService } from '@grq/core/services/tauri.service';
import { toLocalDateIso } from '@grq/core/utils/date.utils';

interface CompletedTasksSidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

export function CompletedTasksSidebar({ isOpen, onClose }: CompletedTasksSidebarProps) {
    const { t } = useTranslation();
    const [completedTasks, setCompletedTasks] = useState<CompletedDailyTask[]>([]);
    const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

    const getRequestTypeLabel = (task: CompletedDailyTask) => {
        switch (task.requestType) {
            case 'Level Session':
            case 'Session Only':
            case 'Purchase Session':
                return t('requests.session');
            case 'Level Event':
            case 'Purchase Event':
                return t('requests.event');
            default:
                return task.requestType || (task.isPurchase ? 'Purchase Event' : 'Level Event');
        }
    };

    const getRequestTypeTone = (task: CompletedDailyTask) => {
        if (task.isPurchase && task.requestType === 'Purchase Session') {
            return "bg-amber-600 hover:bg-amber-600";
        }
        if (task.isPurchase) {
            return "bg-amber-100 text-amber-900 border-amber-200";
        }
        if (task.requestType === 'Level Session') {
            return "bg-blue-600 hover:bg-blue-600 text-white";
        }
        if (task.requestType === 'Session Only') {
            return "bg-gray-600 hover:bg-gray-600 text-white";
        }
        return "";
    };

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

    const loadCompletedTasks = async () => {
        try {
            const today = toLocalDateIso();
            const history = await TauriService.getTaskHistory(100);
            
            // Filter for tasks completed today
            const daily = history.filter(task => task.completionDate === today);
            setCompletedTasks(daily);
        } catch (error) {
            console.error('Error loading completed tasks:', error);
            setCompletedTasks([]);
        }
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
                "fixed inset-y-0 z-50 w-full sm:w-96 bg-card border-x shadow-2xl transition-all duration-300",
                "ltr:right-0 rtl:left-0",
                isOpen 
                  ? "translate-x-0" 
                  : "ltr:translate-x-full rtl:-translate-x-full"
            )}
        >
            <div className="flex h-full flex-col">
                {/* Glassmorphic Header */}
                <div 
                    className="flex items-center justify-between border-b py-3 bg-card/60 backdrop-blur-md sticky top-0 z-10 shadow-sm"
                    style={{ 
                        paddingTop: 'calc(0.75rem + env(safe-area-inset-top))',
                        paddingInlineStart: 'calc(1rem + env(safe-area-inset-left))',
                        paddingInlineEnd: 'calc(1rem + env(safe-area-inset-right))'
                    }}
                >
                    <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <h2 className="text-lg font-semibold truncate max-w-[140px] xs:max-w-none">
                            {t('dailyTasks.completedToday')}
                        </h2>
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                            {completedTasks.length}
                        </Badge>
                    </div>
                    
                    <div className="flex items-center gap-1">
                        
                        <div className="w-[1px] h-4 bg-border mx-1 hidden sm:block"></div>

                        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 rounded-full">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <ScrollArea 
                    className="flex-1"
                    style={{
                        paddingTop: '1rem',
                        paddingBottom: '1rem',
                        paddingInlineStart: 'calc(1rem + env(safe-area-inset-left))',
                        paddingInlineEnd: 'calc(1rem + env(safe-area-inset-right))'
                    }}
                >
                    {completedTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center p-8">
                            <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold mb-2">
                                {t('dailyTasks.noCompletedTasks')}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {t('dailyTasks.noCompletedTasksDescription')}
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
                                            const sortedTasks = [...tasks].sort((a, b) => a.completionTime - b.completionTime);
                                            const latestTask = sortedTasks[sortedTasks.length - 1];

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
                                                                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground ltr:rotate-0 rtl:rotate-180" />
                                                            )}
                                                            <span className="font-semibold text-sm truncate">{accountName}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 ltr:ml-2 rtl:mr-2">
                                                            {!isExpanded && (
                                                                <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                                                    {Math.round(latestTask.timeSpent)}s
                                                                </span>
                                                            )}
                                                            <Badge variant="secondary" className="text-[10px] px-1.5">
                                                                {tasks.length}
                                                            </Badge>
                                                        </div>
                                                    </div>

                                                    {isExpanded && (
                                                        <CardContent className="p-3 pt-0 space-y-2 border-t bg-muted/10">
                                                            {sortedTasks.map((task) => (
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
                                                                                className={cn("text-[10px] h-4 px-1.5", getRequestTypeTone(task))}
                                                                            >
                                                                                {getRequestTypeLabel(task)}
                                                                            </Badge>
                                                                            {task.requestType && (
                                                                                <span className="text-[10px] text-muted-foreground">
                                                                                    {task.requestType}
                                                                                </span>
                                                                            )}
                                                                            {task.eventToken && (
                                                                                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[120px]">
                                                                                    {task.eventToken}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-[10px] font-medium text-muted-foreground">
                                                                            {Math.round(task.timeSpent)}s
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

                {/* Footer removed to save vertical space. Actions moved to the Responsive Header. */}
            </div>
        </div>
    );
}
