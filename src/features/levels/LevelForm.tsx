// src/features/levels/LevelForm.tsx

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLevels } from '../../hooks/useLevels';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { ArrowLeft } from 'lucide-react';
import { Level } from '../../types';
import { toast } from 'sonner';

interface LevelFormProps {
  level?: Level | null;
  gameId?: number;
  onClose: () => void;
}

export function LevelForm({ level, gameId, onClose }: LevelFormProps) {
  const { t } = useTranslation();
  const { addLevel, updateLevel } = useLevels();
  const [eventToken, setEventToken] = useState(level?.event_token || '');
  const [levelName, setLevelName] = useState(level?.level_name || '');
  const [daysOffset, setDaysOffset] = useState(level?.days_offset?.toString() || '0');
  const [timeSpent, setTimeSpent] = useState(level?.time_spent?.toString() || '0');
  const [isBonus, setIsBonus] = useState<boolean>(!!level?.is_bonus);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!eventToken.trim() || !levelName.trim()) {
      toast.error(t('levels.errors.emptyFields') ?? 'Event token and level name cannot be empty');
      return;
    }

    if (isNaN(Number(daysOffset)) || isNaN(Number(timeSpent))) {
      toast.error(t('levels.errors.invalidNumbers') ?? 'Days offset and time spent must be numbers');
      return;
    }

    setLoading(true);
    try {
      if (level) {
        await updateLevel({
          id: level.id,
          event_token: eventToken,
          level_name: levelName,
          days_offset: Number(daysOffset),
          time_spent: Number(timeSpent),
          is_bonus: isBonus,
        });
      } else {
        await addLevel({
          game_id: gameId!,
          event_token: eventToken,
          level_name: levelName,
          days_offset: Number(daysOffset),
          time_spent: Number(timeSpent),
          is_bonus: isBonus,
        });
      }
      onClose();
    } catch (error) {
      console.error('Failed to save level:', error);
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
            {level ? t('levels.editLevel') : t('levels.addLevel')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="eventToken">{t('levels.eventToken')}</Label>
                <Input
                  id="eventToken"
                  value={eventToken}
                  onChange={e => setEventToken(e.target.value)}
                  placeholder={t('levels.eventTokenPlaceholder')}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="levelName">{t('levels.levelName')}</Label>
                <Input
                  id="levelName"
                  value={levelName}
                  onChange={e => setLevelName(e.target.value)}
                  placeholder={t('levels.levelNamePlaceholder')}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="daysOffset">{t('levels.daysOffset')}</Label>
                <Input
                  id="daysOffset"
                  type="number"
                  value={daysOffset}
                  onChange={e => setDaysOffset(e.target.value)}
                  placeholder={t('levels.daysOffsetPlaceholder')}
                  required
                  min="0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeSpent">{t('levels.timeSpent')}</Label>
                <Input
                  id="timeSpent"
                  type="number"
                  value={timeSpent}
                  onChange={e => setTimeSpent(e.target.value)}
                  placeholder={t('levels.timeSpentPlaceholder')}
                  required
                  min="0"
                />
              </div>
            </div>

            {/* Bonus checkbox */}
            <div className="flex items-center gap-2">
              <input
                id="isBonus"
                type="checkbox"
                checked={isBonus}
                onChange={(e) => setIsBonus(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="isBonus" className="mb-0">{t('levels.isBonus') ?? 'Bonus level'}</Label>
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
