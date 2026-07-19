import { useEffect, type ReactNode, type RefObject } from "react";
import { useVirtualizer, type Virtualizer } from "@tanstack/react-virtual";

export const MOD_ROW_ESTIMATE_PX = 84;

export function useModListVirtualizer(count: number, scrollRef: RefObject<HTMLDivElement | null>) {
  return useVirtualizer({
    count,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => MOD_ROW_ESTIMATE_PX,
    overscan: 10,
  });
}

interface VirtualModRowsProps<T> {
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  items: T[];
  getItemKey: (item: T, index: number) => string;
  onVisibleRangeChange?: (startIndex: number, endIndex: number) => void;
  renderItem: (item: T, index: number) => ReactNode;
}

export function VirtualModRows<T>({
  virtualizer,
  items,
  getItemKey,
  onVisibleRangeChange,
  renderItem,
}: VirtualModRowsProps<T>) {
  const virtualItems = virtualizer.getVirtualItems();
  const rangeStart = virtualItems[0]?.index;
  const rangeEnd = virtualItems[virtualItems.length - 1]?.index;

  useEffect(() => {
    if (!onVisibleRangeChange || rangeStart === undefined || rangeEnd === undefined) return;
    onVisibleRangeChange(rangeStart, rangeEnd);
  }, [onVisibleRangeChange, rangeStart, rangeEnd]);

  if (items.length === 0) return null;

  return (
    <div
      className="relative w-full"
      style={{ height: `${virtualizer.getTotalSize()}px` }}
    >
      {virtualItems.map(virtualRow => {
        const item = items[virtualRow.index];
        return (
          <div
            key={getItemKey(item, virtualRow.index)}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${virtualRow.start}px)` }}
          >
            {renderItem(item, virtualRow.index)}
          </div>
        );
      })}
    </div>
  );
}
