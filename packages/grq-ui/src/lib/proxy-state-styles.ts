// Centralized proxy-state (region) color styles. Regions store a color KEY
// (e.g. 'orange', 'blue') in the DB; these helpers resolve keys to concrete
// Tailwind classes so user-created regions stay styled. Legacy state names
// (FLORIDA, CALIFORNIA, ...) still map to their established colors.

type ColorStyle = {
  badge: string;
  card: string;
  color: string;
  iconColor: string;
  light: string;
};

const COLOR_STYLES: Record<string, ColorStyle> = {
  pink: {
    badge: 'border-pink-500/50 text-pink-600 bg-pink-50 dark:bg-pink-900/20 dark:text-pink-400',
    card: 'bg-pink-500/10 border-pink-400/40 dark:bg-pink-500/15 dark:border-pink-400/50',
    color: 'bg-pink-500',
    iconColor: 'text-pink-500',
    light: 'bg-pink-500/10',
  },
  green: {
    badge: 'border-green-500/50 text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400',
    card: 'bg-green-500/10 border-green-400/40 dark:bg-green-500/15 dark:border-green-400/50',
    color: 'bg-green-500',
    iconColor: 'text-green-500',
    light: 'bg-green-500/10',
  },
  blue: {
    badge: 'border-blue-500/50 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400',
    card: 'bg-blue-500/10 border-blue-400/40 dark:bg-blue-500/15 dark:border-blue-400/50',
    color: 'bg-blue-500',
    iconColor: 'text-blue-500',
    light: 'bg-blue-500/10',
  },
  yellow: {
    badge: 'border-yellow-500/50 text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 dark:text-yellow-400',
    card: 'bg-yellow-500/10 border-yellow-400/40 dark:bg-yellow-500/15 dark:border-yellow-400/50',
    color: 'bg-yellow-500',
    iconColor: 'text-yellow-600',
    light: 'bg-yellow-500/10',
  },
  teal: {
    badge: 'border-teal-500/50 text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400',
    card: 'bg-teal-500/10 border-teal-400/40 dark:bg-teal-500/15 dark:border-teal-400/50',
    color: 'bg-teal-500',
    iconColor: 'text-teal-500',
    light: 'bg-teal-500/10',
  },
  orange: {
    badge: 'border-orange-500/50 text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400',
    card: 'bg-orange-500/10 border-orange-400/40 dark:bg-orange-500/15 dark:border-orange-400/50',
    color: 'bg-orange-500',
    iconColor: 'text-orange-500',
    light: 'bg-orange-500/10',
  },
  purple: {
    badge: 'border-purple-500/50 text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400',
    card: 'bg-purple-500/10 border-purple-400/40 dark:bg-purple-500/15 dark:border-purple-400/50',
    color: 'bg-purple-800',
    iconColor: 'text-purple-800',
    light: 'bg-purple-800/10',
  },
  red: {
    badge: 'border-red-500/50 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
    card: 'bg-red-500/10 border-red-400/40 dark:bg-red-500/15 dark:border-red-400/50',
    color: 'bg-red-500',
    iconColor: 'text-red-500',
    light: 'bg-red-500/10',
  },
  indigo: {
    badge: 'border-indigo-500/50 text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 dark:text-indigo-400',
    card: 'bg-indigo-500/10 border-indigo-400/40 dark:bg-indigo-500/15 dark:border-indigo-400/50',
    color: 'bg-indigo-500',
    iconColor: 'text-indigo-500',
    light: 'bg-indigo-500/10',
  },
  cyan: {
    badge: 'border-cyan-500/50 text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 dark:text-cyan-400',
    card: 'bg-cyan-500/10 border-cyan-400/40 dark:bg-cyan-500/15 dark:border-cyan-400/50',
    color: 'bg-cyan-500',
    iconColor: 'text-cyan-500',
    light: 'bg-cyan-500/10',
  },
};

const DEFAULT_STYLES: ColorStyle = {
  badge: '',
  card: 'bg-card border-border',
  color: 'bg-slate-500',
  iconColor: 'text-slate-500',
  light: 'bg-slate-500/10',
};

// Map legacy state names to color keys so existing callers (passing
// account.proxy_state directly) keep their established colors.
const LEGACY_STATE_COLOR: Record<string, string> = {
  FLORIDA: 'pink',
  CALIFORNIA: 'green',
  TEXAS: 'blue',
  'New York': 'yellow',
};

const resolveColorKey = (value?: string): string => {
  if (!value) return '';
  if (LEGACY_STATE_COLOR[value]) return LEGACY_STATE_COLOR[value];
  if (COLOR_STYLES[value]) return value;
  return '';
};

export const regionColorKey = (region?: { color?: string | null } | string): string => {
  if (typeof region === 'string') return resolveColorKey(region);
  if (!region?.color) return '';
  return COLOR_STYLES[region.color] ? region.color : '';
};

export const proxyStateBadgeClass = (state?: string): string =>
  COLOR_STYLES[resolveColorKey(state)]?.badge ?? DEFAULT_STYLES.badge;

// Card tint for a request whose region color applies (middle positions).
export const proxyStateCardClass = (state?: string): string =>
  COLOR_STYLES[resolveColorKey(state)]?.card ?? DEFAULT_STYLES.card;

// Dashboard regional distribution card styles.
export const proxyStateProgressClass = (state?: string): ColorStyle =>
  COLOR_STYLES[resolveColorKey(state)] ?? DEFAULT_STYLES;
