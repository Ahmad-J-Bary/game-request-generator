// src/components/progress/ProgressProvider.tsx
import { useState, useEffect } from "react";
import { TauriService } from "@grq/core/services/tauri.service";
import type {
  AccountLevelProgress,
  AccountPurchaseEventProgress,
} from "@grq/api-bindings/types/progress.types";

interface ProgressProviderProps {
  accounts: Array<{ id: number }>;
  children: (data: {
    levelsProgress: Record<string, AccountLevelProgress>;
    purchaseProgress: Record<string, AccountPurchaseEventProgress>;
  }) => React.ReactNode;
}

export function ProgressProvider({
  accounts,
  children,
}: ProgressProviderProps) {
  const [progressData, setProgressData] = useState({
    levelsProgress: {} as Record<string, AccountLevelProgress>,
    purchaseProgress: {} as Record<string, AccountPurchaseEventProgress>,
  });

  useEffect(() => {
    const fetchProgressData = async () => {
      const levelsProgress: Record<string, AccountLevelProgress> = {};
      const purchaseProgress: Record<string, AccountPurchaseEventProgress> = {};

      // الحصول على بيانات التقدم لجميع الحسابات
      for (const account of accounts) {
        try {
          const [levelsProgressData, purchaseProgressData] = await Promise.all([
            TauriService.getAccountLevelProgress(account.id),
            TauriService.getAccountPurchaseEventProgress(account.id),
          ]);

          // تخزين بيانات التقدم لكل مستوى وحدث شراء
          levelsProgressData.forEach((p) => {
            const key: string = `${account.id}_${p.level_id}`;
            levelsProgress[key] = p;
          });

          purchaseProgressData.forEach((p) => {
            const key: string = `${account.id}_${p.purchase_event_id}`;
            purchaseProgress[key] = p;
          });
        } catch (error) {
          console.error(
            `Failed to fetch progress for account ${account.id}:`,
            error,
          );
        }
      }

      setProgressData({ levelsProgress, purchaseProgress });
    };

    fetchProgressData();

    // الاستماع لتحديثات التقدم
    const handleProgressUpdate = (event: any) => {
      const accountIdOrIds = event?.detail?.accountId;

      // If no specific account is provided, refresh all visible accounts.
      if (accountIdOrIds === undefined || accountIdOrIds === null) {
        fetchProgressData();
        return;
      }

      // Support both:
      // - single accountId: number
      // - multiple accountIds: number[]
      const ids = Array.isArray(accountIdOrIds)
        ? accountIdOrIds
        : [accountIdOrIds];

      // Refresh only when at least one provided id belongs to current accounts set.
      if (ids.some((id) => accounts.some((acc) => acc.id === id))) {
        fetchProgressData();
      }
    };

    window.addEventListener("progress-updated", handleProgressUpdate);

    return () => {
      window.removeEventListener("progress-updated", handleProgressUpdate);
    };
  }, [accounts]);

  return children(progressData);
}
