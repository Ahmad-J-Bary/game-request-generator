import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@grq/ui/lib/utils';

interface VirtualizedTaskListProps<T> {
  items: T[];
  enabled?: boolean;
  estimateSize?: number;
  overscan?: number;
  className?: string;
  virtualizedContainerClassName?: string;
  itemClassName?: string;
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
}

export function VirtualizedTaskList<T>({
  items,
  enabled = false,
  estimateSize = 260,
  overscan = 6,
  className,
  virtualizedContainerClassName,
  itemClassName,
  getItemKey,
  renderItem,
}: VirtualizedTaskListProps<T>) {
  const parentRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    enabled,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: index => getItemKey(items[index], index),
    measureElement: element => element?.getBoundingClientRect().height ?? estimateSize,
  });

  if (!enabled) {
    return (
      <div className={className}>
        {items.map((item, index) => (
          <div key={getItemKey(item, index)} className={itemClassName}>
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className={cn('max-h-[70vh] overflow-auto pr-2', virtualizedContainerClassName)}
    >
      <div
        className={cn('relative w-full', className)}
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map(virtualItem => {
          const item = items[virtualItem.index];

          return (
            <div
              key={getItemKey(item, virtualItem.index)}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              className={cn('absolute left-0 top-0 w-full', itemClassName)}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              {renderItem(item, virtualItem.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
