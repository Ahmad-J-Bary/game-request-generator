import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { RequestGenerator } from '../features/requests/RequestGenerator';
import { useGames } from '../hooks/useGames';
import { useAccounts } from '../hooks/useAccounts';

export default function Requests() {
  const { t } = useTranslation();
  const { games, loading: gamesLoading } = useGames();
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null);
  const { accounts, loading: accountsLoading } = useAccounts(selectedGameId || undefined);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);

  useEffect(() => {
    if (games.length > 0 && !selectedGameId) {
      setSelectedGameId(games[0].id);
    }
  }, [games]);

  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts]);

  const selectedAccount = accounts.find(acc => acc.id === selectedAccountId);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{t('requests.title')}</h1>
        <p className="text-muted-foreground">{t('requests.generateRequest')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('requests.selectAccount')}</CardTitle>
          <CardDescription>{t('accounts.selectAccount')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('games.selectGame')}</label>
              <Select
                value={selectedGameId?.toString()}
                onValueChange={(value) => {
                  setSelectedGameId(parseInt(value));
                  setSelectedAccountId(null);
                }}
                disabled={gamesLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('games.selectGame')} />
                </SelectTrigger>
                <SelectContent>
                  {games.map((game) => (
                    <SelectItem key={game.id} value={game.id.toString()}>
                      {game.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{t('accounts.selectAccount')}</label>
              <Select
                value={selectedAccountId?.toString()}
                onValueChange={(value) => setSelectedAccountId(parseInt(value))}
                disabled={accountsLoading || !selectedGameId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('accounts.selectAccount')} />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedAccountId && selectedAccount && (
        <RequestGenerator 
          accountId={selectedAccountId} 
          accountName={selectedAccount.name}
        />
      )}
    </div>
  );
}