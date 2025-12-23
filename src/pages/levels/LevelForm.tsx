import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLevels } from '../../hooks/useLevels';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Level, CreateLevelRequest, UpdateLevelRequest } from '../../types';

interface LevelFormProps {
  level?: Level | null;
  gameId?: number;
  onClose: () => void;
}

export function LevelForm({ level, gameId, onClose }: LevelFormProps) {
  const { t } = useTranslation();
  const { addLevel, updateLevel } = useLevels(gameId);
  const [eventToken, setEventToken] = useState(level?.event_token || '');
  const [levelName, setLevelName] = useState(level?.level_name || '');
  const [daysOffset, setDaysOffset] = useState(level?.days_offset?.toString() || '');
  const [timeSpent, setTimeSpent] = useState(level?.time_spent?.toString() || '');
  const [isBonus, setIsBonus] = useState(level?.is_bonus || false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (level) {
      setEventToken(level.event_token);
      setLevelName(level.level_name);
      setDaysOffset(level.days_offset.toString());
      setTimeSpent(level.time_spent.toString());
      setIsBonus(level.is_bonus);
    }
  }, [level]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventToken.trim() || !levelName.trim()) {
      return;
    }

    const daysOffsetNum = parseInt(daysOffset, 10);
    const timeSpentNum = parseInt(timeSpent, 10);

    if (isNaN(daysOffsetNum) || isNaN(timeSpentNum)) {
      return;
    }

    setLoading(true);
    try {
      if (level && gameId) {
        const request: UpdateLevelRequest = {
          id: level.id,
          event_token: eventToken,
          level_name: levelName,
          days_offset: daysOffsetNum,
          time_spent: timeSpentNum,
          is_bonus: isBonus,
        };
        await updateLevel(request);
      } else if (gameId) {
        const request: CreateLevelRequest = {
          game_id: gameId,
          event_token: eventToken,
          level_name: levelName,
          days_offset: daysOffsetNum,
          time_spent: timeSpentNum,
          is_bonus: isBonus,
        };
        await addLevel(request);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save level', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{level ? t('levels.editLevel') : t('levels.addLevel')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="eventToken">{t('levels.eventToken')}</Label>
              <Input
                id="eventToken"
                value={eventToken}
                onChange={(e) => setEventToken(e.target.value)}
                placeholder={t('levels.eventTokenPlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="levelName">{t('levels.levelName')}</Label>
              <Input
                id="levelName"
                value={levelName}
                onChange={(e) => setLevelName(e.target.value)}
                placeholder={t('levels.levelNamePlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="daysOffset">{t('levels.daysOffset')}</Label>
              <Input
                id="daysOffset"
                type="number"
                value={daysOffset}
                onChange={(e) => setDaysOffset(e.target.value)}
                placeholder={t('levels.daysOffsetPlaceholder')}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timeSpent">{t('levels.timeSpent')}</Label>
              <Input
                id="timeSpent"
                type="number"
                value={timeSpent}
                onChange={(e) => setTimeSpent(e.target.value)}
                placeholder={t('levels.timeSpentPlaceholder')}
                required
              />
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="isBonus"
                checked={isBonus}
                onChange={(e) => setIsBonus(e.target.checked)}
                className="rounded border-gray-300"
              />
              <Label htmlFor="isBonus">{t('levels.isBonus')}</Label>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={loading || !eventToken.trim() || !levelName.trim()}>
                {level ? t('common.update') : t('common.add')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

