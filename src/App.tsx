import { Toaster } from './components/ui/sonner';
import { TooltipProvider } from './components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { MainLayout } from './components/templates/MainLayout';
import Dashboard from './pages/Dashboard';
import Games from './pages/Games';
import GameDetail from './pages/GameDetail';
import Accounts from './pages/Accounts';
import Levels from './pages/Levels';
import Requests from './pages/Requests';
import PurchaseEvents from './pages/PurchaseEvents';
import Events from './pages/Events';
import AccountDetail from './pages/AccountDetail';
import AccountFormPage from './pages/AccountFormPage';
import AccountsDetail from './pages/AccountsDetail';
import PurchaseEventDetail from './pages/PurchaseEventDetail';
import './i18n';

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <MainLayout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/games" element={<Games />} />
                <Route path="/games/:id" element={<GameDetail />} />
                <Route path="/accounts" element={<Accounts />} />
                <Route path="/accounts/:id" element={<AccountDetail />} />
                <Route path="/accounts/new" element={<AccountFormPage />} />
                <Route path="/accounts/edit/:id" element={<AccountFormPage />} />
                <Route path="/accounts/detail" element={<AccountsDetail />} />
                <Route path="/levels" element={<Levels />} />
                <Route path="/requests" element={<Requests />} />
                <Route path="/purchase-events" element={<PurchaseEvents />} />
                <Route path="/purchase-events/:id" element={<PurchaseEventDetail />} />
                <Route path="/events" element={<Events />} />
              </Routes>
            </MainLayout>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
