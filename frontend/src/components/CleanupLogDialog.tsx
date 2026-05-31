import { useEffect, useState } from 'react';
import { GetAuditLogPath, GetRecentAuditLog, OpenAuditLog } from '../../wailsjs/go/main/App';
import type { AuditLogEntry, CleanupReport } from '../types';

type Props = {
  report: CleanupReport;
  onClose: () => void;
};

export function CleanupLogDialog({ report, onClose }: Props) {
  const [auditPath, setAuditPath] = useState('');
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openError, setOpenError] = useState('');

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([GetAuditLogPath(), GetRecentAuditLog(200)])
      .then(([path, log]) => {
        if (cancelled) return;
        setAuditPath(path);
        setEntries(log || []);
      })
      .catch(() => {
        if (!cancelled) setEntries([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const failures = report.failures?.length
    ? report.failures
    : (report.failedPaths || []).map((path) => ({ path, error: '' }));

  const failedFromAudit = entries.filter((e) => !e.success);

  async function handleOpenLog() {
    setOpenError('');
    try {
      await OpenAuditLog();
    } catch (e: any) {
      setOpenError(e?.message || 'Could not open audit log');
    }
  }

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="cleanup-log-title">
      <div className="confirm-dialog card cleanup-log-dialog">
        <h3 id="cleanup-log-title">Cleanup log</h3>
        <p className="muted">
          {report.failed} item{report.failed === 1 ? '' : 's'} could not be moved to Trash.
        </p>

        {failures.length > 0 && (
          <>
            <h4 className="cleanup-log-section">This run</h4>
            <ul className="cleanup-log-list">
              {failures.map((f) => (
                <li key={f.path}>
                  <code className="code-block">{f.path}</code>
                  {f.error ? <span className="cleanup-log-error">{f.error}</span> : null}
                </li>
              ))}
            </ul>
          </>
        )}

        {!loading && failedFromAudit.length > 0 && (
          <>
            <h4 className="cleanup-log-section">Recent audit entries</h4>
            <ul className="cleanup-log-list cleanup-log-list-compact">
              {failedFromAudit.slice(-50).map((e, i) => (
                <li key={`${e.path}-${e.timestamp}-${i}`}>
                  <code className="code-block">{e.path}</code>
                  {e.error ? <span className="cleanup-log-error">{e.error}</span> : null}
                  {e.timestamp ? <span className="muted">{e.timestamp}</span> : null}
                </li>
              ))}
            </ul>
          </>
        )}

        {loading && <p className="muted">Loading audit log…</p>}

        {!loading && failures.length === 0 && failedFromAudit.length === 0 && (
          <p className="muted">No failure details recorded. Check the audit log file on disk.</p>
        )}

        {auditPath && (
          <p className="muted cleanup-log-path">
            Log file: <code className="code-block">{auditPath}</code>
          </p>
        )}

        {openError && <p className="cleanup-log-error">{openError}</p>}

        <div className="btn-row confirm-actions">
          <button type="button" className="btn btn-secondary" onClick={handleOpenLog}>
            Open log file
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
