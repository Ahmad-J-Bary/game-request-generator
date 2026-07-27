import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Loader2, CheckCircle2, XCircle, ArrowRight, Users, CheckSquare, Square } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@grq/ui/atoms/dialog';
import { Button } from '@grq/ui/atoms/button';
import { Badge } from '@grq/ui/atoms/badge';
import { ScrollArea } from '@grq/ui/atoms/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@grq/ui/atoms/select';
import { toast } from 'sonner';
import { TauriService } from '@grq/core/services/tauri.service';
import type { Account, GameBranch } from '@grq/api-bindings';

interface BranchBulkTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  branches: GameBranch[];
  onTransferComplete: () => void;
  onCancel: () => void;
}

interface TransferResult {
  accountId: number;
  accountName: string;
  success: boolean;
  error?: string;
}

export function BranchBulkTransferDialog({
  open,
  onOpenChange,
  accounts,
  branches,
  onTransferComplete,
  onCancel,
}: BranchBulkTransferDialogProps) {
  const { t } = useTranslation();
  const [targetBranchId, setTargetBranchId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [transferring, setTransferring] = useState(false);
  const [transferResults, setTransferResults] = useState<TransferResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const groupedAccounts = useMemo(() => {
    const grouped: { branchId: number | null; branchName: string; accounts: Account[] }[] = [];
    const branchMap = new Map<number, GameBranch>();
    for (const b of branches) branchMap.set(b.id, b);

    const nullBranch = accounts.filter(a => a.branch_id == null);
    if (nullBranch.length > 0) {
      grouped.push({
        branchId: null,
        branchName: t('branches.defaultBranch', 'Default Branch'),
        accounts: nullBranch,
      });
    }

    const branchIds = [...new Set(accounts.map(a => a.branch_id).filter(id => id != null) as number[])];
    for (const bid of branchIds) {
      const branch = branchMap.get(bid);
      const branchAccounts = accounts.filter(a => a.branch_id === bid);
      if (branchAccounts.length > 0) {
        grouped.push({
          branchId: bid,
          branchName: branch?.name ?? `#${bid}`,
          accounts: branchAccounts,
        });
      }
    }
    return grouped;
  }, [accounts, branches, t]);

  const selectedCount = selectedIds.size;
  const allIds = useMemo(() => new Set(accounts.map(a => a.id)), [accounts]);
  const allSelected = selectedCount === accounts.length && accounts.length > 0;

  const handleClose = () => {
    if (transferResults.length > 0 && transferResults.every(r => r.success)) {
      onTransferComplete();
    } else if (!transferring && onCancel) {
      onCancel();
    }
    onOpenChange(false);
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    onOpenChange(false);
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(allIds);
    }
  };

  const toggleAccount = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleTransfer = async () => {
    if (!targetBranchId || selectedCount === 0) return;

    const selectedAccounts = accounts.filter(a => selectedIds.has(a.id));
    setTransferring(true);
    setTransferResults([]);
    setCurrentIndex(0);

    const results: TransferResult[] = [];
    for (let i = 0; i < selectedAccounts.length; i++) {
      const acc = selectedAccounts[i];
      setCurrentIndex(i + 1);
      try {
        await TauriService.transferAccountBranch(acc.id, parseInt(targetBranchId));
        results.push({ accountId: acc.id, accountName: acc.name, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ accountId: acc.id, accountName: acc.name, success: false, error: msg });
      }
      setTransferResults([...results]);
    }

    setTransferring(false);
    toast.success(
      t('accounts.bulkTransfer.result', {
        success: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
      })
    );
  };

  const handleDialogClose = (open: boolean) => {
    if (!open) handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[560px] w-[calc(100vw-1.5rem)] p-0 overflow-hidden border-none shadow-2xl bg-background/80 backdrop-blur-2xl">
        <DialogHeader className="p-6 pb-2 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <GitBranch className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                {t('accounts.bulkTransfer.title')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {t('accounts.bulkTransfer.description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <GitBranch className="h-3.5 w-3.5" /> {t('accounts.bulkTransfer.selectTargetBranch')}
            </label>
            <Select value={targetBranchId} onValueChange={setTargetBranchId} disabled={transferring}>
              <SelectTrigger className="rounded-xl bg-background border-border/40">
                <SelectValue placeholder={t('accounts.bulkTransfer.selectBranchPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {branches.map(branch => (
                  <SelectItem key={branch.id} value={branch.id.toString()}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {transferResults.length > 0 ? (
            <div className="space-y-2 animate-in fade-in duration-300">
              <p className="text-xs font-semibold text-muted-foreground">
                {t('accounts.bulkTransfer.results')}
              </p>
              <ScrollArea className="max-h-[260px]">
                <div className="space-y-1">
                  {transferResults.map(r => (
                    <div key={r.accountId} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-accent/20">
                      {r.success ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
                      )}
                      <span className="truncate">{r.accountName}</span>
                      {r.error && <span className="text-destructive truncate ml-auto">- {r.error}</span>}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  {t('accounts.bulkTransfer.result', {
                    success: transferResults.filter(r => r.success).length,
                    failed: transferResults.filter(r => !r.success).length,
                  })}
                </span>
              </div>

              <Button className="w-full rounded-xl mt-2" onClick={handleClose}>
                {t('common.close')}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> {t('accounts.bulkTransfer.selectAccounts')}
                    <Badge variant="outline" className="text-[10px] h-4 px-1 font-normal">
                      {selectedCount}/{accounts.length}
                    </Badge>
                  </label>
                  {accounts.length > 0 && (
                    <button
                      onClick={toggleAll}
                      disabled={transferring}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                    >
                      {allSelected ? (
                        <CheckSquare className="h-3.5 w-3.5" />
                      ) : (
                        <Square className="h-3.5 w-3.5" />
                      )}
                      {allSelected ? t('accounts.bulkTransfer.deselectAll') : t('accounts.bulkTransfer.selectAll')}
                    </button>
                  )}
                </div>

                <ScrollArea className="max-h-[280px] border border-border/40 rounded-xl">
                  <div className="p-1">
                    {groupedAccounts.map(group => (
                      <div key={group.branchId ?? 'null'}>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          <GitBranch className="h-3 w-3" />
                          {group.branchName}
                          <Badge variant="secondary" className="text-[9px] h-3.5 px-1 ml-auto">
                            {group.accounts.length}
                          </Badge>
                        </div>
                        {group.accounts.map(acc => (
                          <label
                            key={acc.id}
                            className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs cursor-pointer transition-colors ${
                              selectedIds.has(acc.id)
                                ? 'bg-primary/10 hover:bg-primary/15'
                                : 'hover:bg-accent/30'
                            } ${transferring ? 'opacity-50 pointer-events-none' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedIds.has(acc.id)}
                              onChange={() => toggleAccount(acc.id)}
                              disabled={transferring}
                              className="h-3.5 w-3.5 accent-primary rounded"
                            />
                            <span className="truncate">{acc.name}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                    {accounts.length === 0 && (
                      <div className="py-6 text-center text-xs text-muted-foreground">
                        {t('accounts.bulkTransfer.noAccounts')}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  className="w-full rounded-xl gap-2 h-11 shadow-lg shadow-primary/20"
                  disabled={!targetBranchId || selectedCount === 0 || transferring}
                  onClick={handleTransfer}
                >
                  {transferring ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {transferring
                    ? t('accounts.bulkTransfer.transferring', { current: currentIndex, total: selectedCount })
                    : t('accounts.bulkTransfer.transferSelected', { count: selectedCount })}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={handleCancel}
                  disabled={transferring}
                >
                  {t('common.cancel')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
