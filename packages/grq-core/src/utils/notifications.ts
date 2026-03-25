import { toast } from 'sonner';

// ===== Notification Utilities =====

export interface NotificationOptions {
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export class NotificationService {
  /**
   * Show success notification
   */
  static success(message: string, options?: NotificationOptions) {
    return toast.success(message, {
      duration: options?.duration || 4000,
      action: options?.action,
    });
  }

  /**
   * Show error notification
   */
  static error(message: string, options?: NotificationOptions) {
    return toast.error(message, {
      duration: options?.duration || 5000,
      action: options?.action,
    });
  }

  /**
   * Show info notification
   */
  static info(message: string, options?: NotificationOptions) {
    return toast.info(message, {
      duration: options?.duration || 4000,
      action: options?.action,
    });
  }

  /**
   * Show warning notification
   */
  static warning(message: string, options?: NotificationOptions) {
    return toast.warning(message, {
      duration: options?.duration || 4000,
      action: options?.action,
    });
  }

  /**
   * Show loading notification (returns dismiss function)
   */
  static loading(message: string): () => void {
    const id = toast.loading(message);
    return () => toast.dismiss(id);
  }

  /**
   * Dismiss a specific toast
   */
  static dismiss(id: string | number) {
    toast.dismiss(id);
  }

  /**
   * Dismiss all toasts
   */
  static dismissAll() {
    toast.dismiss();
  }
}

// ===== CRUD Operations =====
export const Notifications = {
  create: {
    success: (entity: string) => NotificationService.success(`${entity} created successfully`),
    error: (entity: string) => NotificationService.error(`Failed to create ${entity.toLowerCase()}`),
  },
  update: {
    success: (entity: string) => NotificationService.success(`${entity} updated successfully`),
    error: (entity: string) => NotificationService.error(`Failed to update ${entity.toLowerCase()}`),
  },
  delete: {
    success: (entity: string) => NotificationService.success(`${entity} deleted successfully`),
    error: (entity: string) => NotificationService.error(`Failed to delete ${entity.toLowerCase()}`),
  },
  import: {
    success: (count: number, type: string) =>
      NotificationService.success(`Successfully imported ${count} ${type}`),
    error: () => NotificationService.error('Import failed'),
    confirmError: () => NotificationService.error('Failed to save imported data'),
  },
  export: {
    success: () => NotificationService.success('Data exported successfully'),
    error: () => NotificationService.error('Export failed'),
  },
  request: {
    generated: () => NotificationService.success('Requests generated successfully'),
    copied: () => NotificationService.success('Request copied to clipboard'),
    generateError: () => NotificationService.error('Failed to generate requests'),
  },
  task: {
    completed: () => NotificationService.success('Task marked as completed'),
    completeError: () => NotificationService.error('Error completing task'),
  },
  loading: (message: string) => NotificationService.loading(message),
  networkError: () => NotificationService.error('Network error. Please check your connection.'),
  serverError: () => NotificationService.error('Server error. Please try again later.'),
} as const;
