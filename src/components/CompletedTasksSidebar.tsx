// src/components/CompletedTasksSidebar.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle, Clock, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
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
    const [expandedGames, setExpandedGames] = useState<Set<number>>(new Set());

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

                // Auto-expand all games by default
                const gameIds = new Set(tasks.map(t => t.gameId));
                setExpandedGames(gameIds);
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
    };

    const toggleGameExpanded = (gameId: number) => {
        setExpandedGames(prev => {
            const newSet = new Set(prev);
            if (newSet.has(gameId)) {
                newSet.delete(gameId);
            } else {
                newSet.add(gameId);
            }
            return newSet;
        });
    };

    // Group tasks by game, then by eventToken within each game
    const tasksByGame = completedTasks.reduce((acc, task) => {
        if (!acc[task.gameId]) {
            acc[task.gameId] = {
                gameName: task.gameName,
                eventTokens: {}
            };
        }

        const eventToken = task.eventToken || 'No Token';
        if (!acc[task.gameId].eventTokens[eventToken]) {
            acc[task.gameId].eventTokens[eventToken] = [];
        }

        acc[task.gameId].eventTokens[eventToken].push(task);
        return acc;
    }, {} as Record<number, { gameName: string; eventTokens: Record<string, CompletedDailyTask[]> }>);

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
                        <div className="space-y-4">
                            {Object.entries(tasksByGame).map(([gameId, { gameName, eventTokens }]) => {
                                const totalTasks = Object.values(eventTokens).reduce((sum, tasks) => sum + tasks.length, 0);
                                return (
                                    <Card key={gameId}>
                                        <CardHeader
                                            className="cursor-pointer hover:bg-accent/50 transition-colors p-3"
                                            onClick={() => toggleGameExpanded(Number(gameId))}
                                        >
                                            <div className="flex items-center justify-between">
                                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                                    {expandedGames.has(Number(gameId)) ? (
                                                        <ChevronDown className="h-4 w-4" />
                                                    ) : (
                                                        <ChevronRight className="h-4 w-4" />
                                                    )}
                                                    {gameName}
                                                </CardTitle>
                                                <Badge variant="outline" className="text-xs">
                                                    {totalTasks}
                                                </Badge>
                                            </div>
                                        </CardHeader>

                                        {expandedGames.has(Number(gameId)) && (
                                            <CardContent className="p-3 pt-0 space-y-3">
                                                {Object.entries(eventTokens).map(([eventToken, tasks]) => (
                                                    <div key={eventToken} className="space-y-2">
                                                        <div className="flex items-center gap-2 px-2">
                                                            <Badge variant="secondary" className="text-xs font-medium">
                                                                Event Token: {eventToken}
                                                            </Badge>
                                                            <Badge variant="outline" className="text-xs">
                                                                {tasks.length}
                                                            </Badge>
                                                        </div>
                                                        <div className="space-y-1 ml-4">
                                                            {tasks.map((task) => (
                                                                <div
                                                                    key={task.id}
                                                                    className="border rounded-lg p-3 bg-muted/30 space-y-1"
                                                                >
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="font-medium text-sm">{task.accountName}</span>
                                                                            <Badge
                                                                                variant={task.requestType === 'session' ? 'default' : 'secondary'}
                                                                                className="text-xs"
                                                                            >
                                                                                {task.requestType === 'session' ? 'Session' :
                                                                                 task.requestType === 'event' ? 'Event' :
                                                                                 task.requestType === 'purchase_event' ? 'Purchase' : 'Unknown'}
                                                                            </Badge>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                                                        <span className="flex items-center gap-1">
                                                                            <Clock className="h-3 w-3" />
                                                                            {formatTime(task.completionTime)}
                                                                        </span>
                                                                        <span>{task.timeSpent}s</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </CardContent>
                                        )}
                                    </Card>
                                );
                            })}
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
