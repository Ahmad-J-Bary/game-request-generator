// apps/desktop-mobile/src/pages/daily-tasks/HistoryReportPage.tsx
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TauriService } from '@grq/core/services/tauri.service';
import { CompletedDailyTask } from '@grq/api-bindings';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@grq/ui/atoms/card';
import { Input } from '@grq/ui/atoms/input';
import { Button } from '@grq/ui/atoms/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@grq/ui/atoms/table';
import { Badge } from '@grq/ui/atoms/badge';
import { Search, Calendar, Clock, HardDrive, User, Gamepad2 } from 'lucide-react';
import { NotificationService } from '@grq/core/utils/notifications';

const HistoryReportPage = () => {
    const { t } = useTranslation();
    const [history, setHistory] = useState<CompletedDailyTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchHistory = async () => {
        try {
            setLoading(true);
            const data = await TauriService.getTaskHistory(500); // Load last 500 for the report
            setHistory(data);
        } catch (error) {
            console.error('Failed to fetch history:', error);
            NotificationService.error('Failed to load history');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
        const handler = () => { fetchHistory(); };
        window.addEventListener('daily-task-completed', handler);
        return () => window.removeEventListener('daily-task-completed', handler);
    }, []);

    const filteredHistory = history.filter(item => 
        item.accountName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.gameName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.eventToken.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.requestType.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const formatTimestamp = (ts?: string) => {
        if (!ts) return '-';
        try {
            const date = new Date(ts);
            return date.toLocaleString();
        } catch {
            return ts;
        }
    };

    const getRequestTypeBadge = (type: string) => {
        const type_lower = type.toLowerCase();
        if (type_lower.includes('purchase')) return <Badge variant="warning">{type}</Badge>;
        if (type_lower.includes('event')) return <Badge variant="default">{type}</Badge>;
        return <Badge variant="secondary">{type}</Badge>;
    };

    return (
        <div className="container mx-auto p-6 space-y-6">
            <Card className="border-none shadow-xl bg-gradient-to-br from-background/50 to-background/30 backdrop-blur-md border border-white/10">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="space-y-1">
                        <CardTitle className="text-2xl font-bold flex items-center gap-2">
                            <Clock className="w-6 h-6 text-primary" />
                            {t('dailyTasks.historyReport', 'Daily Task History Report')}
                        </CardTitle>
                        <CardDescription>
                            {t('dailyTasks.historyDescription', 'Track every session and event completion with full details and timestamps.')}
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={fetchHistory} disabled={loading}>
                            <Calendar className="w-4 h-4 mr-2" />
                            {t('common.refresh', 'Refresh')}
                        </Button>

                    </div>
                </CardHeader>
                <CardContent>
                    <div className="relative mb-6">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input 
                            placeholder={t('common.search', 'Search by account, game, or token...')} 
                            className="pl-10"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div className="rounded-md border border-white/5 overflow-hidden">
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow>
                                    <TableHead><Clock className="w-4 h-4 mr-1 inline" /> {t('history.timestamp', 'Completed At')}</TableHead>
                                    <TableHead><User className="w-4 h-4 mr-1 inline" /> {t('history.account', 'Account')}</TableHead>
                                    <TableHead><Gamepad2 className="w-4 h-4 mr-1 inline" /> {t('history.game', 'Game')}</TableHead>
                                    <TableHead><HardDrive className="w-4 h-4 mr-1 inline" /> {t('history.task', 'Task Detail')}</TableHead>
                                    <TableHead>{t('history.type', 'Type')}</TableHead>
                                    <TableHead className="text-right">{t('history.duration', 'Dur. (ms)')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                            {t('common.loading', 'Loading data...')}
                                        </TableCell>
                                    </TableRow>
                                ) : filteredHistory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                                            {t('common.noData', 'No history records found')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredHistory.map((item) => (
                                        <TableRow key={item.id} className="hover:bg-primary/5 transition-colors">
                                            <TableCell className="font-mono text-xs opacity-80">
                                                {formatTimestamp(item.completedAt)}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {item.accountName}
                                            </TableCell>
                                            <TableCell className="text-xs">
                                                {item.gameName}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-semibold truncate max-w-[200px]" title={item.eventToken}>
                                                        {item.eventToken}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {item.levelName || '-'}
                                                    </span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {getRequestTypeBadge(item.requestType)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-sm">
                                                {item.timeSpent.toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

export default HistoryReportPage;
