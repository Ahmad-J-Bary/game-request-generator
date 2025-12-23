import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Calendar, Clock, Send } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Badge } from '../../components/ui/badge';
import { Separator } from '../../components/ui/separator';
import { TauriService } from '../../services/tauri.service';
import { toast } from 'sonner';
import type { DailyRequestsResponse } from '../../types';

interface RequestGeneratorProps {
  accountId: number;
  accountName: string;
}

export function RequestGenerator({ accountId, accountName }: RequestGeneratorProps) {
  const { t } = useTranslation();
  const [targetDate, setTargetDate] = useState(new Date().toISOString().split('T')[0]);
  const [response, setResponse] = useState<DailyRequestsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const result = await TauriService.getDailyRequests(accountId, targetDate);
      setResponse(result);
      toast.success(t('requests.generated'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('requests.generateError'));
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
    toast.success(t('requests.copied'));
  };

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'session':
        return t('requests.session');
      case 'event':
        return t('requests.event');
      case 'purchase_event':
        return t('requests.purchaseEvent');
      default:
        return type;
    }
  };

  const getRequestTypeBadgeVariant = (type: string): 'default' | 'secondary' | 'destructive' => {
    switch (type) {
      case 'session':
        return 'default';
      case 'event':
        return 'secondary';
      case 'purchase_event':
        return 'destructive';
      default:
        return 'default';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('requests.generateTitle')}</CardTitle>
          <CardDescription>
            {t('requests.accountName')}: <strong>{accountName}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="target-date">{t('requests.targetDate')}</Label>
            <div className="flex gap-2">
              <Input
                id="target-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleGenerate} disabled={loading}>
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {t('requests.generate')}
                  </>
                )}
              </Button>
            </div>
          </div>

          {response && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>{response.target_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>{response.days_passed} {t('requests.daysPassed')}</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="font-semibold text-lg">
                  {t('requests.dailyRequests')} ({response.requests.length})
                </h3>

                {response.requests.map((request, index) => (
                  <Card key={index} className="border-2">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={getRequestTypeBadgeVariant(request.request_type)}>
                            {getRequestTypeLabel(request.request_type)}
                          </Badge>
                          {request.event_token && (
                            <span className="text-xs text-muted-foreground font-mono">
                              {request.event_token}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(request.content)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>{request.time_spent} {t('common.seconds')}</span>
                          {request.timestamp && (
                            <>
                              <span>•</span>
                              <span>{request.timestamp}</span>
                            </>
                          )}
                        </div>
                        <pre className="p-3 bg-muted rounded text-xs overflow-x-auto">
                          {request.content}
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

