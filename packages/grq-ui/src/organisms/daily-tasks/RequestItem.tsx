import React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@grq/ui/lib/utils';
import { CheckCircle, Copy, Hash, Clock, ShieldCheck } from 'lucide-react';
import { Button } from '@grq/ui/atoms/button';
import { Badge } from '@grq/ui/atoms/badge';
import { RequestProcessor } from '@grq/core/services/tauri.service';
import type { DailyRequestsResponse } from '@grq/api-bindings';

interface RequestItemProps {
    request: DailyRequestsResponse['requests'][0];
    isCompleted: boolean;
    isReady: boolean;
    onComplete: () => void;
    onCopy: (content: string, eventToken?: string, timeSpent?: number) => void;
    index: number;
    total: number;
}

export const RequestItem = React.memo(({ request, isCompleted, isReady, onComplete, onCopy, index, total }: RequestItemProps) => {
    const { t } = useTranslation();

    const getRequestTypeLabel = (type: string) => {
        if (type.includes('Session')) return t('requests.session');
        if (type.includes('Event')) return t('requests.event');
        switch (type) {
            case 'session': return t('requests.session');
            case 'event': return t('requests.event');
            case 'purchase_event': return t('requests.purchaseEvent');
            default: return type;
        }
    };

    const getRequestTypeBadgeVariant = (type: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
        if (type.includes('Session')) return 'default';
        if (type.includes('Event')) return 'secondary';
        switch (type) {
            case 'session': return 'default';
            case 'event': return 'secondary';
            case 'purchase_event': return 'outline';
            default: return 'default';
        }
    };

    return (
        <div className={cn(
            "border rounded-xl p-3 sm:p-4 transition-all duration-300",
            !isReady ? "bg-gray-100/50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 opacity-60 grayscale-[0.5]" : "bg-card border-border shadow-sm"
        )}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/5 border border-primary/20 rounded-lg shadow-sm" title="Account Task Order">
                        <Hash className="h-3 w-3 text-primary" />
                        <span className="text-xs font-black tracking-tight text-primary">
                            {t('dailyTasks.taskLabel', { index })} <span className="opacity-40 font-medium">/{total}</span>
                        </span>
                    </div>

                    <Badge variant={getRequestTypeBadgeVariant(request.request_type)} className="shadow-sm">
                        <ShieldCheck className="h-3 w-3 ltr:mr-1 rtl:ml-1 opacity-70" />
                        {getRequestTypeLabel(request.request_type)}
                    </Badge>

                    {request.event_token && (
                        <div className="group flex items-center gap-2 text-[10px] sm:text-xs text-muted-foreground font-mono bg-accent/30 hover:bg-accent/50 px-2 py-1 rounded-lg border border-border/40 transition-colors cursor-help" title="Event Token">
                            <span className="opacity-40">ETC:</span>
                            <span className="break-all">{request.event_token}</span>
                        </div>
                    )}

                    <div className="flex items-center gap-1.5 px-2 py-1 bg-secondary/30 border border-secondary/20 rounded-lg text-xs font-mono text-muted-foreground shadow-sm">
                        <Clock className="h-3 w-3 opacity-60" />
                        <span>{request.time_spent}s</span>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!isReady}
                        onClick={() => isReady && onCopy(request.content, request.event_token, request.time_spent)}
                        className={cn(
                            "flex-1 sm:flex-none",
                            !isReady ? "opacity-30 cursor-not-allowed grayscale" : "hover:bg-primary hover:text-primary-foreground transition-colors"
                        )}
                    >
                        <Copy className="h-4 w-4 ltr:mr-1 rtl:ml-1" />
                        {t('common.copy')}
                    </Button>

                    {!isCompleted && (
                        <Button
                            variant="secondary"
                            size="sm"
                            disabled={!isReady}
                            onClick={() => isReady && onComplete()}
                            className={cn(
                                "flex-1 sm:flex-none",
                                !isReady ? "opacity-30 cursor-not-allowed grayscale" : "transition-all active:scale-95"
                            )}
                        >
                            <CheckCircle className="h-4 w-4 ltr:mr-1 rtl:ml-1" />
                            {t('dailyTasks.markComplete', 'Done')}
                        </Button>
                    )}

                    {isCompleted && (
                        <Badge variant="default" className="bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-500/20 px-3 py-1">
                            <CheckCircle className="h-4 w-4 ltr:mr-1.5 rtl:ml-1.5" />
                            {t('dailyTasks.completed')}
                        </Badge>
                    )}
                </div>
            </div>

            <div className="bg-muted/80 backdrop-blur-sm p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-40 overflow-y-auto border border-border/50">
                {RequestProcessor.processRequestContent(request.content, request.event_token || '', request.time_spent).split('\n').map((line, i) => (
                    <div key={i} className="whitespace-pre">
                        {line || ' '}
                    </div>
                ))}
            </div>

        </div>
    );
});
