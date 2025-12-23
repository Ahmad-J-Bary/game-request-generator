// src/components/tables/DataTableCell.tsx
import { TableCell } from '../ui/table';
import { cn } from '../../lib/utils';
import { CSSProperties } from 'react';

interface DataTableCellProps {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function DataTableCell({ children, className, style }: DataTableCellProps) {
  return (
    <TableCell className={cn('text-center', className)} style={style}>
      {children}
    </TableCell>
  );
}