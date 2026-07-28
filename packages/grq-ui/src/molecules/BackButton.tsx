import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@grq/ui/atoms/button';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  to?: string;
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  children?: React.ReactNode;
}

export function BackButton({ to, variant = 'ghost', size, className, children }: BackButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleClick = () => {
    if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <Button variant={variant} size={size} className={`shrink-0 ${className || ''}`} onClick={handleClick}>
      {children || (
        <>
          <ArrowLeft className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
          <span className="hidden xs:inline">{t('common.back')}</span>
        </>
      )}
    </Button>
  );
}

