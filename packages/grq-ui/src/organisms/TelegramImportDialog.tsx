import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { 
  MessageSquare, 
  RefreshCw, 
  FileText, 
  User, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  Gamepad2,
  ChevronRight,
  Loader2,
  ArrowRight,
  ArrowLeft,
  Check,
  MapPin
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
} from '@grq/ui/atoms/dialog';
import { Button } from '@grq/ui/atoms/button';
import { Badge } from '@grq/ui/atoms/badge';
import { Card, CardContent } from '@grq/ui/atoms/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@grq/ui/atoms/select';
import { ScrollArea } from '@grq/ui/atoms/scroll-area';
import { toast } from 'sonner';
import { TauriService } from '@grq/core/services/tauri.service';
import { TelegramImportPreview, Game, GameBranch, TelegramConfig, Region, Account } from '@grq/api-bindings';
import { cn } from '@grq/ui/lib/utils';
import { asyncStorageService } from '@grq/core/services/storage.service';
import { applySessionCompletionForGame } from '@grq/core/services/excel/excel-session-processor';

interface TelegramImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TelegramImportDialog({ open, onOpenChange }: TelegramImportDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [imports, setImports] = useState<TelegramImportPreview[]>([]);
  const [selectedImport, setSelectedImport] = useState<TelegramImportPreview | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [branches, setBranches] = useState<GameBranch[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [dismissedUpdates, setDismissedUpdates] = useState<number[]>([]);
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [telegramStatus, setTelegramStatus] = useState<'loading' | 'ready' | 'disabled' | 'incomplete' | 'error'>('loading');

  // Region selection (country = primary region, sub-region = the target state)
  const [regions, setRegions] = useState<Region[]>([]);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [selectedPrimaryId, setSelectedPrimaryId] = useState<number | null>(null);
  const [suggestedSub, setSuggestedSub] = useState('');
  const [selectedSub, setSelectedSub] = useState('');

  const isTelegramReady = (config: TelegramConfig) => {
    return Boolean(config.enabled && config.bot_token?.trim() && config.chat_id?.trim());
  };

  const getErrorMessage = (error: unknown) => {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  };

  const resolveTelegramStatus = async (notifyOnFailure = false) => {
    try {
      const config = await TauriService.getTelegramConfig();

      if (!config.enabled) {
        setTelegramStatus('disabled');
        setImports([]);
        setSelectedImport(null);

        if (notifyOnFailure) {
          toast.error(t('settings.telegramImport.integrationDisabledHint'));
        }

        return false;
      }

      if (!isTelegramReady(config)) {
        setTelegramStatus('incomplete');
        setImports([]);
        setSelectedImport(null);

        if (notifyOnFailure) {
          toast.error(t('settings.telegramImport.configurationIncompleteHint'));
        }

        return false;
      }

      setTelegramStatus('ready');
      return true;
    } catch (error) {
      setTelegramStatus('error');
      setImports([]);
      setSelectedImport(null);

      if (notifyOnFailure) {
        toast.error(t('settings.telegramImport.fetchFailed'));
      }

      console.error('Failed to load Telegram config:', error);
      return false;
    }
  };

  const fetchUpdates = async (notifyOnUnavailable = false) => {
    setLoading(true);
    try {
      const canFetchUpdates = await resolveTelegramStatus(notifyOnUnavailable);

      if (!canFetchUpdates) {
        return;
      }

      const updates = await TauriService.getTelegramUpdates();
      setImports(updates);
    } catch (error) {
      const message = getErrorMessage(error).toLowerCase();

      if (message.includes('telegram integration is disabled')) {
        setTelegramStatus('disabled');
      } else if (message.includes('bot token not configured') || message.includes('chat id not configured')) {
        setTelegramStatus('incomplete');
      } else {
        setTelegramStatus('error');
        console.error('Failed to fetch Telegram updates:', error);
      }

      setImports([]);
      setSelectedImport(null);
      toast.error(t('settings.telegramImport.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async () => {
    try {
      const allGames = await TauriService.getGames();
      setGames(allGames);
    } catch (error) {
      console.error('Failed to fetch games:', error);
    }
  };

  const fetchRegions = async () => {
    try {
      const regs = await TauriService.getRegions();
      setRegions(regs || []);
      const prims = [...(regs || [])]
        .filter((r) => r.is_primary)
        .sort((a, b) => a.sort_order - b.sort_order);
      setSelectedPrimaryId(prims[0]?.id ?? null);
    } catch (error) {
      console.error('Failed to load regions:', error);
    }
  };

  const fetchAllAccounts = async () => {
    try {
      const accounts = await TauriService.getAllAccounts();
      setAllAccounts(accounts || []);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  // Mirror the backend create_account auto-assignment so the sub-region
  // selector can show the rotating region for the next account of a game.
  const computeSuggestedSubRegion = (gameId: number): string => {
    const subRegionNames = [...regions]
      .filter((r) => r.parent_id != null)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id)
      .map((r) => r.name);
    const subRegions = subRegionNames.length > 0
      ? subRegionNames
      : ['FLORIDA', 'CALIFORNIA', 'TEXAS', 'New York'];

    // 1. Reuse a package that doesn't have this game yet (batch completion).
    const gamePackages = new Set(
      allAccounts.filter((a) => a.game_id === gameId).map((a) => a.package_id)
    );
    const availablePackage = allAccounts
      .filter((a) => a.package_id != null && !gamePackages.has(a.package_id) && a.proxy_state !== 'UK')
      .sort((a, b) => (a.package_id ?? 0) - (b.package_id ?? 0))[0];
    if (availablePackage?.proxy_state) {
      return availablePackage.proxy_state;
    }

    // 2. New package round-robin, skipping states used today for this game.
    const maxPackageId = allAccounts.reduce(
      (max, a) => Math.max(max, a.package_id ?? 0),
      0
    );
    const nextId = maxPackageId + 1;
    const today = new Date().toISOString().slice(0, 10);
    const usedToday = new Set(
      allAccounts
        .filter((a) => a.game_id === gameId && a.created_at?.slice(0, 10) === today)
        .map((a) => a.proxy_state)
        .filter(Boolean)
    );
    let chosen = subRegions[(nextId - 1) % subRegions.length];
    if (usedToday.has(chosen)) {
      const firstUnused = subRegions.find((s) => !usedToday.has(s));
      if (firstUnused) chosen = firstUnused;
    }
    return chosen;
  };

  useEffect(() => {
    if (open) {
      setTelegramStatus('loading');
      asyncStorageService.get<number[]>('dismissed_telegram_updates').then(res => {
        setDismissedUpdates(res || []);
      });
      fetchUpdates(false);
      fetchGames();
      fetchRegions();
      fetchAllAccounts();
    }
  }, [open]);

  useEffect(() => {
    if (selectedGameId) {
      const loadBranches = async () => {
        try {
          const gameBranches = await TauriService.getGameBranches(parseInt(selectedGameId));
          setBranches(gameBranches);
          
          // Auto-select the latest branch (highest ID)
          if (gameBranches.length > 0) {
            const sorted = [...gameBranches].sort((a, b) => b.id - a.id);
            setSelectedBranchId(sorted[0].id.toString());
          } else {
            setSelectedBranchId('');
          }
        } catch (error) {
          console.error('Failed to fetch branches:', error);
        }
      };
      loadBranches();
    }
  }, [selectedGameId]);

  // Recompute the rotating sub-region suggestion when the game or data changes.
  useEffect(() => {
    if (selectedGameId) {
      const gameId = parseInt(selectedGameId);
      if (gameId > 0) {
        setSuggestedSub(computeSuggestedSubRegion(gameId));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGameId, allAccounts, regions]);

  // Auto-select game based on filename keywords when an import is selected
  useEffect(() => {
    if (selectedImport && games.length > 0) {
      const fileName = selectedImport.filename.replace(/\.[^/.]+$/, "").toLowerCase();
      // Split filename into keywords (minimum 2 chars)
      const fileKeywords = fileName.split(/[\s\-_]+/).filter(k => k.length >= 2);
      
      let bestGame = null;
      let maxMatches = 0;

      for (const game of games) {
        // Split game name into keywords (minimum 2 chars)
        const gameKeywords = game.name.toLowerCase().split(/[\s\-_]+/).filter(k => k.length >= 2);
        let matches = 0;

        for (const gk of gameKeywords) {
          // Count keyword matches (partial or full)
          if (fileKeywords.some(fk => fk.includes(gk) || gk.includes(fk))) {
            matches++;
          }
        }

        // Higher match count wins
        if (matches > maxMatches) {
          maxMatches = matches;
          bestGame = game;
        } else if (matches === maxMatches && matches > 0 && bestGame) {
          // In case of tie, prefer the one where game name is longer (potentially more specific)
          if (game.name.length > bestGame.name.length) {
            bestGame = game;
          }
        }
      }

      if (bestGame && maxMatches > 0) {
        setSelectedGameId(bestGame.id.toString());
      }
    }
  }, [selectedImport, games]);

  // Sync selectedTime when selectedImport changes
  useEffect(() => {
    if (selectedImport) {
      const timePart = selectedImport.date.split(' ')[1] || '00:00:00';
      // Convert to HH:mm format for input[type=time]
      setSelectedTime(timePart.substring(0, 5));
    }
  }, [selectedImport]);

  const handleProcessImport = async () => {
    if (!selectedImport || !selectedGameId || !selectedBranchId) return;

    setImporting(true);
    try {
      const canImport = await resolveTelegramStatus(true);
      if (!canImport) {
        return;
      }

      // 1. Download file content
      const content = await TauriService.downloadTelegramFile(selectedImport.file_id);
      
      if (!content || content.trim() === '') {
        toast.error(t('settings.telegramImport.invalidFile'));
        return;
      }

      // 2. Create account
      // Remove .txt extension for account name
      const accountName = selectedImport.filename.replace(/\.[^/.]+$/, "");
      
      await TauriService.addAccount({
        name: accountName,
        game_id: parseInt(selectedGameId),
        branch_id: parseInt(selectedBranchId),
        start_date: selectedImport.date.split(' ')[0],
        start_time: selectedTime ? `${selectedTime}:00` : (selectedImport.date.split(' ')[1] || '00:00:00'),
        request_template: content,
        proxy_state: selectedSub ? selectedSub : undefined,
      });

      applySessionCompletionForGame(parseInt(selectedGameId)).catch(() => {});
      // Refetch accounts so the suggested rotating sub-region advances for the next import.
      fetchAllAccounts();

      // 3. Update offset to mark as processed
      await TauriService.updateTelegramOffset(selectedImport.update_id);
      
      // Also add to local dismissal cache so it disappears immediately
      const newDismissed = [...dismissedUpdates, selectedImport.update_id];
      setDismissedUpdates(newDismissed);
      await asyncStorageService.set('dismissed_telegram_updates', newDismissed);

      toast.success(t('settings.telegramImport.success'));
      
      // Reset and refresh
      setSelectedImport(null);
      setSelectedGameId('');
      setSelectedBranchId('');
      fetchUpdates();
    } catch (error) {
      console.error('Import failed:', error);
      toast.error(t('settings.saveFailed'));
    } finally {
      setImporting(false);
    }
  };

  const handleDismiss = async (e: React.MouseEvent, updateId: number) => {
    e.stopPropagation();
    const newDismissed = [...dismissedUpdates, updateId];
    setDismissedUpdates(newDismissed);
    await asyncStorageService.set('dismissed_telegram_updates', newDismissed);
    toast.success(t('settings.telegramImport.markedAsRead'));
    if (selectedImport?.update_id === updateId) {
      setSelectedImport(null);
    }
  };

  const visibleImports = imports.filter(item => !dismissedUpdates.includes(item.update_id));

  const primaries = [...regions]
    .filter((r) => r.is_primary)
    .sort((a, b) => a.sort_order - b.sort_order);
  const selectedPrimary = primaries.find((p) => p.id === selectedPrimaryId) || primaries[0] || null;
  const subRegions = [...regions]
    .filter((r) => r.parent_id === selectedPrimary?.id)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] w-[calc(100vw-1.5rem)] max-h-[90dvh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-background/80 backdrop-blur-2xl">
        <DialogHeader className="p-6 pb-2 border-b border-border/40">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight">
                  {t('settings.telegramImport.title')}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  {t('settings.telegramImport.description')}
                </DialogDescription>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => fetchUpdates(true)} 
              disabled={loading}
              className="rounded-xl border-primary/20 hover:bg-primary/5 gap-1.5 h-8 sm:h-9"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span className="hidden sm:inline">{t('settings.telegramImport.checkUpdates')}</span>
              <span className="sm:hidden text-[10px]">{t('settings.telegramImport.refresh')}</span>
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
          {/* List Area */}
          <div className={cn(
            "flex flex-col transition-all duration-300",
            selectedImport ? "hidden lg:flex lg:w-1/2 border-r border-border/40" : "flex-1 w-full"
          )}>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {loading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">{t('settings.telegramImport.checking')}</p>
                  </div>
                )}

                {!loading && telegramStatus === 'disabled' && (
                  <Card className="border-yellow-500/20 bg-yellow-500/5">
                    <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                      <AlertCircle className="h-8 w-8 text-yellow-600" />
                      <div>
                        <p className="font-semibold text-foreground">
                          {t('settings.telegramImport.integrationDisabledTitle')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('settings.telegramImport.integrationDisabledHint')}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => {
                          onOpenChange(false);
                          navigate('/settings/telegram');
                        }}
                      >
                        {t('settings.telegramImport.openTelegramSettings')}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {!loading && telegramStatus === 'incomplete' && (
                  <Card className="border-yellow-500/20 bg-yellow-500/5">
                    <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                      <AlertCircle className="h-8 w-8 text-yellow-600" />
                      <div>
                        <p className="font-semibold text-foreground">
                          {t('settings.telegramImport.configurationIncompleteTitle')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('settings.telegramImport.configurationIncompleteHint')}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        className="rounded-xl"
                        onClick={() => {
                          onOpenChange(false);
                          navigate('/settings/telegram');
                        }}
                      >
                        {t('settings.telegramImport.openTelegramSettings')}
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {!loading && telegramStatus === 'error' && (
                  <Card className="border-destructive/20 bg-destructive/5">
                    <CardContent className="p-5 flex flex-col items-center text-center gap-3">
                      <AlertCircle className="h-8 w-8 text-destructive" />
                      <div>
                        <p className="font-semibold text-foreground">
                          {t('settings.telegramImport.fetchFailed')}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('settings.telegramImport.fetchFailedHint')}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {!loading && telegramStatus === 'ready' && visibleImports.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                    <div className="h-16 w-16 rounded-full bg-accent/50 flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {t('settings.telegramImport.noNewFiles')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t('settings.telegramImport.noNewFilesHint')}
                      </p>
                    </div>
                  </div>
                )}

                {!loading && telegramStatus === 'ready' && visibleImports.map((item) => (
                  <Card 
                    key={item.update_id}
                    className={cn(
                      "cursor-pointer transition-all border-border/40 hover:border-primary/40 hover:bg-primary/5",
                      selectedImport?.update_id === item.update_id && "border-primary bg-primary/5"
                    )}
                    onClick={() => setSelectedImport(item)}
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="h-10 w-10 rounded-xl bg-accent flex items-center justify-center shrink-0">
                        <FileText className="h-5 w-5 text-primary/70" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold truncate">{item.filename}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" /> {item.sender_name}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {item.date}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground/40 hover:text-emerald-500 hover:bg-emerald-500/10 rounded-full transition-colors ltr:ml-1 rtl:mr-1"
                        onClick={(e) => handleDismiss(e, item.update_id)}
                        title={t('settings.telegramImport.markAsRead')}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 ml-1" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Process Form Area */}
          {selectedImport && (
            <div className="w-full lg:w-1/2 flex flex-col bg-accent/20 animate-in slide-in-from-right lg:slide-in-from-right duration-300">
              <ScrollArea className="flex-1 p-4 lg:p-6">
                <div className="space-y-4 lg:space-y-6">
                  {/* Mobile Back Button */}
                  <button 
                    onClick={() => setSelectedImport(null)}
                    className="lg:hidden flex items-center gap-2 text-primary font-bold text-xs mb-2 transition-transform active:scale-95"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {t('settings.telegramImport.backToList')}
                  </button>

                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                      {t('settings.telegramImport.processing')} {selectedImport.filename}
                    </Badge>
                  </div>

                  {/* Game Selection */}
                  <div className="space-y-2.5">
                    <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                      <Gamepad2 className="h-3.5 w-3.5" /> {t('settings.telegramImport.selectGame')}
                    </label>
                    <Select value={selectedGameId} onValueChange={setSelectedGameId}>
                      <SelectTrigger className="rounded-xl bg-background border-border/40">
                        <SelectValue placeholder={t('settings.telegramImport.selectGamePlaceholder')} />
                      </SelectTrigger>
                      <SelectContent>
                        {games.map(game => (
                          <SelectItem key={game.id} value={game.id.toString()}>{game.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Branch Selection */}
                  <div className="space-y-2.5">
                    <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5" /> {t('settings.telegramImport.selectBranch')}
                    </label>
                    <Select value={selectedBranchId} onValueChange={setSelectedBranchId} disabled={!selectedGameId}>
                      <SelectTrigger className="rounded-xl bg-background border-border/40">
                        <SelectValue placeholder={selectedGameId ? t('settings.telegramImport.selectBranchPlaceholder') : t('settings.telegramImport.chooseGameFirst')} />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map(branch => (
                          <SelectItem key={branch.id} value={branch.id.toString()}>{branch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Start Time */}
                  <div className="space-y-2.5">
                    <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" /> {t('accounts.startTime', 'Start Time')}
                    </label>
                    <input
                      type="time"
                      value={selectedTime}
                      onChange={(e) => setSelectedTime(e.target.value)}
                      className="w-full rounded-xl bg-background border border-border/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {t('settings.telegramImport.detectedTime', 'Detected from message')}: {selectedImport.date.split(' ')[1] || '00:00:00'}
                    </p>
                  </div>

                  {/* Region Selection */}
                  {primaries.length > 0 && (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {primaries.length > 1 && (
                        <div className="space-y-2.5">
                          <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                            🌍 {t('accounts.country', 'Country')}
                          </label>
                          <Select
                            value={selectedPrimary?.id?.toString() ?? ''}
                            onValueChange={(val) => {
                              const pid = parseInt(val, 10);
                              setSelectedPrimaryId(pid);
                              // Reset to Auto so the backend rotates the region
                              // for the next account of this game.
                              setSelectedSub('');
                            }}
                          >
                            <SelectTrigger className="rounded-xl bg-background border-border/40">
                              <SelectValue placeholder={t('accounts.selectCountry', 'Select country')} />
                            </SelectTrigger>
                            <SelectContent>
                              {primaries.map((p) => (
                                <SelectItem key={p.id} value={p.id.toString()}>
                                  {p.emoji ? `${p.emoji} ` : ''}{p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div className={`space-y-2.5 ${primaries.length > 1 ? '' : 'sm:col-span-2'}`}>
                        <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" /> {t('accounts.subRegion', 'Sub-region')}
                        </label>
                        <Select
                          value={selectedSub || suggestedSub}
                          onValueChange={(val) => {
                            if (val === 'auto') {
                              setSelectedSub('');
                            } else {
                              setSelectedSub(val);
                            }
                          }}
                        >
                          <SelectTrigger className="rounded-xl bg-background border-border/40">
                            <SelectValue placeholder={t('accounts.selectSubRegion', 'Select sub-region')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">
                              <span className="flex items-center gap-1.5">
                                <RefreshCw className="h-3 w-3" /> {t('accounts.autoRegion', 'Auto')}
                              </span>
                            </SelectItem>
                            {suggestedSub && !subRegions.some((s) => s.name === suggestedSub) && (
                              <SelectItem value={suggestedSub}>
                                {suggestedSub}
                              </SelectItem>
                            )}
                            {subRegions.map((s) => (
                              <SelectItem key={s.id} value={s.name}>
                                {s.emoji ? `${s.emoji} ` : ''}{s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}


                  <Card className="bg-background/50 border-primary/10 overflow-hidden">
                    <div className="px-4 py-2 bg-primary/5 border-b border-primary/10">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">
                        {t('settings.telegramImport.templatePreview')}
                      </span>
                    </div>
                    <CardContent className="p-4">
                       <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                         {t('settings.telegramImport.templateHint')}
                       </p>
                    </CardContent>
                  </Card>

                  <div className="flex flex-col gap-2 pt-4">
                    <Button 
                      className="w-full rounded-xl gap-2 h-11 shadow-lg shadow-primary/20"
                      disabled={!selectedBranchId || importing}
                      onClick={handleProcessImport}
                    >
                      {importing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                      {t('settings.telegramImport.finalize')}
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-xs text-muted-foreground"
                      onClick={() => setSelectedImport(null)}
                      disabled={importing}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {!selectedImport && telegramStatus === 'ready' && visibleImports.length > 0 && (
          <div className="p-4 bg-primary/5 border-t border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 text-primary" />
              {t('settings.telegramImport.foundFiles', { count: visibleImports.length })}
            </div>
            <p className="text-[10px] text-muted-foreground">{t('settings.telegramImport.selectFileHint')}</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
