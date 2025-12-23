import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import type { Level } from '../../types';
import { useProgress } from '../../hooks/useProgress';
import { useTranslation } from 'react-i18next';

interface Props {
  accountId: number;
  levels: Level[];
}

export function AccountLevelProgressList({ accountId, levels }: Props) {
  const { t } = useTranslation();
  const { levelsProgress, createOrEnsureLevelProgress, updateLevelProgress, loading } = useProgress(accountId);

  const progressMap = new Map(levelsProgress.map(p => [p.level_id, p]));

  const toggleComplete = async (levelId: number, currentCompleted: boolean) => {
    await createOrEnsureLevelProgress({ account_id: accountId, level_id: levelId });
    await updateLevelProgress({ account_id: accountId, level_id: levelId, is_completed: !currentCompleted });
  };

  return (
    <div>
      <h4 className="text-lg font-medium mb-2">{t('progress.levelsTitle') ?? 'Level Progress'}</h4>
      {loading ? <div>{t('common.loading')}</div> : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event Token</TableHead>
              <TableHead>Level Name</TableHead>
              <TableHead>Days Offset</TableHead>
              <TableHead>Time Spent</TableHead>
              <TableHead className="text-center">Completed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {levels.map(l => {
              const p = progressMap.get(l.id);
              const completed = !!p?.is_completed;
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-mono">{l.event_token}</TableCell>
                  <TableCell>{l.level_name}</TableCell>
                  <TableCell>{l.days_offset}</TableCell>
                  <TableCell>{l.time_spent}</TableCell>
                  <TableCell className="text-center">
                    <input
                      type="checkbox"
                      checked={completed}
                      onChange={() => toggleComplete(l.id, completed)}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

