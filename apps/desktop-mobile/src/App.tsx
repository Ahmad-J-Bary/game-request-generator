import { useEffect, useRef } from "react";

import { getCurrentWindow } from "@tauri-apps/api/window";

import { Toaster } from "@grq/ui/atoms/sonner";
import { TooltipProvider } from "@grq/ui/atoms/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import { ThemeProvider } from "@grq/ui/contexts/ThemeContext";
import { LanguageProvider } from "@grq/core/contexts/LanguageContext";
import { SettingsProvider } from "@grq/ui/contexts/SettingsContext";
import { MainLayout } from "@grq/ui/templates/MainLayout";
import { useGames } from "@grq/core/hooks/useGames";
import { TauriService } from "@grq/core/services/tauri.service";
import Dashboard from "./pages/Dashboard";
// Accounts
import AccountListPage from "./pages/accounts/AccountListPage";
import AccountDetailPage from "./pages/accounts/AccountDetailPage";
import AccountFormPage from "./pages/accounts/AccountFormPage";
// Games
import GameListPage from "./pages/games/GameListPage";
import GameDetailPage from "./pages/games/GameDetailPage";
// Progress
import AccountsDetailPage from "./pages/progress/AccountsDetailPage";
// Daily Tasks
import DailyTasksPage from "./pages/daily-tasks/DailyTasksPage";
import HistoryReportPage from "./pages/daily-tasks/HistoryReportPage";
// Settings
import SettingsPage from "./pages/SettingsPage";
import "./i18n";

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

function AppContent() {
  const isHandlingCloseRef = useRef(false);
  const allowCloseRef = useRef(false);

  useEffect(() => {
    const win = getCurrentWindow();

    const unlistenPromise = win.onCloseRequested(async (event) => {
      if (allowCloseRef.current) return;
      event.preventDefault();

      // Notify backend/front listeners that we intentionally intercepted this close request.
      // This helps avoid duplicate close attempts from external listeners.
      window.dispatchEvent(new CustomEvent("app-close-flow-started"));

      if (isHandlingCloseRef.current) return;
      isHandlingCloseRef.current = true;

      try {
        // Automatic mode:
        // If DB changed in this app session, backup will run in background before quit.
        // If unchanged, app exits immediately.
        allowCloseRef.current = true;
        await TauriService.runBackupIfChangedInBackgroundAndQuit();
      } catch (error) {
        console.error("Close flow failed:", error);
        // Final fallback: force close from backend to avoid hanging.
        try {
          allowCloseRef.current = true;
          await TauriService.finalizeExitMaintenanceAndQuit();
        } catch (fallbackError) {
          console.error("Fallback close failed:", fallbackError);
        }
      } finally {
        isHandlingCloseRef.current = false;
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  return (
    <>
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
                      <Route
                        path="/games/:id"
                        element={<GameDetailPageWrapper />}
                      />
                      <Route path="/accounts" element={<AccountListPage />} />
                      <Route
                        path="/accounts/:id"
                        element={<AccountDetailPage />}
                      />
                      <Route
                        path="/accounts/new"
                        element={<AccountFormPage />}
                      />
                      <Route
                        path="/accounts/edit/:id"
                        element={<AccountFormPage />}
                      />
                      <Route
                        path="/accounts/detail"
                        element={<AccountsDetailPage />}
                      />
                      <Route path="/daily-tasks" element={<DailyTasksPage />} />
                      <Route path="/history" element={<HistoryReportPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route
                        path="/settings/appearance"
                        element={<SettingsPage section="appearance" />}
                      />
                      <Route
                        path="/settings/database"
                        element={<SettingsPage section="database" />}
                      />
                      <Route
                        path="/settings/proxy"
                        element={<SettingsPage section="proxy" />}
                      />
                      <Route
                        path="/settings/telegram"
                        element={<SettingsPage section="telegram" />}
                      />
                      <Route
                        path="/settings/sync"
                        element={<SettingsPage section="sync" />}
                      />
                    </Routes>
                  </MainLayout>
                </BrowserRouter>
              </TooltipProvider>
            </SettingsProvider>
          </LanguageProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </>
  );
}

const App = () => <AppContent />;

export default App;
