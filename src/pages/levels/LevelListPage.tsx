import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLevels } from '../../hooks/useLevels';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';
import { GameSelector } from '../../components/molecules/GameSelector';
import { LayoutToggle, Layout } from '../../components/molecules/LayoutToggle';
import { LevelDataTable } from '../../components/tables/LevelDataTable';
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
import { Plus } from 'lucide-react';
import { LevelForm } from './LevelForm';
import { Level } from '../../types';

export default function LevelListPage() {
  const { t } = useTranslation();
  const [selectedGameId, setSelectedGameId] = useState<number | undefined>();
  const [layout, setLayout] = useState<Layout>('vertical');
  const { levels = [], loading, deleteLevel } = useLevels(selectedGameId);
  const [showForm, setShowForm] = useState(false);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [deletingLevel, setDeletingLevel] = useState<Level | null>(null);

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
      ) : (
        <Card>
          <CardContent className="p-0">
            <LevelDataTable
              levels={levels}
              layout={layout}
              onEdit={handleEdit}
              onDelete={setDeletingLevel}
            />
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
