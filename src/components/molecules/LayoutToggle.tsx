import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';

export type Layout = 'vertical' | 'horizontal';

interface LayoutToggleProps {
  layout: Layout;
  onLayoutChange: (layout: Layout) => void;
  className?: string;
}

export function LayoutToggle({ layout, onLayoutChange, className }: LayoutToggleProps) {
  const { t } = useTranslation();

  return (
    <Select value={layout} onValueChange={(v) => onLayoutChange(v as Layout)}>
      <SelectTrigger className={className || 'w-[160px]'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="vertical">{t('levels.viewVertical')}</SelectItem>
        <SelectItem value="horizontal">{t('levels.viewHorizontal')}</SelectItem>
      </SelectContent>
    </Select>
  );
}

