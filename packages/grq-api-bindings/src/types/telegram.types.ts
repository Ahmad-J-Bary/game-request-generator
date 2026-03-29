// src/types/telegram.types.ts

export interface TelegramImportPreview {
  update_id: number;
  message_id: number;
  file_id: string;
  filename: string;
  sender_name: string;
  date: string;
  caption?: string;
}

export interface TelegramConfig {
  bot_token?: string;
  chat_id?: string;
  enabled: boolean;
  auto_send: boolean;
  last_offset?: number;
}
