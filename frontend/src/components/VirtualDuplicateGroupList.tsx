import { useCallback, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { model } from '../types';
import { formatBytes, basename } from '../utils/format';

function estimateGroupHeight(g: model.DuplicateGroup): number {
  const pathCount = g.paths?.length ?? 2;
  return 32 + 36 + pathCount * 48 + 12;
}

type Props = {
  groups: model.DuplicateGroup[];
  keepers: Record<string, string>;
  onSelectKeeper: (hash: string, path: string) => void;
};

export function VirtualDuplicateGroupList({ groups, keepers, onSelectKeeper }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const getEstimateSize = useCallback(
    (index: number) => estimateGroupHeight(groups[index]),
    [groups]
  );

  const virtualizer = useVirtualizer({
    count: groups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: getEstimateSize,
    overscan: 5,
  });

  if (!groups.length) {
    return null;
  }

  return (
    <div ref={parentRef} className="dup-groups virtual-dup-groups">
      <div
        className="virtual-dup-list-inner"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const g = groups[virtualRow.index];
          const keeper = keepers[g.hash] || g.keeper;
          return (
            <div
              key={g.hash}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="virtual-dup-row"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <div className="card dup-group">
                <div className="dup-header">
                  <strong>{formatBytes(g.sizeBytes)}</strong>
                  <span className="muted">{g.paths.length} copies</span>
                </div>
                {g.paths.map((p: string) => (
                  <label key={p} className="file-row">
                    <input
                      type="radio"
                      name={`keeper-${g.hash}`}
                      checked={keeper === p}
                      onChange={() => onSelectKeeper(g.hash, p)}
                    />
                    <span className="file-path">{p}</span>
                    <span className="muted">{basename(p)}</span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
