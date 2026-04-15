import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@grq/ui/lib/utils';
import { CheckCircle, Copy, Send, Loader2, ChevronDown, ChevronUp, Hash, Clock, ShieldCheck } from 'lucide-react';
import { Button } from '@grq/ui/atoms/button';
import { Badge } from '@grq/ui/atoms/badge';
import { RequestProcessor } from '@grq/core/services/tauri.service';
import { invoke } from '@tauri-apps/api/core';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import type { DailyRequestsResponse, RepeaterResponse } from '@grq/api-bindings';

interface RequestItemProps {
    request: DailyRequestsResponse['requests'][0];
    isCompleted: boolean;
    isReady: boolean;
    lastResponse?: RepeaterResponse | null;
    onResponseUpdate: (response: RepeaterResponse) => void;
    onComplete: (response?: RepeaterResponse) => void;
    onCopy: (content: string, eventToken?: string, timeSpent?: number) => void;
    index: number;
    total: number;
}

export const RequestItem = React.memo(({ request, isCompleted, isReady, lastResponse, onResponseUpdate, onComplete, onCopy, index, total }: RequestItemProps) => {
    const { t } = useTranslation();
    const [isSending, setIsSending] = useState(false);
    const [isResponseOpen, setIsResponseOpen] = useState(!!lastResponse);

    // Sync isResponseOpen with lastResponse presence
    useEffect(() => {
        if (lastResponse) {
            setIsResponseOpen(true);
        }
    }, [lastResponse]);

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

    const handleSendRequest = async () => {
        if (!isReady) return;
        setIsSending(true);
        
        try {
            const rawRequestText = RequestProcessor.processRequestContent(request.content, request.event_token || '', request.time_spent);
            const res = await invoke<RepeaterResponse>('send_raw_request', { rawRequest: rawRequestText });
            
            setIsResponseOpen(true);
            onResponseUpdate(res);

            let responseMessage = '';
            try {
                const parsed = JSON.parse(res.body);
                const extractedMsg = parsed.message || parsed.msg || parsed.result || parsed.status || (parsed.error && typeof parsed.error === 'string' ? parsed.error : null);
                if (typeof extractedMsg === 'string') {
                    responseMessage = extractedMsg;
                }
            } catch (_error) {
                responseMessage = '';
            }
            
            if (res.status >= 200 && res.status < 300) {
                toast.success(responseMessage || t('dailyTasks.requestSuccess'));
                onComplete(res);
            } else {
                toast.error(responseMessage || t('dailyTasks.requestStatusError', { status: res.status, text: res.status_text }));
            }
        } catch (error: any) {
            console.error('Failed to send request:', error);
            toast.error(t('dailyTasks.repeaterError', { error }));
        } finally {
            setIsSending(false);
        }
    };

    const formatJsonBody = (body: string) => {
        try {
            const parsed = JSON.parse(body);
            return JSON.stringify(parsed, null, 2);
        } catch {
            return body;
        }
    };

    return (
        <div className={cn(
            "border rounded-xl p-3 sm:p-4 transition-all duration-300",
            !isReady ? "bg-gray-100/50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 opacity-60 grayscale-[0.5]" : "bg-card border-border shadow-sm"
        )}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Index Counter - Large and clear */}
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
                    {!isCompleted && (
                        <Button
                            variant="default"
                            size="sm"
                            disabled={!isReady || isSending}
                            onClick={handleSendRequest}
                            className={cn(
                                "flex-1 sm:flex-none font-bold tracking-tight shadow-md shadow-primary/20",
                                !isReady ? "opacity-30 cursor-not-allowed grayscale" : "transition-all active:scale-95"
                            )}
                        >
                            {isSending ? <Loader2 className="h-4 w-4 ltr:mr-2 rtl:ml-2 animate-spin" /> : <Send className="h-4 w-4 ltr:mr-2 rtl:ml-2" />}
                            {t('dailyTasks.sendRequest', 'Send')}
                        </Button>
                    )}
                    
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

            {/* Response Viewer */}
            <AnimatePresence>
                {lastResponse && (
                    <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-4 overflow-hidden"
                    >
                        <div className="rounded-xl border border-border/50 bg-card overflow-hidden shadow-inner">
                            <div 
                                className="flex items-center justify-between p-3 bg-muted/40 cursor-pointer hover:bg-muted/60 transition-colors"
                                onClick={() => setIsResponseOpen(!isResponseOpen)}
                            >
                                <div className="flex items-center gap-3">
                                    <Badge 
                                        variant="default"
                                        className={cn(
                                            "font-bold font-mono px-2 py-0.5",
                                            lastResponse.status >= 200 && lastResponse.status < 300 ? "bg-emerald-500 hover:bg-emerald-600 dark:text-emerald-950" : 
                                            lastResponse.status >= 400 && lastResponse.status < 500 ? "bg-amber-500 hover:bg-amber-600 dark:text-amber-950" : 
                                            "bg-red-500 hover:bg-red-600 dark:text-red-950"
                                        )}
                                    >
                                        {lastResponse.status} {lastResponse.status_text}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                                        <Loader2 className="h-3 w-3" /> {lastResponse.time_ms}ms
                                    </span>
                                </div>
                                <div>
                                    {isResponseOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                </div>
                            </div>
                            
                            <AnimatePresence>
                                {isResponseOpen && (
                                    <motion.div 
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="p-3 border-t border-border/50 space-y-3"
                                    >
                                        <div className="text-[11px] font-mono bg-background/50 p-2 rounded border border-border/40 max-h-32 overflow-y-auto">
                                            {Object.entries(lastResponse.headers).map(([k, v]) => (
                                                <div key={k}><span className="text-primary/70">{k}:</span> {v}</div>
                                            ))}
                                        </div>
                                        <div className="bg-[#1e1e1e] text-[#d4d4d4] p-3 rounded-lg text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto font-medium shadow-inner">
                                            <pre>
                                                <code>{formatJsonBody(lastResponse.body)}</code>
                                            </pre>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

        </div>
    );
});
