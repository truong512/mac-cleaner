import { useState } from 'react';
import type { CleanupReport } from '../types';
import { formatBytes } from '../utils/format';
import { CleanupLogDialog } from './CleanupLogDialog';

type Props = {
  report: CleanupReport;
  onDismiss?: () => void;
};

export function CleanupReportBanner({ report, onDismiss }: Props) {
  const [showLog, setShowLog] = useState(false);
  const hasFailed = !report.dryRun && report.failed > 0;
  const alertClass = hasFailed ? 'alert alert-error' : 'alert alert-info';

  return (
    <>
      <div className={alertClass}>
        <div className="cleanup-report-summary">
          <span>
            {report.dryRun ? 'Dry run' : 'Cleanup'}: {report.deleted} deleted, {report.failed} failed
            {report.dryRun ? '' : ` · ${formatBytes(report.totalBytes)} processed`}
          </span>
          <div className="btn-row">
            {hasFailed && (
              <button type="button" className="link-btn" onClick={() => setShowLog(true)}>
                View log
              </button>
            )}
            {onDismiss && (
              <button type="button" className="link-btn" onClick={onDismiss}>
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
      {showLog && (
        <CleanupLogDialog report={report} onClose={() => setShowLog(false)} />
      )}
    </>
  );
}
