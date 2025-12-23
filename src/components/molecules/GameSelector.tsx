import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { useGames } from '../../hooks/useGames';

interface GameSelectorProps {
  selectedGameId?: number;
  onGameChange: (gameId: number) => void;
  className?: string;
}

export function GameSelector({ selectedGameId, onGameChange, className }: GameSelectorProps) {
  const { t } = useTranslation();
  const { games } = useGames();
  const [internalGameId, setInternalGameId] = useState<number | undefined>(selectedGameId);

  useEffect(() => {
    if (games.length > 0 && !internalGameId) {
      const firstGameId = games[0].id;
      setInternalGameId(firstGameId);
      onGameChange(firstGameId);
    }
  }, [games, internalGameId, onGameChange]);

  useEffect(() => {
    setInternalGameId(selectedGameId);
  }, [selectedGameId]);

  if (games.length === 0) {
    return null;
  }

  return (
    <Select
      value={internalGameId?.toString()}
      onValueChange={(val) => {
        const gameId = Number(val);
        setInternalGameId(gameId);
        onGameChange(gameId);
      }}
    >
      <SelectTrigger className={className || 'w-[200px]'}>
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
  );
}

