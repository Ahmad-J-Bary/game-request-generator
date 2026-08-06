import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapPin, Plus, Pencil, Trash2, ChevronUp, ChevronDown, Globe,
  Loader2, X, Users, ArrowUpDown, Snowflake, Shuffle, MoveRight,
} from 'lucide-react';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { Badge } from '@grq/ui/atoms/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@grq/ui/atoms/select';
import { cn } from '@grq/ui/lib/utils';
import { toast } from 'sonner';
import { TauriService } from '@grq/core/services/tauri.service';
import { proxyStateProgressClass } from '@grq/ui/lib/proxy-state-styles';
import type { Account, Region } from '@grq/api-bindings';
import { REGION_PALETTE } from '@grq/api-bindings';

const Swatches = ({
  selected,
  onSelect,
  disabled,
}: {
  selected: string | null;
  onSelect: (color: string) => void;
  disabled?: (string | null | undefined)[];
}) => {
  const { t } = useTranslation();
  const disabledSet = new Set(disabled?.filter(Boolean) as string[]);
  return (
    <div className="flex flex-wrap gap-1.5">
      {REGION_PALETTE.map((key) => {
        const cls = proxyStateProgressClass(key);
        const active = selected === key;
        const isDisabled = disabledSet.has(key);
        return (
          <button
            key={key}
            type="button"
            title={isDisabled ? t('settings.regions.colorUsed') : key}
            onClick={() => onSelect(key)}
            disabled={isDisabled}
            className={cn(
              'h-6 w-6 rounded-full transition-all border-2',
              cls.color,
              isDisabled && 'opacity-30 cursor-not-allowed border-border',
              !isDisabled &&
                (active
                  ? 'ring-2 ring-ring ring-offset-2 ring-offset-background scale-110'
                  : 'border-transparent hover:scale-110'),
            )}
          />
        );
      })}
    </div>
  );
};

