import { Toaster } from '@grq/ui/atoms/sonner';
import { TooltipProvider } from '@grq/ui/atoms/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { ThemeProvider } from '@grq/ui/contexts/ThemeContext';
import { LanguageProvider } from '@grq/core/contexts/LanguageContext';
import { SettingsProvider } from '@grq/ui/contexts/SettingsContext';
import { MainLayout } from '@grq/ui/templates/MainLayout';
import { useGames } from '@grq/core/hooks/useGames';
import Dashboard from './pages/Dashboard';
// Accounts
import AccountListPage from './pages/accounts/AccountListPage';
import AccountDetailPage from './pages/accounts/AccountDetailPage';
import AccountFormPage from './pages/accounts/AccountFormPage';
// Games
import GameListPage from './pages/games/GameListPage';
import GameDetailPage from './pages/games/GameDetailPage';
// Progress
import AccountsDetailPage from './pages/progress/AccountsDetailPage';
// Daily Tasks
import DailyTasksPage from './pages/daily-tasks/DailyTasksPage';
// Settings
import SettingsPage from './pages/SettingsPage';
import './i18n';

const queryClient = new QueryClient();

// Redirect to the first available game's detail page
function GamesTablePage() {
  const { games, loading } = useGames();
  if (loading) return null;
  const firstGameId = games.length > 0 ? games[0].id : undefined;
  return <GameDetailPage gameId={firstGameId} forcedLayout="vertical" />;
}

// Wrapper ensures GameDetailPage remounts when navigating to a different game,
// resetting layout/mode state to defaults without needing a useEffect.
function GameDetailPageWrapper() {
  useParams(); // consume URL params to re-render, but id isn't needed here anymore
  return <GameDetailPage />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <SettingsProvider>
          <TooltipProvider>
            <Toaster />
            <BrowserRouter>
              <MainLayout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/games" element={<GameListPage />} />
                  <Route path="/games-table" element={<GamesTablePage />} />
                  <Route path="/games/:id" element={<GameDetailPageWrapper />} />
                  <Route path="/accounts" element={<AccountListPage />} />
                  <Route path="/accounts/:id" element={<AccountDetailPage />} />
                  <Route path="/accounts/new" element={<AccountFormPage />} />
                  <Route path="/accounts/edit/:id" element={<AccountFormPage />} />
                  <Route path="/accounts/detail" element={<AccountsDetailPage />} />
                  <Route path="/daily-tasks" element={<DailyTasksPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/settings/appearance" element={<SettingsPage section="appearance" />} />
                  <Route path="/settings/database"   element={<SettingsPage section="database" />} />
                  <Route path="/settings/proxy"      element={<SettingsPage section="proxy" />} />
                  <Route path="/settings/telegram"   element={<SettingsPage section="telegram" />} />
                </Routes>
              </MainLayout>
            </BrowserRouter>
          </TooltipProvider>
        </SettingsProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
