// src/pages/accounts/AccountFormPage.tsx

import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAccounts } from '../../hooks/useAccounts';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { BackButton } from '../../components/molecules/BackButton';
import { CreateAccountRequest, UpdateAccountRequest } from '../../types';
import { toast } from 'sonner';

export default function AccountFormPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const gameId = searchParams.get('gameId') ? parseInt(searchParams.get('gameId')!, 10) : undefined;
  const { accounts, addAccount, updateAccount } = useAccounts();
  
  const stateAccount = (location.state as any)?.account;
  const isEditMode = location.pathname.includes('/edit/');
  const accountId = id ? parseInt(id, 10) : undefined;
  const account = isEditMode && accountId ? (stateAccount || accounts.find(a => a.id === accountId)) : undefined;

  const [name, setName] = useState(account?.name || '');
  const [startDate, setStartDate] = useState(account?.start_date || '');
  const [startTime, setStartTime] = useState(account?.start_time || '');
  const [requestTemplate, setRequestTemplate] = useState(account?.request_template || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (account) {
      setName(account.name);
      setStartDate(account.start_date);
      setStartTime(account.start_time);
      setRequestTemplate(account.request_template);
    }
  }, [account]);
  
  useEffect(() => {
    if (!account && accountId) {
      const foundAccount = accounts.find(a => a.id === accountId);
      if (foundAccount) {
        setName(foundAccount.name);
        setStartDate(foundAccount.start_date);
        setStartTime(foundAccount.start_time);
        setRequestTemplate(foundAccount.request_template);
      }
    }
  }, [accountId, account, accounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const currentGameId = account ? account.game_id : gameId;
    if (!currentGameId || !name.trim() || !startDate.trim() || !startTime.trim() || !requestTemplate.trim()) {
        toast.error("All fields are required");
        return;
    }

    setLoading(true);
    try {
        if (account) {
            const request: UpdateAccountRequest = {
                id: account.id,
                name,
                start_date: startDate,
                start_time: startTime,
                request_template: requestTemplate,
            };
            await updateAccount(request);
        } else {
            const request: CreateAccountRequest = {
                game_id: currentGameId,
                name,
                start_date: startDate,
                start_time: startTime,
                request_template: requestTemplate,
            };
            await addAccount(request);
        }
        navigate('/accounts');
    } catch (error) {
        console.error('Failed to save account:', error);
        toast.error("An error occurred while saving the account");
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <BackButton />

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
              <Button type="button" variant="outline" onClick={() => navigate('/accounts')}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