export function RegionsSettingsPanel() {
  const { t } = useTranslation();
  const [regions, setRegions] = useState<Region[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Add primary form
  const [newPrimaryName, setNewPrimaryName] = useState('');
  const [newPrimaryEmoji, setNewPrimaryEmoji] = useState('');

  // Add sub-region form
  const [addingSubFor, setAddingSubFor] = useState<number | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [newSubColor, setNewSubColor] = useState<string | null>(null);

  // Edit form
  const [editing, setEditing] = useState<Region | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [editColor, setEditColor] = useState<string | null>(null);

  // Delete with redistribution flow
  const [deleting, setDeleting] = useState<{
    region: Region;
    mode: 'single' | 'rotate';
    targetId: number | null;
  } | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [regs, accs] = await Promise.all([
        TauriService.getRegions(),
        TauriService.getAllAccounts(),
      ]);
      setRegions(regs);
      setAccounts(accs);
    } catch (error) {
      console.error('Failed to load regions:', error);
      toast.error(t('settings.regions.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const primaries = regions.filter((r) => r.is_primary);
  const childrenOf = (pid: number) => regions.filter((r) => r.parent_id === pid);
  const accountCount = (name: string) =>
    accounts.filter((a) => a.proxy_state === name).length;
  const usedColors = (excludeId?: number) =>
    regions.flatMap((r) =>
      r.color && r.id !== excludeId ? [r.color] : [],
    );

  const handleAddPrimary = async () => {
    const name = newPrimaryName.trim();
    if (!name) {
      toast.error(t('settings.regions.nameRequired'));
      return;
    }
    setBusy(true);
    try {
      await TauriService.addRegion({
        name,
        emoji: newPrimaryEmoji.trim() || null,
      });
      toast.success(t('common.success'));
      setNewPrimaryName('');
      setNewPrimaryEmoji('');
      await load();
    } catch (error: unknown) {
      console.error('Add primary failed:', error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleAddSub = async (parentId: number) => {
    const name = newSubName.trim();
    if (!name) {
      toast.error(t('settings.regions.nameRequired'));
      return;
    }
    setBusy(true);
    try {
      await TauriService.addRegion({
        name,
        parent_id: parentId,
        color: newSubColor,
      });
      toast.success(t('common.success'));
      setNewSubName('');
      setNewSubColor(null);
      setAddingSubFor(null);
      await load();
    } catch (error: unknown) {
      console.error('Add sub-region failed:', error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (region: Region) => {
    setEditing(region);
    setEditName(region.name);
    setEditEmoji(region.emoji || '');
    setEditColor(region.color || null);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const name = editName.trim();
    if (!name) {
      toast.error(t('settings.regions.nameRequired'));
      return;
    }
    // Only send the fields that actually changed, so a plain rename never
    // touches emoji/color and never re-validates an unchanged color.
    const payload: {
      id: number;
      name?: string;
      emoji?: string | null;
      color?: string | null;
    } = { id: editing.id };
    if (name !== editing.name) payload.name = name;
    const emoji = editEmoji.trim() || null;
    if (emoji !== (editing.emoji || null)) payload.emoji = emoji;
    if (!editing.is_primary) {
      const color = editColor;
      if (color !== (editing.color || null)) payload.color = color;
    }
    if (Object.keys(payload).length <= 1) return; // nothing changed

    setBusy(true);
    try {
      await TauriService.updateRegion(payload);
      toast.success(t('common.success'));
      setEditing(null);
      await load();
    } catch (error: unknown) {
      console.error('Edit region failed:', error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleFreeze = async (region: Region) => {
    setBusy(true);
    try {
      await TauriService.updateRegion({ id: region.id, frozen: !region.frozen });
      toast.success(t('common.success'));
      await load();
    } catch (error: unknown) {
      console.error('Toggle freeze region failed:', error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = (region: Region) => {
    const count = accountCount(region.name);
    if (count === 0) {
      if (!window.confirm(t('settings.regions.deleteConfirm', { name: region.name }))) return;
      setBusy(true);
      TauriService.deleteRegion(region.id)
        .then(() => {
          toast.success(t('common.success'));
          return load();
        })
        .catch((error: unknown) => {
          console.error('Delete region failed:', error);
          toast.error(String(error));
        })
        .finally(() => setBusy(false));
      return;
    }
    setDeleting({ region, mode: 'single', targetId: null });
  };

  const eligibleTargets = (region: Region) =>
    region.parent_id == null
      ? []
      : regions.filter(
          (r) =>
            r.parent_id === region.parent_id &&
            r.id !== region.id &&
            !r.frozen,
        );

  const confirmDelete = async () => {
    if (!deleting) return;
    const { region, mode, targetId } = deleting;
    if (mode === 'single' && !targetId) {
      toast.error(t('settings.regions.deleteTargetRequired'));
      return;
    }
    setBusy(true);
    try {
      await TauriService.deleteRegionWithRedistribution({
        id: region.id,
        mode,
        target_id: mode === 'single' ? targetId : null,
      });
      toast.success(t('common.success'));
      setDeleting(null);
      await load();
    } catch (error: unknown) {
      console.error('Delete region with redistribution failed:', error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (region: Region, dir: -1 | 1) => {
    const parentId = region.parent_id;
    const siblings = parentId == null ? primaries : childrenOf(parentId);
    const idx = siblings.findIndex((r) => r.id === region.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= siblings.length) return;
    const next = [...siblings];
    [next[idx], next[target]] = [next[target], next[idx]];
    setBusy(true);
    try {
      await TauriService.reorderRegions(parentId, next.map((r) => r.id));
      await load();
    } catch (error: unknown) {
      console.error('Reorder failed:', error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const regionDot = (region: Region) => {
    const cls = proxyStateProgressClass(region.color || undefined);
    return (
      <span className={cn('h-2.5 w-2.5 rounded-full shrink-0', cls.color)} />
    );
  };

  const actionButtons = (region: Region, showReorder: boolean) => (
    <div className="flex items-center gap-0.5 shrink-0">
      {showReorder && (
        <>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={t('common.up')}
            disabled={busy}
            onClick={() => handleMove(region, -1)}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title={t('common.down')}
            disabled={busy}
            onClick={() => handleMove(region, 1)}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title={t('common.edit')}
        disabled={busy}
        onClick={() => openEdit(region)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-destructive hover:text-destructive"
        title={t('common.delete')}
        disabled={busy}
        onClick={() => handleDelete(region)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );

  if (loading) return <div className="p-4 text-sm text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <Card className="border-violet-500/20 bg-violet-500/5 backdrop-blur-sm shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-violet-500" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {t('settings.regions.title')}
              </CardTitle>
              <CardDescription className="text-[10px] mt-0.5">
                {t('settings.regions.subtitle')}
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-lg text-violet-600 border-violet-500/30 ml-auto">
              <ArrowUpDown className="h-3 w-3 ltr:mr-1 rtl:ml-1" />
              {regions.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add primary */}
          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-background/50 border border-dashed border-violet-500/30">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('settings.regions.addPrimary')}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newPrimaryName}
                onChange={(e) => setNewPrimaryName(e.target.value)}
                placeholder={t('settings.regions.primaryNamePlaceholder')}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleAddPrimary()}
              />
              <Input
                value={newPrimaryEmoji}
                onChange={(e) => setNewPrimaryEmoji(e.target.value)}
                placeholder="🇺🇸"
                className="sm:w-24"
              />
              <Button
                onClick={handleAddPrimary}
                disabled={busy}
                className="rounded-xl font-bold shrink-0"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" /> : <Plus className="h-4 w-4 ltr:mr-2 rtl:ml-2" />}
                          {t('common.add')}
              </Button>
            </div>
          </div>

          {/* Primaries list */}
          {primaries.length === 0 ? (
            <div className="p-3 rounded-2xl bg-background/40 border border-border/40 text-xs text-muted-foreground">
              {t('settings.regions.noPrimaries')}
            </div>
          ) : (
            primaries.map((primary) => (
              <Card key={primary.id} className="bg-background/60 border-border/60 shadow-sm overflow-hidden">
                <CardHeader className="px-4 py-2.5 flex flex-row items-center gap-2 space-y-0 border-b border-border/40">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                      {primary.emoji ? (
                        <span className="text-base leading-none">{primary.emoji}</span>
                      ) : (
                        <Globe className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate">{primary.name}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                        {t('settings.regions.primary')}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-lg text-[11px] shrink-0"
                    disabled={busy}
                    onClick={() => setAddingSubFor(addingSubFor === primary.id ? null : primary.id)}
                  >
                    <Plus className="h-3.5 w-3.5 ltr:mr-1 rtl:ml-1" />
                    {t('settings.regions.addSub')}
                  </Button>
                  {actionButtons(primary, primaries.length > 1)}
                </CardHeader>

                <CardContent className="px-3 py-2 space-y-1.5">
                  {addingSubFor === primary.id && (
                    <div className="flex flex-col gap-2 p-2.5 rounded-xl bg-accent/50 border border-dashed border-border">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          placeholder={t('settings.regions.subNamePlaceholder')}
                          className="flex-1 h-8 text-xs"
                          onKeyDown={(e) => e.key === 'Enter' && handleAddSub(primary.id)}
                        />
                        <Button
                          size="sm"
                          className="h-8 rounded-lg text-xs shrink-0"
                          disabled={busy}
                          onClick={() => handleAddSub(primary.id)}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin ltr:mr-1.5 rtl:ml-1.5" /> : <Plus className="h-3.5 w-3.5 ltr:mr-1.5 rtl:ml-1.5" />}
                {t('common.add')}
                        </Button>
                      </div>
                      <Swatches selected={newSubColor} onSelect={setNewSubColor} disabled={usedColors()} />
                    </div>
                  )}

                  {childrenOf(primary.id).length === 0 ? (
                    <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                      {t('settings.regions.noSubs')}
                    </div>
                  ) : (
                    childrenOf(primary.id).map((sub) => (
                      <div
                        key={sub.id}
                        className={cn(
                          'flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-background/40 border',
                          sub.frozen
                            ? 'border-sky-500/40 bg-sky-500/5'
                            : 'border-border/40 hover:border-violet-500/30',
                          'transition-all group',
                        )}
                      >
                        {regionDot(sub)}
                        <div className="min-w-0 flex-1">
                          <div className={cn('text-xs font-semibold truncate', sub.frozen && 'text-muted-foreground line-through')}>
                            {sub.name}
                          </div>
                          {sub.frozen && (
                            <Badge
                              variant="outline"
                              className="mt-0.5 text-[8px] rounded-full px-1.5 gap-1 text-sky-600 border-sky-500/40"
                            >
                              <Snowflake className="h-2.5 w-2.5" />
                              {t('settings.regions.frozen')}
                            </Badge>
                          )}
                        </div>
                        <Badge
                          variant="secondary"
                          className="text-[9px] rounded-full px-2 shrink-0 gap-1"
                        >
                          <Users className="h-3 w-3" />
                          {accountCount(sub.name)}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={sub.frozen ? t('settings.regions.unfreeze') : t('settings.regions.freeze')}
                          disabled={busy}
                          onClick={() => handleToggleFreeze(sub)}
                        >
                          <Snowflake className={cn('h-4 w-4', sub.frozen ? 'text-sky-500' : 'text-muted-foreground')} />
                        </Button>
                        {actionButtons(sub, childrenOf(primary.id).length > 1)}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            ))
          )}

          {/* Hint */}
          <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex gap-3 items-start backdrop-blur-sm">
            <MapPin className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
            <p className="text-[11px] text-violet-800 dark:text-violet-300 font-medium leading-tight">
              {t('settings.regions.hint')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background border shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="h-5 w-5 text-violet-500" />
                <h3 className="font-bold text-sm">
                  {t('settings.regions.editTitle')}
                </h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder={t('settings.regions.primaryName')}
                  className="flex-1"
                />
                <Input
                  value={editEmoji}
                  onChange={(e) => setEditEmoji(e.target.value)}
                  placeholder="🇺🇸"
                  className="w-20"
                />
              </div>
              {!editing.is_primary && (
                <Swatches selected={editColor} onSelect={setEditColor} disabled={usedColors(editing.id)} />
              )}
              <div className="flex gap-2 pt-1">
                <Button className="flex-1 rounded-xl font-bold" onClick={handleSaveEdit} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" /> : <Pencil className="h-4 w-4 ltr:mr-2 rtl:ml-2" />}
                  {t('common.save')}
                </Button>
                <Button variant="outline" className="rounded-xl" onClick={() => setEditing(null)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete with redistribution dialog */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-background border shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                <h3 className="font-bold text-sm">
                  {t('settings.regions.deleteRedistributeTitle', {
                    name: deleting.region.name,
                  })}
                </h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(null)} disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              {t('settings.regions.deleteHasAccounts', {
                name: deleting.region.name,
                count: accountCount(deleting.region.name),
              })}
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => setDeleting({ ...deleting, mode: 'single' })}
                className={cn(
                  'flex items-start gap-2 rounded-xl border p-3 text-left transition-all',
                  deleting.mode === 'single'
                    ? 'border-violet-500/60 bg-violet-500/10'
                    : 'border-border/60 hover:border-violet-500/30',
                )}
              >
                <MoveRight className="h-4 w-4 text-violet-500 mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold">
                    {t('settings.regions.redistributeSingle')}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t('settings.regions.redistributeSingleHint')}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setDeleting({ ...deleting, mode: 'rotate' })}
                className={cn(
                  'flex items-start gap-2 rounded-xl border p-3 text-left transition-all',
                  deleting.mode === 'rotate'
                    ? 'border-primary bg-primary/10'
                    : 'border-border/40 hover:border-primary/30',
                )}
              >
                <Shuffle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs font-bold">
                    {t('settings.regions.redistributeRotate')}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {t('settings.regions.redistributeRotateHint')}
                  </span>
                </span>
              </button>
            </div>

            {deleting.mode === 'single' && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t('settings.regions.redistributeTarget')}
                </label>
                <Select
                  value={deleting.targetId == null ? undefined : String(deleting.targetId)}
                  onValueChange={(v) =>
                    setDeleting({ ...deleting, targetId: Number(v) })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('settings.regions.redistributeTargetPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligibleTargets(deleting.region).map((target) => (
                      <SelectItem key={target.id} value={String(target.id)}>
                        <span className="flex items-center gap-2">
                          {regionDot(target)}
                          {target.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {eligibleTargets(deleting.region).length === 0 && (
                  <p className="text-[11px] text-destructive">
                    {t('settings.regions.deleteNoTargets')}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="destructive"
                className="flex-1 rounded-xl font-bold"
                onClick={confirmDelete}
                disabled={busy || (deleting.mode === 'single' && !deleting.targetId)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" /> : <Trash2 className="h-4 w-4 ltr:mr-2 rtl:ml-2" />}
                {t('common.delete')}
              </Button>
              <Button variant="outline" className="rounded-xl" onClick={() => setDeleting(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
