import { useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { model } from '../types';
import { formatBytes, basename } from '../utils/format';

const ROW_HEIGHT = 52;

type Props = {
  groups: model.DuplicateGroup[];
  keepers: Record<string, string>;
  selectedHash: string | null;
  checkedHashes: Set<string>;
  onSelect: (hash: string) => void;
  onToggleCheck: (hash: string, checked: boolean) => void;
};

function groupFileName(g: model.DuplicateGroup, keepers: Record<string, string>): string {
  const path = keepers[g.hash] || g.keeper || g.paths?.[0];
  return path ? basename(path) : 'Unknown';
}

export function DuplicateGroupListPanel({
  groups,
  keepers,
  selectedHash,
  checkedHashes,
  onSelect,
  onToggleCheck,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const getEstimateSize = useCallback(() => ROW_HEIGHT, []);

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getEstimateSize,
    overscan: 8,
    getItemKey: (index) => groups[index]?.hash ?? index,
  });

  if (!groups.length) {
    return null;
  }

  return (
    <div ref={parentRef} className="dup-group-list virtual-dup-group-list">
      <div
        className="virtual-dup-group-list-inner"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const g = groups[virtualRow.index];
          const active = g.hash === selectedHash;
          const checked = checkedHashes.has(g.hash);
          return (
            <div
              key={g.hash}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="virtual-dup-group-row"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div
                role="button"
                tabIndex={0}
                className={`dup-list-row list-row-selectable${active ? ' list-row-active' : ''}`}
                onClick={() => onSelect(g.hash)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(g.hash);
                  }
                }}
              >
                <label
                  className="dup-list-check"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={`Select ${groupFileName(g, keepers)}`}
                    onChange={(e) => onToggleCheck(g.hash, e.target.checked)}
                  />
                </label>
                <span className="list-row-label dup-list-name" title={groupFileName(g, keepers)}>
                  {groupFileName(g, keepers)}
                </span>
                <span className="dup-list-meta muted">
                  {formatBytes(g.sizeBytes)} · {g.paths.length} copies
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
