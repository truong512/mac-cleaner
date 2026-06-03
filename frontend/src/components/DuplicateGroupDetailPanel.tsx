import { model } from '../types';
import { formatBytes, basename } from '../utils/format';

function extrasInGroup(g: model.DuplicateGroup, keeper: string): number {
  return (g.paths || []).filter((p) => p !== keeper).length;
}

function reclaimableInGroup(g: model.DuplicateGroup, keeper: string): number {
  return g.sizeBytes * extrasInGroup(g, keeper);
}

type Props = {
  group: model.DuplicateGroup;
  keeper: string;
  onSelectKeeper: (path: string) => void;
};

export function DuplicateGroupDetailPanel({ group, keeper, onSelectKeeper }: Props) {
  const extras = extrasInGroup(group, keeper);
  const reclaimable = reclaimableInGroup(group, keeper);

  return (
    <div className="dup-detail">
      <div className="dup-header">
        <div className="dup-header-meta">
          <strong>{formatBytes(group.sizeBytes)}</strong>
          <span className="muted">{group.paths.length} copies</span>
          {extras > 0 && (
            <span className="muted">· {formatBytes(reclaimable)} reclaimable</span>
          )}
        </div>
      </div>
      <p className="muted dup-detail-hint">Choose the file to keep; other copies will be removed.</p>
      <div className="dup-detail-paths">
        {group.paths.map((p) => (
          <label key={p} className="file-row">
            <input
              type="radio"
              name={`keeper-${group.hash}`}
              checked={keeper === p}
              onChange={() => onSelectKeeper(p)}
            />
            <span className="file-meta">
              <span className="file-path">{p}</span>
              <span className="muted">{basename(p)}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
