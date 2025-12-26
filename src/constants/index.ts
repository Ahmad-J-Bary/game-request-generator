// ===== Application Constants =====

// File extensions
export const FILE_EXTENSIONS = {
  EXCEL: ['xlsx', 'xls'],
  TEXT: ['txt'],
} as const;

// Import types
export const IMPORT_TYPES = {
  EXCEL: 'excel',
  REQUEST_TEMPLATES: 'request-templates',
} as const;

// Request types
export const REQUEST_TYPES = {
  SESSION: 'session',
  EVENT: 'event',
  PURCHASE_EVENT: 'purchase_event',
} as const;

// HTTP methods
export const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
} as const;

// Time constants (in milliseconds)
export const TIME_CONSTANTS = {
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
} as const;

// Request template patterns
export const TEMPLATE_PATTERNS = {
  EVENT_TOKEN: '&event_token=',
  TIME_SPENT: '&time_spent=',
} as const;

// Date formats
export const DATE_FORMATS = {
  ISO: 'YYYY-MM-DD',
  DISPLAY: 'DD/MM/YYYY',
  API: 'YYYY-MM-DDTHH:mm:ssZ',
} as const;

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_PAGE_SIZE: 100,
} as const;

// Validation constants
export const VALIDATION = {
  MAX_ACCOUNT_NAME_LENGTH: 100,
  MAX_GAME_NAME_LENGTH: 100,
  MAX_LEVEL_NAME_LENGTH: 50,
  MIN_DAYS_OFFSET: 0,
  MAX_DAYS_OFFSET: 365,
  MIN_TIME_SPENT: 0,
  MAX_TIME_SPENT: 1000000, // 1M seconds = ~11.5 days
} as const;

// Color schemes for different data types
export const COLOR_SCHEMES = {
  LEVEL_BONUS: '#10B981',     // Green
  LEVEL_NORMAL: '#3B82F6',    // Blue
  PURCHASE_RESTRICTED: '#F59E0B',   // Amber
  PURCHASE_UNRESTRICTED: '#8B5CF6', // Violet
  COMPLETED: '#10B981',       // Green
  PENDING: '#F59E0B',         // Amber
} as const;
