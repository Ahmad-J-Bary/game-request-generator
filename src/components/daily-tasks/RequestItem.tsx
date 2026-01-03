import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { CheckCircle, Copy } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { RequestProcessor } from '../../services/tauri.service';
import type { DailyRequestsResponse } from '../../types';

interface RequestItemProps {
    request: DailyRequestsResponse['requests'][0];
    isCompleted: boolean;
    isReady: boolean;
    onComplete: () => void;
    onCopy: (content: string, eventToken?: string, timeSpent?: number) => void;
}

export function RequestItem({ request, isCompleted, isReady, onComplete, onCopy }: RequestItemProps) {
    const { t } = useTranslation();

    const getRequestTypeLabel = (type: string) => {
        if (type.includes('Session')) return 'Session';
        if (type.includes('Event')) return 'Event';
        
        switch (type) {
            case 'session':
                return 'Session';
            case 'event':
                return 'Event';
            case 'purchase_event':
                return 'Purchase'; // Fallback for existing data if any
            default:
                return type;
        }
    };

    const getRequestTypeBadgeVariant = (type: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
        if (type.includes('Session')) return 'default';
        if (type.includes('Event')) return 'secondary';

        switch (type) {
            case 'session':
                return 'default';
            case 'event':
                return 'secondary';
            case 'purchase_event':
                return 'outline';
            default:
                return 'default';
        }
    };


    return (
        <div className={cn(
            "border rounded-lg p-6 transition-all duration-300",
            !isReady ? "bg-gray-100/50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 opacity-60 grayscale-[0.5]" : "bg-card border-border shadow-sm"
        )}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Badge variant={getRequestTypeBadgeVariant(request.request_type)}>
                        {getRequestTypeLabel(request.request_type)}
                    </Badge>
                    {request.event_token && (
                        <span className="text-xs text-muted-foreground font-mono">
                            {request.event_token}
                        </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                        {request.time_spent}s
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={!isReady}
                        onClick={() => isReady && onCopy(request.content, request.event_token, request.time_spent)}
                        className={!isReady ? "opacity-30 cursor-not-allowed grayscale" : "hover:bg-primary hover:text-primary-foreground transition-colors"}
                    >
                        <Copy className="h-4 w-4 mr-1" />
                        {t('dailyTasks.copyRequest')}
                    </Button>
                    {!isCompleted && (
                        <Button
                            variant="default"
                            size="sm"
                            disabled={!isReady}
                            onClick={() => isReady && onComplete()}
                            className={!isReady ? "opacity-30 cursor-not-allowed grayscale" : "transition-all active:scale-95"}
                        >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {t('dailyTasks.completeTask')}
                        </Button>
                    )}
                    {isCompleted && (
                        <Badge variant="secondary">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Completed
                        </Badge>
                    )}
                </div>
            </div>

            <div className="bg-muted p-3 rounded text-xs font-mono overflow-x-auto max-h-48 overflow-y-auto">
                {RequestProcessor.processRequestContent(request.content, request.event_token || '', request.time_spent).split('\n').map((line, i) => (
                    <div key={i} className="whitespace-nowrap">
                        {line || <br />}
                    </div>
                ))}
            </div>
        </div>
    );
}
