export const APP_NAME = 'Game Request Generator';
export const APP_VERSION = '1.0.0';

export const DATE_FORMAT = 'yyyy-MM-dd';
export const TIME_FORMAT = 'HH:mm';
export const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';

export const STORAGE_KEYS = {
  THEME: 'theme',
  LANGUAGE: 'language',
  LAST_SELECTED_GAME: 'last_selected_game',
  LAST_SELECTED_ACCOUNT: 'last_selected_account',
} as const;

export const ROUTES = {
  DASHBOARD: '/',
  GAMES: '/games',
  ACCOUNTS: '/accounts',
  LEVELS: '/levels',
  DAILY_TASKS: '/daily-tasks',
  EVENTS: '/events',
} as const;

export const REQUEST_PLACEHOLDERS = {
  EVENT_TOKEN: 'event_token=XXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  TIME_SPENT: 'time_spent=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
} as const;