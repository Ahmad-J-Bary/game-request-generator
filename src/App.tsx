import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { SettingsProvider } from './contexts/SettingsContext';
import { MainLayout } from './components/templates/MainLayout';
import Dashboard from './pages/Dashboard';
import Events from './pages/Events';
// Accounts
import AccountListPage from './pages/accounts/AccountListPage';
import AccountDetailPage from './pages/accounts/AccountDetailPage';
import AccountFormPage from './pages/accounts/AccountFormPage';
// Games
import GameListPage from './pages/games/GameListPage';
import GameDetailPage from './pages/games/GameDetailPage';
// Levels
import LevelListPage from './pages/levels/LevelListPage';
// Progress
import AccountsDetailPage from './pages/progress/AccountsDetailPage';
// Purchase Events
import PurchaseEventListPage from './pages/purchase-events/PurchaseEventListPage';
import PurchaseEventDetailPage from './pages/purchase-events/PurchaseEventDetailPage';
// Daily Tasks
import DailyTasksPage from './pages/daily-tasks/DailyTasksPage';
import UnreadyDailyTasksPage from './pages/daily-tasks/UnreadyDailyTasksPage';
// Settings
import SettingsPage from './pages/SettingsPage';
import './i18n';

const queryClient = new QueryClient();

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
                  <Route path="/games/:id" element={<GameDetailPage />} />
                  <Route path="/accounts" element={<AccountListPage />} />
                  <Route path="/accounts/:id" element={<AccountDetailPage />} />
                  <Route path="/accounts/new" element={<AccountFormPage />} />
                  <Route path="/accounts/edit/:id" element={<AccountFormPage />} />
                  <Route path="/accounts/detail" element={<AccountsDetailPage />} />
                  <Route path="/levels" element={<LevelListPage />} />
                  <Route path="/daily-tasks" element={<DailyTasksPage />} />
                  <Route path="/daily-tasks/unready" element={<UnreadyDailyTasksPage />} />
                  <Route path="/purchase-events" element={<PurchaseEventListPage />} />
                  <Route path="/purchase-events/:id" element={<PurchaseEventDetailPage />} />
                  <Route path="/events" element={<Events />} />
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
