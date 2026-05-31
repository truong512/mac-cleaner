import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ScanItem } from '../types';
import { formatBytes } from '../utils/format';
import { RiskBadge } from './RiskBadge';

const ROW_ESTIMATE_PX = 56;

type Props = {
  items: ScanItem[];
  onToggle: (id: string) => void;
  isSelected?: (id: string) => boolean;
};

export function VirtualScanFileList({
  items,
  onToggle,
  isSelected,
}: Props) {
  const rowSelected = isSelected ?? ((id: string) => items.find((i) => i.id === id)?.selected ?? false);
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 8,
    getItemKey: (index) => items[index]?.id ?? index,
  });

  if (!items.length) {
    return null;
  }

  return (
    <div ref={parentRef} className="file-list virtual-file-list">
      <div
        className="virtual-file-list-inner"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          if (!item) {
            return null;
          }
          return (
            <div
              key={item.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="virtual-file-row"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <label className="file-row">
                <input
                  type="checkbox"
                  checked={rowSelected(item.id)}
                  onChange={() => onToggle(item.id)}
                />
                <div className="file-meta">
                  <span className="file-path" title={item.path}>
                    {item.path}
                  </span>
                  <span className="muted">{item.categoryLabel}</span>
                </div>
                <RiskBadge risk={item.risk} />
                <span className="file-size">{formatBytes(item.sizeBytes)}</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
