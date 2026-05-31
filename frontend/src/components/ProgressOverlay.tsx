import { CancelScan } from '../../wailsjs/go/main/App';
import type { ScanProgress } from '../types';
import type { OperationKind } from '../hooks/useScanProgress';

interface Props {
  progress: ScanProgress | null;
  visible: boolean;
  kind?: OperationKind;
}

export function ProgressOverlay({ progress, visible, kind = 'scan' }: Props) {
  if (!visible || !progress || kind === 'delete') return null;

  const title = progress.message || progress.phase;
  const scanned = progress.scanned ?? 0;
  const total = progress.total ?? 0;
  const showBar = total > 0;
  const showScanned = !showBar && scanned > 0;
  const percent = Math.min(100, Math.max(0, progress.percent || 0));

  return (
    <div className="progress-banner" role="status" aria-live="polite">
      <div className="progress-banner-main">
        <div className="spinner spinner-sm" aria-hidden="true" />
        <div className="progress-banner-text">
          <strong>{title}</strong>
          <span className="progress-path" title={progress.currentPath || undefined}>
            {progress.currentPath || '\u00A0'}
          </span>
        </div>
        {showBar && (
          <div className="progress-bar-wrap progress-bar-inline">
            <div className="progress-bar-track">
              <div className="progress-bar-fill" style={{ width: `${percent}%` }} />
            </div>
            <span className="progress-count">
              {scanned.toLocaleString()} / {total.toLocaleString()}
            </span>
          </div>
        )}
        {showScanned && (
          <span className="progress-count progress-count-inline">
            {scanned.toLocaleString()} files scanned
          </span>
        )}
        <button className="btn btn-secondary btn-sm" onClick={() => CancelScan()}>
          Cancel
        </button>
      </div>
    </div>
  );
}
