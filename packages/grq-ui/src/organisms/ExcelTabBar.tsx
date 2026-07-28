// src/components/organisms/ExcelTabBar.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@grq/ui/atoms/button';
import { Input } from '@grq/ui/atoms/input';
import { Label } from '@grq/ui/atoms/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@grq/ui/atoms/popover';
import { cn } from '@grq/ui/lib/utils';
import type { Game } from '@grq/api-bindings';

export interface ExcelTabBarProps {
  games: Game[];
  activeGameId: number | undefined;
  onSelectGame: (gameId: number) => void;
  onCreateGame: (name: string) => Promise<void>;
  onDeleteGame?: (gameId: number) => void;
  isEditMode?: boolean;
}

export function ExcelTabBar({
  games,
  activeGameId,
  onSelectGame,
  onCreateGame,
  onDeleteGame,
  isEditMode = false,
}: ExcelTabBarProps) {
  const { t } = useTranslation();
  const [isCreatingGame, setIsCreatingGame] = useState(false);
  const [newGameName, setNewGameName] = useState('');

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGameName.trim()) return;
    try {
      await onCreateGame(newGameName.trim());
      setNewGameName('');
      setIsCreatingGame(false);
    } catch (error) {
      console.error('Failed to create game', error);
    }
  };

  return (
    <div 
      className={cn(
        "fixed inset-x-0 bottom-[var(--mobile-offset)] lg:sticky lg:bottom-0 lg:inset-x-auto z-30 flex items-end px-2 overflow-x-auto overflow-y-hidden",
        "bg-background/95 backdrop-blur-xl border-t border-border/40 shadow-[0_-4px_24px_rgba(0,0,0,0.04)]",
        "lg:h-11 h-12 transition-all duration-300"
      )}
      style={{
        // Define a CSS variable for the dynamic mobile height
        '--mobile-offset': 'calc(3.5rem + env(safe-area-inset-bottom))',
      } as React.CSSProperties}
    >
      {/* 
        Extra mobile offset:
        Bottom nav is ~3.5rem + safe-area. We push this element UP by exactly that much 
        using CSS classes on the wrappers of the pages. But this internal styling ensures the shadow/lines look good.
      */}
      
      <div className="flex items-end h-full">
        {games.map((g) => {
          const isActive = g.id === activeGameId;
          return (
            <div
              key={g.id}
              onClick={() => onSelectGame(g.id)}
              className={cn(
                "group relative flex items-center gap-2 px-4 select-none cursor-pointer transition-all duration-200",
                "min-w-[100px] max-w-[180px] border-r border-border/50",
                "rounded-t-lg mx-0.5",
                isActive 
                  ? "bg-primary/10 text-primary font-bold h-10 border-t-2 border-t-primary shadow-sm" 
                  : "bg-accent/40 text-muted-foreground hover:bg-accent hover:text-foreground h-9 mb-[1px]"
              )}
              title={g.name}
            >
              <span className="truncate flex-1 text-xs tracking-tight">{g.name}</span>
              
              {isActive && !isEditMode && onDeleteGame && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteGame(g.id);
                  }}
                  className="p-1 -mr-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
                  title={t('common.delete', 'Delete Game')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}

        {/* Add Game Popover */}
        <Popover open={isCreatingGame} onOpenChange={setIsCreatingGame}>
          <PopoverTrigger asChild>
            <div 
              className="flex items-center justify-center w-10 h-9 mb-[1px] ml-1 rounded-t-lg bg-accent/40 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
              title={t('games.addGame', 'Add New Game')}
            >
              <Plus className="h-4 w-4" />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-5 mb-2 border-border/50 shadow-2xl backdrop-blur-xl" side="top" align="start">
            <form onSubmit={handleCreateGame} className="space-y-4">
              <div className="space-y-1.5">
                <h4 className="font-semibold text-sm tracking-tight">{t('games.newGame', 'New Game Sheet')}</h4>
                <p className="text-xs text-muted-foreground">
                  {t('games.enterName', 'Enter a name for the new game sheet.')}
                </p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="name" className="sr-only">Name</Label>
                <Input
                  id="name"
                  placeholder="e.g. PUBG"
                  value={newGameName}
                  onChange={(e) => setNewGameName(e.target.value)}
                  className="h-9 text-sm"
                  autoFocus
                />
              </div>
              <Button type="submit" size="sm" className="w-full h-9">
                {t('common.create', 'Create Sheet')}
              </Button>
            </form>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
