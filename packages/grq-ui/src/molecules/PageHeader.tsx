import { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  titleExtra?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, titleExtra, children }: PageHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 bg-background/80 backdrop-blur-md z-30 p-2 rounded-lg border border-border/50">
      <div className="flex-1 min-w-0 space-y-1 px-2">
        <div className="flex items-center gap-3">
          <h1 className="text-xl md:text-2xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent truncate">
            {title}
          </h1>
          {titleExtra}
        </div>
        {subtitle && (
          <p className="text-xs md:text-sm text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>

      {children && (
        <div className="flex items-center gap-2 self-end md:self-auto px-2">
          {children}
        </div>
      )}
    </div>
  );
}
