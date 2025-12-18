// src/features/levels/LevelList.tsx

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useGames } from '../../hooks/useGames';
import { useLevels } from '../../hooks/useLevels';
import { Button } from '../../components/ui/button';
import { Card, CardContent, } from '../../components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { LevelForm } from './LevelForm';
import { Level } from '../../types';

export function LevelList() {
  const { t } = useTranslation();
  const { games } = useGames();
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();
  const { levels, loading, deleteLevel } = useLevels(selectedGameId);
  const [showForm, setShowForm] = useState(false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [deletingLevel, setDeletingLevel] = useState<Level | null>(null);

  useEffect(() => {
    if (games.length > 0 && !selectedGameId) {
      setSelectedGameId(games[0].id);
    }
  }, [games]);

  const handleEdit = (level: Level) => {
    setEditingLevel(level);
    setShowForm(true);
  };

  const handleDelete = async () => {
    if (deletingLevel) {
      await deleteLevel(deletingLevel.id);
      setDeletingLevel(null);
    }
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingLevel(null);
  };

  if (showForm) {
    return (
      <LevelForm
        level={editingLevel}
        gameId={selectedGameId}
        onClose={handleCloseForm}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-2xl font-bold">{t('levels.title')}</h3>
        <div className="flex items-center gap-2">
          <Select
            value={selectedGameId?.toString()}
            onValueChange={val => setSelectedGameId(Number(val))}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t('accounts.selectGame')} />
            </SelectTrigger>
            <SelectContent>
              {games.map(game => (
                <SelectItem key={game.id} value={game.id.toString()}>
                  {game.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setShowForm(true)} disabled={!selectedGameId}>
            <Plus className="mr-2 h-4 w-4" />
            {t('levels.addLevel')}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">{t('common.loading')}</div>
      ) : !selectedGameId ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('games.noGames')}
          </CardContent>
        </Card>
      ) : levels.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('levels.noLevels')}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('levels.eventToken')}</TableHead>
                  <TableHead>{t('levels.levelName')}</TableHead>
                  <TableHead>{t('levels.daysOffset')}</TableHead>
                  <TableHead>{t('levels.timeSpent')}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {levels.map(level => (
                  <TableRow key={level.id}>
                    <TableCell className="font-mono">{level.event_token}</TableCell>
                    <TableCell>{level.level_name}</TableCell>
                    <TableCell>{level.days_offset}</TableCell>
                    <TableCell>{level.time_spent}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(level)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingLevel(level)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!deletingLevel}
        onOpenChange={() => setDeletingLevel(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('levels.deleteLevel')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('levels.deleteConfirm')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}