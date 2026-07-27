import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Loader2, AlertCircle, CheckCircle2, ArrowRight, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@grq/ui/atoms/dialog';
import { Button } from '@grq/ui/atoms/button';
import { Badge } from '@grq/ui/atoms/badge';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@grq/ui/atoms/select';
import { toast } from 'sonner';
import { TauriService } from '@grq/core/services/tauri.service';
import type { AccountBranchTransferResult, GameBranch, TransferPreview } from '@grq/api-bindings';

interface BranchTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: number;
  accountName: string;
  currentBranchId: number | null;
  currentBranchName: string | null;
  gameId: number;
}

export function BranchTransferDialog({
  open,
  onOpenChange,
  accountId,
  accountName,
  currentBranchId,
  currentBranchName,
  gameId,
}: BranchTransferDialogProps) {
  const { t } = useTranslation();
  const [branches, setBranches] = useState<GameBranch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [result, setResult] = useState<AccountBranchTransferResult | null>(null);
  const [preview, setPreview] = useState<TransferPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedBranchId('');
      setResult(null);
      setPreview(null);
      loadBranches();
    }
  }, [open]);

  const loadBranches = async () => {
    setLoading(true);
    try {
      const allBranches = await TauriService.getGameBranches(gameId);
      setBranches(allBranches.filter(b => b.id !== currentBranchId));
    } catch (error) {
      console.error('Failed to load branches:', error);
      toast.error(t('common.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedBranchId) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    const loadPreview = async () => {
      setPreviewLoading(true);
      try {
        const p = await TauriService.previewTransferAccountBranch(
          accountId,
          parseInt(selectedBranchId),
        );
        if (!cancelled) setPreview(p);
      } catch (error) {
        console.error('Preview failed:', error);
        if (!cancelled) setPreview(null);
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };
    loadPreview();
    return () => { cancelled = true; };
  }, [selectedBranchId, accountId]);

  const handleTransfer = async () => {
    if (!selectedBranchId) return;

    setTransferring(true);
    setResult(null);
    try {
      const res = await TauriService.transferAccountBranch(
        accountId,
        parseInt(selectedBranchId),
      );
      setResult(res);
      toast.success(t('accounts.branchTransfer.success'));
    } catch (error) {
      console.error('Branch transfer failed:', error);
      toast.error(t('accounts.branchTransfer.error'));
    } finally {
      setTransferring(false);
    }
  };

  const handleClose = () => {
    if (result) {
      window.dispatchEvent(new CustomEvent('progress-updated', { detail: { accountId } }));
      window.dispatchEvent(new CustomEvent('data-changed'));
    }
    onOpenChange(false);
  };

  const selectedBranch = branches.find(b => b.id.toString() === selectedBranchId);
  const hasMissingTokens = preview && (preview.missingLevels.length > 0 || preview.missingPurchaseEvents.length > 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px] w-[calc(100vw-1.5rem)] p-0 overflow-hidden border-none shadow-2xl bg-background/80 backdrop-blur-2xl">
        <DialogHeader className="p-6 pb-2 border-b border-border/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
              <GitBranch className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">
                {t('accounts.branchTransfer.title')}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                {t('accounts.branchTransfer.description')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 space-y-4">
          {result ? (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
                <div>
                  <p className="font-semibold text-sm">{t('accounts.branchTransfer.completed')}</p>
                  <p className="text-xs text-muted-foreground mt-1">{accountName}</p>
                </div>
              </div>

              <Card className="border-border/40">
                <CardContent className="p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t('accounts.branchTransfer.sourceBranch')}</span>
                    <span className="font-medium">{result.sourceBranchName ?? '—'}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{t('accounts.branchTransfer.targetBranch')}</span>
                    <span className="font-medium">{result.targetBranchName}</span>
                  </div>
                  <div className="border-t border-border/40 pt-2 mt-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{t('accounts.branchTransfer.transferredLevels')}</span>
                      <span className="font-medium">{result.transferredLevels}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{t('accounts.branchTransfer.transferredPurchaseEvents')}</span>
                      <span className="font-medium">{result.transferredPurchaseEvents}</span>
                    </div>
                  </div>
                  {result.warnings.length > 0 && (
                    <div className="border-t border-border/40 pt-2 mt-2 space-y-1">
                      {result.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-amber-600">
                          <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Button className="w-full rounded-xl" onClick={handleClose}>
                {t('common.close')}
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground">
                  {t('accounts.branchTransfer.currentBranch')}
                </label>
                <div className="text-sm font-medium px-3 py-2 rounded-xl bg-accent/20 border border-border/40">
                  {currentBranchName || t('branches.defaultBranch', 'Default Branch')}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                  <GitBranch className="h-3.5 w-3.5" /> {t('accounts.branchTransfer.selectTargetBranch')}
                </label>
                <Select value={selectedBranchId} onValueChange={setSelectedBranchId} disabled={loading}>
                  <SelectTrigger className="rounded-xl bg-background border-border/40">
                    <SelectValue placeholder={loading ? t('common.loading') : t('accounts.branchTransfer.selectBranchPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map(branch => (
                      <SelectItem key={branch.id} value={branch.id.toString()}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedBranch && (
                <>
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                    </div>
                  ) : preview && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                      {currentBranchId && (
                        <Card className="border-border/40">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{t('accounts.branchTransfer.matchedLevels')}</span>
                              <span className="font-semibold">
                                {preview.matchedLevels.length} / {preview.totalSourceLevels}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{t('accounts.branchTransfer.matchedPurchaseEvents')}</span>
                              <span className="font-semibold">
                                {preview.matchedPurchaseEvents.length} / {preview.totalSourcePurchaseEvents}
                              </span>
                            </div>
                            {preview.missingLevels.length > 0 && (
                              <div className="text-[10px] text-amber-600 flex items-center gap-1 pt-1 border-t border-border/40">
                                <AlertCircle className="h-3 w-3" />
                                {t('accounts.branchTransfer.missingTokens', { count: preview.missingLevels.length })}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      {currentBranchId && hasMissingTokens && (
                        <Card className="border-amber-500/20 bg-amber-500/5">
                          <CardContent className="p-3 space-y-1">
                            {preview.missingLevels.map(tok => (
                              <div key={tok} className="flex items-center gap-2 text-xs text-amber-700">
                                <XCircle className="h-3 w-3 shrink-0" />
                                <span className="font-mono">{tok}</span>
                                <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-300/40">
                                  {t('accounts.branchTransfer.level')}
                                </Badge>
                              </div>
                            ))}
                            {preview.missingPurchaseEvents.map(tok => (
                              <div key={tok} className="flex items-center gap-2 text-xs text-amber-700">
                                <XCircle className="h-3 w-3 shrink-0" />
                                <span className="font-mono">{tok}</span>
                                <Badge variant="outline" className="text-[9px] h-4 px-1 border-amber-300/40">
                                  {t('accounts.branchTransfer.purchase')}
                                </Badge>
                              </div>
                            ))}
                          </CardContent>
                        </Card>
                      )}

                      {currentBranchId && (
                        <Card className="border-amber-500/20 bg-amber-500/5">
                          <CardContent className="p-4 flex items-start gap-3">
                            <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-amber-700">
                                {t('accounts.branchTransfer.warningTitle')}
                              </p>
                              <p className="text-[10px] text-amber-600/80 mt-1">
                                {t('accounts.branchTransfer.warningDescription')}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  className="w-full rounded-xl gap-2 h-11 shadow-lg shadow-primary/20"
                  disabled={!selectedBranchId || transferring || previewLoading}
                  onClick={handleTransfer}
                >
                  {transferring ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                  {t('accounts.branchTransfer.transfer')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground"
                  onClick={() => onOpenChange(false)}
                  disabled={transferring}
                >
                  {t('common.cancel')}
                </Button>
              </div>
              {!currentBranchId && selectedBranchId && (
                <p className="text-[10px] text-muted-foreground text-center">
                  {t('accounts.branchTransfer.noSourceHint')}
                </p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
