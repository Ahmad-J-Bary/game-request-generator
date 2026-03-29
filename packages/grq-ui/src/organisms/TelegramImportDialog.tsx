import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  ArrowRight
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
import { TelegramImportPreview, Game, GameBranch } from '@grq/api-bindings';
import { cn } from '@grq/ui/lib/utils';

interface TelegramImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TelegramImportDialog({ open, onOpenChange }: TelegramImportDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [imports, setImports] = useState<TelegramImportPreview[]>([]);
  const [selectedImport, setSelectedImport] = useState<TelegramImportPreview | null>(null);
  const [games, setGames] = useState<Game[]>([]);
  const [branches, setBranches] = useState<GameBranch[]>([]);
  const [selectedGameId, setSelectedGameId] = useState<string>('');
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [importing, setImporting] = useState(false);

  const fetchUpdates = async () => {
    setLoading(true);
    try {
      const updates = await TauriService.getTelegramUpdates();
      setImports(updates);
    } catch (error) {
      console.error('Failed to fetch Telegram updates:', error);
      toast.error(t('settings.fetchFailed'));
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

  useEffect(() => {
    if (open) {
      fetchUpdates();
      fetchGames();
    }
  }, [open]);

  useEffect(() => {
    if (selectedGameId) {
      const loadBranches = async () => {
        try {
          const gameBranches = await TauriService.getGameBranches(parseInt(selectedGameId));
          setBranches(gameBranches);
          setSelectedBranchId('');
        } catch (error) {
          console.error('Failed to fetch branches:', error);
        }
      };
      loadBranches();
    }
  }, [selectedGameId]);

  const handleProcessImport = async () => {
    if (!selectedImport || !selectedGameId || !selectedBranchId) return;

    setImporting(true);
    try {
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
        start_date: selectedImport.date.split(' ')[0], // Extract just the date YYYY-MM-DD
        start_time: selectedImport.date.split(' ')[1] || '00:00:00', // Extract the time HH:MM:SS
        request_template: content,
      });

      // 3. Update offset to mark as processed
      await TauriService.updateTelegramOffset(selectedImport.update_id);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col p-0 overflow-hidden border-none shadow-2xl bg-background/80 backdrop-blur-2xl">
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
                  Review and finalize account creation from group messages
                </DialogDescription>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchUpdates} 
              disabled={loading}
              className="rounded-xl border-primary/20 hover:bg-primary/5 gap-2"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              {t('settings.telegramImport.checkUpdates')}
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex">
          {/* List Area */}
          <div className={cn(
            "flex-1 flex flex-col transition-all duration-300",
            selectedImport ? "w-1/2 border-r border-border/40" : "w-full"
          )}>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-3">
                {loading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-sm text-muted-foreground">Checking for new messages...</p>
                  </div>
                )}

                {!loading && imports.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                    <div className="h-16 w-16 rounded-full bg-accent/50 flex items-center justify-center">
                      <CheckCircle2 className="h-8 w-8 text-muted-foreground/40" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {t('settings.telegramImport.noNewFiles')}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Any .txt files sent to your group will appear here.
                      </p>
                    </div>
                  </div>
                )}

                {!loading && imports.map((item) => (
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
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Process Form Area */}
          {selectedImport && (
            <div className="w-1/2 flex flex-col bg-accent/20 animate-in slide-in-from-right duration-300">
              <ScrollArea className="flex-1 p-6">
                <div className="space-y-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                      Processing: {selectedImport.filename}
                    </Badge>
                  </div>

                  {/* Game Selection */}
                  <div className="space-y-2.5">
                    <label className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                      <Gamepad2 className="h-3.5 w-3.5" /> {t('settings.telegramImport.selectGame')}
                    </label>
                    <Select value={selectedGameId} onValueChange={setSelectedGameId}>
                      <SelectTrigger className="rounded-xl bg-background border-border/40">
                        <SelectValue placeholder="Select a game..." />
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
                        <SelectValue placeholder={selectedGameId ? "Select branch..." : "Choose game first"} />
                      </SelectTrigger>
                      <SelectContent>
                        {branches.map(branch => (
                          <SelectItem key={branch.id} value={branch.id.toString()}>{branch.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Info Card */}
                  <Card className="bg-background/50 border-primary/10 overflow-hidden">
                    <div className="px-4 py-2 bg-primary/5 border-b border-primary/10">
                      <span className="text-[10px] font-bold text-primary uppercase tracking-tighter">
                        {t('settings.telegramImport.templatePreview')}
                      </span>
                    </div>
                    <CardContent className="p-4">
                       <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                         Content will be read from the file automatically. Original message date will be used as the start date.
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
                      Cancel
                    </Button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        {!selectedImport && imports.length > 0 && (
          <div className="p-4 bg-primary/5 border-t border-border/40 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5 text-primary" />
              {t('settings.telegramImport.foundFiles', { count: imports.length })}
            </div>
            <p className="text-[10px] text-muted-foreground">Select a file to begin the import process</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
