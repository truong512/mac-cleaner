import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type { ScanItem } from '../types';
import { formatBytes } from '../utils/format';
import { RiskBadge } from './RiskBadge';

const ROW_ESTIMATE_PX = 56;

type Props = {
  items: ScanItem[];
  onToggle: (id: string) => void;
};

export function VirtualScanFileList({ items, onToggle }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: 10,
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
          return (
            <div
              key={item.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="virtual-file-row"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <label className="file-row">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => onToggle(item.id)}
                />
                <div className="file-meta">
                  <span className="file-path">{item.path}</span>
                  <span className="muted">{item.categoryLabel}</span>
                </div>
                <RiskBadge risk={item.risk} />
                <span>{formatBytes(item.sizeBytes)}</span>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
