import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLevels } from '../../hooks/useLevels';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { GameSelector } from '../../components/molecules/GameSelector';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
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
import { useColorClass } from '../../contexts/SettingsContext';

export default function LevelListPage() {
  const { t } = useTranslation();
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();
  const [layout, setLayout] = useState<Layout>('vertical');
  const { levels = [], loading, deleteLevel } = useLevels(selectedGameId);
  const [showForm, setShowForm] = useState(false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [deletingLevel, setDeletingLevel] = useState<Level | null>(null);
  const getColorClass = useColorClass();

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
          <GameSelector selectedGameId={selectedGameId} onGameChange={setSelectedGameId} />
          <LayoutToggle layout={layout} onLayoutChange={setLayout} />
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
      ) : layout === 'horizontal' ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('levels.eventToken')}</TableHead>
                  <TableHead>{t('levels.levelName')}</TableHead>
                  <TableHead>{t('levels.daysOffset')}</TableHead>
                  <TableHead>{t('levels.timeSpent')}</TableHead>
                  <TableHead>{t('levels.isBonus') ?? 'Bonus'}</TableHead>
                  <TableHead className="text-right">{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {levels.map((level) => {
                  const rowColor = getColorClass('level', level.is_bonus);
                  return (
                    <TableRow key={level.id}>
                      <TableCell className={`font-mono ${rowColor}`}>{level.event_token}</TableCell>
                      <TableCell className={rowColor}>{level.level_name}</TableCell>
                      <TableCell className={`text-center ${rowColor}`}>{level.days_offset}</TableCell>
                      <TableCell className={`text-center ${rowColor}`}>{level.time_spent}</TableCell>
                      <TableCell className={`text-center ${rowColor}`}>
                        {level.is_bonus ? (t('levels.bonusYes') ?? 'Yes') : (t('levels.bonusNo') ?? 'No')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(level)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setDeletingLevel(level)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('levels.eventToken')}</TableHead>
                  {levels.map((level) => (
                    <TableHead
                      key={level.id}
                      className={`text-center font-mono ${getColorClass('level', level.is_bonus)}`}
                    >
                      {level.event_token}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              <TableBody>
                <TableRow>
                  <TableHead>{t('levels.levelName')}</TableHead>
                  {levels.map((level) => {
                    const cellColor = getColorClass('level', level.is_bonus);
                    return (
                      <TableCell
                        key={level.id}
                        className={`text-center ${cellColor}`}
                      >
                        {level.level_name}
                      </TableCell>
                    );
                  })}
                </TableRow>

                <TableRow>
                  <TableHead>{t('levels.daysOffset')}</TableHead>
                  {levels.map((level) => {
                    const cellColor = getColorClass('level', level.is_bonus);
                    return (
                      <TableCell
                        key={level.id}
                        className={`text-center ${cellColor}`}
                      >
                        {level.days_offset}
                      </TableCell>
                    );
                  })}
                </TableRow>

                <TableRow>
                  <TableHead>{t('levels.timeSpent')}</TableHead>
                  {levels.map((level) => {
                    const cellColor = getColorClass('level', level.is_bonus);
                    return (
                      <TableCell
                        key={level.id}
                        className={`text-center ${cellColor}`}
                      >
                        {level.time_spent}
                      </TableCell>
                    );
                  })}
                </TableRow>

                <TableRow>
                  <TableHead>{t('levels.isBonus') ?? 'Bonus'}</TableHead>
                  {levels.map((level) => {
                    const cellColor = getColorClass('level', level.is_bonus);
                    return (
                      <TableCell
                        key={level.id}
                        className={`text-center ${cellColor}`}
                      >
                        {level.is_bonus ? (t('levels.bonusYes') ?? 'Yes') : (t('levels.bonusNo') ?? 'No')}
                      </TableCell>
                    );
                  })}
                </TableRow>

                <TableRow>
                  <TableHead>{t('common.actions')}</TableHead>
                  {levels.map((level) => (
                    <TableCell key={level.id} className="text-center">
                      <div className="flex justify-center gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(level)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeletingLevel(level)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  ))}
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!deletingLevel} onOpenChange={() => setDeletingLevel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('levels.deleteLevel')}</AlertDialogTitle>
            <AlertDialogDescription>{t('levels.deleteConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
