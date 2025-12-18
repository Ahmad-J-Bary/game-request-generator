import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '../../hooks/useAccounts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Account } from '../../types';
import { toast } from 'sonner';

interface AccountFormProps {
  account?: Account | null;
  gameId?: number;
  onClose: () => void;
}

export function AccountForm({ account, gameId, onClose }: AccountFormProps) {
  const { t } = useTranslation();
  const { addAccount, updateAccount } = useAccounts();
  const [name, setName] = useState(account?.name || '');
  const [startDate, setStartDate] = useState(account?.start_date || '');
  const [startTime, setStartTime] = useState(account?.start_time || '');
  const [requestTemplate, setRequestTemplate] = useState(
    account?.request_template || ''
  );
  const [loading, setLoading] = useState(false);

const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // تحقق من المدخلات
    if (!gameId || !name.trim() || !startDate.trim() || !startTime.trim() || !requestTemplate.trim()) {
        toast.error("All fields are required");
        return;
    }

    setLoading(true);
    try {
        if (account) {
            await updateAccount({
                id: account.id,
                name,
                start_date: startDate,
                start_time: startTime,
                request_template: requestTemplate,
            });
        } else {
            await addAccount({
                game_id: gameId!,
                name,
                start_date: startDate,
                start_time: startTime,
                request_template: requestTemplate,
            });
        }
        onClose();  // Close form after success
    } catch (error) {
        console.error('Failed to save account:', error);
        toast.error("An error occurred while saving the account");
    } finally {
        setLoading(false);
    }
};

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onClose}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('common.back')}
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>
            {account ? t('accounts.editAccount') : t('accounts.addAccount')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('accounts.accountName')}</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('accounts.accountNamePlaceholder')}
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">{t('accounts.startDate')}</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="startTime">{t('accounts.startTime')}</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="template">{t('accounts.requestTemplate')}</Label>
              <Textarea
                id="template"
                value={requestTemplate}
                onChange={e => setRequestTemplate(e.target.value)}
                placeholder={t('accounts.requestTemplatePlaceholder')}
                rows={10}
                className="font-mono text-xs"
                required
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? t('common.loading') : t('common.save')}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}