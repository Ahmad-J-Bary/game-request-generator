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
import UnreadyDailyTasksPage from './pages/daily-tasks/UnreadyDailyTasksPage';
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
  const { id } = useParams();
  return <GameDetailPage key={id} />;
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
                  <Route path="/daily-tasks/unready" element={<UnreadyDailyTasksPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
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
