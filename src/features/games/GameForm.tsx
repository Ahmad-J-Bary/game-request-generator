// src/features/games/GameForm.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGames } from '../../hooks/useGames';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Game } from '../../types';

interface GameFormProps {
  game?: Game | null;
  onClose: () => void;
}

export function GameForm({ game, onClose }: GameFormProps) {
  const { t } = useTranslation();
  const { addGame, updateGame } = useGames();
  const [name, setName] = useState(game?.name || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const success = game
      ? await updateGame({ id: game.id, name })
      : await addGame({ name });

    setLoading(false);
    if (success) {
      onClose();
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
            {game ? t('games.editGame') : t('games.addGame')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('games.gameName')}</Label>
              <Input
                id="name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder={t('games.gameNamePlaceholder')}
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