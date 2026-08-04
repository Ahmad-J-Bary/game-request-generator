// Centralized proxy-state (region) color styles. New York is eggplant (dark
// purple) per request; the other states keep their established colors.
export const proxyStateBadgeClass = (state?: string): string => {
  switch (state) {
    case 'FLORIDA':
      return 'border-orange-500/50 text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400';
    case 'CALIFORNIA':
      return 'border-blue-500/50 text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400';
    case 'TEXAS':
      return 'border-red-500/50 text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400';
    case 'New York':
      return 'border-purple-500/50 text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400';
    case 'UK':
      return 'border-teal-500/50 text-teal-600 bg-teal-50 dark:bg-teal-900/20 dark:text-teal-400';
    default:
      return '';
  }
};

// Card tint for a request whose region color applies (middle positions).
export const proxyStateCardClass = (state?: string): string => {
  switch (state) {
    case 'FLORIDA':
      return 'bg-orange-500/10 border-orange-400/40 dark:bg-orange-500/15 dark:border-orange-400/50';
    case 'CALIFORNIA':
      return 'bg-blue-500/10 border-blue-400/40 dark:bg-blue-500/15 dark:border-blue-400/50';
    case 'TEXAS':
      return 'bg-red-500/10 border-red-400/40 dark:bg-red-500/15 dark:border-red-400/50';
    case 'New York':
      return 'bg-purple-500/10 border-purple-400/40 dark:bg-purple-500/15 dark:border-purple-400/50';
    case 'UK':
      return 'bg-teal-500/10 border-teal-400/40 dark:bg-teal-500/15 dark:border-teal-400/50';
    default:
      return 'bg-card border-border';
  }
};

// Dashboard regional distribution card styles.
export const proxyStateProgressClass = (state?: string): { color: string; iconColor: string; light: string } => {
  switch (state) {
    case 'FLORIDA':
      return { color: 'bg-orange-500', iconColor: 'text-orange-500', light: 'bg-orange-500/10' };
    case 'CALIFORNIA':
      return { color: 'bg-blue-500', iconColor: 'text-blue-500', light: 'bg-blue-500/10' };
    case 'TEXAS':
      return { color: 'bg-red-500', iconColor: 'text-red-500', light: 'bg-red-500/10' };
    case 'New York':
      return { color: 'bg-purple-800', iconColor: 'text-purple-800', light: 'bg-purple-800/10' };
    case 'UK':
      return { color: 'bg-teal-500', iconColor: 'text-teal-500', light: 'bg-teal-500/10' };
    default:
      return { color: 'bg-slate-500', iconColor: 'text-slate-500', light: 'bg-slate-500/10' };
  }
};
