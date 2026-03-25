import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useGames } from '@grq/core/hooks/useGames';
import { Button } from '@grq/ui/atoms/button';
import { Card, CardContent, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { Input } from '@grq/ui/atoms/input';
import { Label } from '@grq/ui/atoms/label';
import { Game, CreateGameRequest, UpdateGameRequest } from '@grq/api-bindings';

interface GameFormProps {
  game?: Game | null;
  onClose: () => void;
}

export function GameForm({ game, onClose }: GameFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { addGame, updateGame } = useGames();
  const [name, setName] = useState(game?.name || '');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (game) {
      setName(game.name);
    }
  }, [game]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    try {
      if (game) {
        const request: UpdateGameRequest = { id: game.id, name };
        await updateGame(request);
        window.dispatchEvent(new CustomEvent('data-changed'));
        onClose();
      } else {
        const request: CreateGameRequest = { name };
        const id = await addGame(request);
        if (id) {
            window.dispatchEvent(new CustomEvent('data-changed'));
            onClose();
            navigate(`/games/${id}`);
        }
      }
    } catch (err) {
      console.error('Failed to save game', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{game ? t('games.editGame') : t('games.addGame')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('games.gameName')}</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('games.gameNamePlaceholder')}
                required
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={loading || !name.trim()}>
                {game ? t('common.update') : t('common.add')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

