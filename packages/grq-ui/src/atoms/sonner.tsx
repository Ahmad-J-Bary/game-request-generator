import { useTheme } from 'next-themes';
import { Toaster as Sonner, toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className="toaster group"
      position="bottom-right"
      expand={false}
      visibleToasts={4}
      gap={8}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background/80 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-foreground group-[.toaster]:border-border/60 group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:p-3',
          error:
            'group-[.toaster]:bg-red-500/5 group-[.toaster]:border-red-500/25 group-[.toaster]:text-foreground',
          success:
            'group-[.toaster]:bg-emerald-500/5 group-[.toaster]:border-emerald-500/25 group-[.toaster]:text-foreground',
          warning:
            'group-[.toaster]:bg-amber-500/5 group-[.toaster]:border-amber-500/25 group-[.toaster]:text-foreground',
          info:
            'group-[.toaster]:bg-primary/5 group-[.toaster]:border-primary/25 group-[.toaster]:text-foreground',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          closeButton:
            'group-[.toast]:bg-background/80 group-[.toast]:backdrop-blur-xl group-[.toast]:border-border/40',
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
