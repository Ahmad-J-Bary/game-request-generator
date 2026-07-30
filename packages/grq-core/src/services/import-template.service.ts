// ===== Import Template Service =====

import { invoke } from "@tauri-apps/api/core";

export class ImportService {
  static async importRequestTemplates(gameId: number): Promise<{
    imported_templates: Array<{
      account_name: string;
      filename: string;
      status: string;
    }>;
    errors: string[];
    total_processed: number;
    successful_imports: number;
    cancelled?: boolean;
  }> {
    return await invoke("import_request_templates", { gameId });
  }
}
