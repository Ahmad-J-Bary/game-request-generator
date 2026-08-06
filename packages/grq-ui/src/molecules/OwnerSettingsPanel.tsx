import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Plus, Pencil, Trash2, Loader2, X, User, UserPlus } from 'lucide-react';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@grq/ui/atoms/card';
import { Badge } from '@grq/ui/atoms/badge';
import { toast } from 'sonner';
import { TauriService } from '@grq/core/services/tauri.service';
import type { Account, Owner } from '@grq/api-bindings';

export function OwnerSettingsPanel() {
  const { t } = useTranslation();
  const [owners, setOwners] = useState<Owner[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Add form
  const [newOwnerName, setNewOwnerName] = useState('');
  const [pendingAdd, setPendingAdd] = useState<string | null>(null);

  // Post-add transfer dialog
  const [transferFor, setTransferFor] = useState<Owner | null>(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<number>>(new Set());

  // Edit form
  const [editing, setEditing] = useState<Owner | null>(null);
  const [editName, setEditName] = useState('');

  // Delete confirmation
  const [deleting, setDeleting] = useState<Owner | null>(null);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    try {
      const [owned, accs] = await Promise.all([
        TauriService.getOwners(),
        TauriService.getAllAccounts(),
      ]);
      setOwners(owned || []);
      setAccounts(accs || []);
    } catch (error) {
      console.error('Failed to load owners:', error);
      toast.error(t('settings.owners.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const accountCount = (name: string) =>
    accounts.filter((a) => (a.owner?.trim() || '') === name).length;

  const isFirstOwner = owners.length === 0;

  // ── Add ────────────────────────────────────────────────────────────────
  const handleAddClick = () => {
    const name = newOwnerName.trim();
    if (!name) {
      toast.error(t('settings.owners.nameRequired'));
      return;
    }
    if (isFirstOwner) {
      // First owner: confirm that ALL accounts become owned by this owner.
      setPendingAdd(name);
    } else {
      createOwner(name);
    }
  };

  const createOwner = async (name: string) => {
    setBusy(true);
    try {
      const newId = await TauriService.addOwner({ name });
      toast.success(t('settings.owners.ownerAdded'));
      setNewOwnerName('');
      const owned = await TauriService.getOwners();
      setOwners(owned || []);
      const created = (owned || []).find((o) => o.id === newId) ?? null;
      if (isFirstOwner) {
        const affected = await TauriService.claimAllAccountsToOwner(newId);
        toast.success(t('settings.owners.claimedAll', { count: affected }));
      } else if (created && accounts.length > 0) {
        setTransferFor(created);
        setSelectedAccountIds(new Set());
      }
      await load();
    } catch (error: unknown) {
      console.error('Add owner failed:', error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const confirmFirstOwner = async () => {
    if (!pendingAdd) return;
    await createOwner(pendingAdd);
    setPendingAdd(null);
  };

  // ── Transfer (2nd+ owner) ──────────────────────────────────────────────
  const toggleAccount = (id: number) => {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllAccounts = () => {
    setSelectedAccountIds((prev) =>
      prev.size === accounts.length ? new Set<number>() : new Set(accounts.map((a) => a.id)),
    );
  };

  const confirmTransfer = async () => {
    if (!transferFor) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedAccountIds);
      if (ids.length > 0) {
        const affected = await TauriService.transferAccountsToOwner(transferFor.id, ids);
        toast.success(t('settings.owners.transferred', { count: affected }));
      }
      setTransferFor(null);
      await load();
    } catch (error: unknown) {
      console.error('Transfer failed:', error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  // ── Edit ───────────────────────────────────────────────────────────────
  const openEdit = (owner: Owner) => {
    setEditing(owner);
    setEditName(owner.name);
  };

  const confirmEdit = async () => {
    if (!editing) return;
    const name = editName.trim();
    if (!name) {
      toast.error(t('settings.owners.nameRequired'));
      return;
    }
    setBusy(true);
    try {
      await TauriService.updateOwner({ id: editing.id, name });
      toast.success(t('settings.owners.ownerUpdated'));
      setEditing(null);
      await load();
    } catch (error: unknown) {
      console.error('Update owner failed:', error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await TauriService.deleteOwner(deleting.id);
      toast.success(t('settings.owners.ownerDeleted'));
      setDeleting(null);
      await load();
    } catch (error: unknown) {
      console.error('Delete owner failed:', error);
      toast.error(String(error));
    } finally {
      setBusy(false);
    }
  };

  const ownerName = (o: Owner) => o.name;

  const overlayShell = ({ children }: { children: React.ReactNode }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-background border shadow-2xl p-5 space-y-4">
        {children}
      </div>
    </div>
  );

  if (loading) return <div className="p-4 text-sm text-muted-foreground">{t('common.loading')}</div>;

  return (
    <div className="space-y-6">
      <Card className="border-sky-500/20 bg-sky-500/5 backdrop-blur-sm shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-sky-500" />
            </div>
            <div>
              <CardTitle className="text-lg">
                {t('settings.owners.title')}
              </CardTitle>
              <CardDescription className="text-[10px] mt-0.5">
                {t('settings.owners.subtitle')}
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-lg text-sky-600 border-sky-500/30 ml-auto">
              <Users className="h-3 w-3 ltr:mr-1 rtl:ml-1" />
              {owners.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Add owner */}
          <div className="flex flex-col gap-2 p-3 rounded-2xl bg-background/50 border border-dashed border-sky-500/30">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('settings.owners.addOwner')}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={newOwnerName}
                onChange={(e) => setNewOwnerName(e.target.value)}
                placeholder={t('settings.owners.ownerNamePlaceholder')}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && handleAddClick()}
              />
              <Button
                onClick={handleAddClick}
                disabled={busy}
                className="rounded-xl font-bold shrink-0"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" /> : <Plus className="h-4 w-4 ltr:mr-2 rtl:ml-2" />}
                {t('common.add')}
              </Button>
            </div>
          </div>

          {/* Owners list */}
          {owners.length === 0 ? (
            <div className="p-3 rounded-2xl bg-background/40 border border-border/40 text-xs text-muted-foreground">
              {t('settings.owners.noOwners')}
            </div>
          ) : (
            <div className="space-y-2">
              {owners.map((owner) => (
                <div
                  key={owner.id}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-background/60 border border-border/60"
                >
                  <div className="h-9 w-9 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
                    <User className="h-4 w-4 text-sky-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{ownerName(owner)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t('settings.owners.accountCount', { count: accountCount(owner.name) })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(owner)} disabled={busy}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleting(owner)} disabled={busy}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* First owner confirmation */}
      {pendingAdd !== null && overlayShell({
        children: (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-sky-500" />
                <h3 className="font-bold text-sm">{t('settings.owners.firstOwnerTitle')}</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPendingAdd(null)} disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {t('settings.owners.firstOwnerMessage', { name: pendingAdd })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingAdd(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button onClick={confirmFirstOwner} disabled={busy} className="rounded-xl font-bold">
                {busy ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" /> : null}
                {t('settings.owners.confirm')}
              </Button>
            </div>
          </>
        ),
      })}

      {/* Post-add transfer */}
      {transferFor && overlayShell({
        children: (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-sky-500" />
                <h3 className="font-bold text-sm">{t('settings.owners.transferTitle', { name: transferFor.name })}</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTransferFor(null)} disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {t('settings.owners.transferMessage')}
            </div>
            <button
              type="button"
              onClick={toggleAllAccounts}
              className="w-full text-left text-xs font-bold text-sky-600 hover:underline"
            >
              {selectedAccountIds.size === accounts.length
                ? t('settings.owners.deselectAll')
                : t('settings.owners.selectAll', { count: accounts.length })}
            </button>
            <div className="max-h-64 overflow-y-auto space-y-1.5 border border-border/40 rounded-xl p-2">
              {accounts.map((acc) => (
                <label key={acc.id} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-accent cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={selectedAccountIds.has(acc.id)}
                    onChange={() => toggleAccount(acc.id)}
                  />
                  <span className="text-xs truncate">{acc.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {(acc.owner?.trim() || '') || t('settings.owners.noOwner')}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setTransferFor(null)} disabled={busy}>
                {t('settings.owners.transferSkip')}
              </Button>
              <Button onClick={confirmTransfer} disabled={busy} className="rounded-xl font-bold">
                {busy ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" /> : null}
                {t('settings.owners.transferConfirm', { count: selectedAccountIds.size })}
              </Button>
            </div>
          </>
        ),
      })}

      {/* Edit */}
      {editing && overlayShell({
        children: (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-sky-500" />
                <h3 className="font-bold text-sm">{t('settings.owners.editOwner')}</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(null)} disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder={t('settings.owners.ownerNamePlaceholder')}
              onKeyDown={(e) => e.key === 'Enter' && confirmEdit()}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button onClick={confirmEdit} disabled={busy} className="rounded-xl font-bold">
                {busy ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" /> : null}
                {t('common.save')}
              </Button>
            </div>
          </>
        ),
      })}

      {/* Delete */}
      {deleting && overlayShell({
        children: (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                <h3 className="font-bold text-sm">{t('settings.owners.deleteOwner')}</h3>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleting(null)} disabled={busy}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              {t('settings.owners.deleteMessage', {
                name: deleting.name,
                count: accountCount(deleting.name),
              })}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>
                {t('common.cancel')}
              </Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={busy} className="rounded-xl font-bold">
                {busy ? <Loader2 className="h-4 w-4 animate-spin ltr:mr-2 rtl:ml-2" /> : null}
                {t('settings.owners.confirm')}
              </Button>
            </div>
          </>
        ),
      })}
    </div>
  );
}

export default OwnerSettingsPanel;