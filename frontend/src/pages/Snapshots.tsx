import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CancelOperation,
  DeleteLocalSnapshots,
  ListLocalSnapshots,
} from '../../wailsjs/go/main/App';
import type { CleanupReport, LocalSnapshot } from '../types';
import { CleanupReportBanner } from '../components/CleanupReportBanner';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { useOperationProgress } from '../hooks/useScanProgress';

export function Snapshots() {
  const [snapshots, setSnapshots] = useState<LocalSnapshot[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<CleanupReport | null>(null);
  const { active, kind } = useOperationProgress();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const list = await ListLocalSnapshots('/');
      setSnapshots(list || []);
      setSelected(new Set());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to list snapshots');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    return EventsOn('cleanup:done', (r: CleanupReport) => {
      setReport(r);
      setDeleting(false);
      void load();
    });
  }, []);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(snapshots.map((s) => s.name)));
  }

  async function handleDelete() {
    const names = [...selected];
    if (names.length === 0) return;
    const ok = window.confirm(
      `Delete ${names.length} local Time Machine snapshot(s)? This cannot be undone except via Time Machine restore.`
    );
    if (!ok) return;
    setDeleting(true);
    DeleteLocalSnapshots(names);
  }

  const busy = loading || deleting || (active && kind === 'delete');

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Local Snapshots</h1>
          <p>APFS local Time Machine snapshots on your startup volume</p>
        </div>
        <div className="btn-row">
          <Link to="/" className="btn btn-secondary">
            Dashboard
          </Link>
          <button className="btn btn-secondary" onClick={() => void load()} disabled={busy}>
            Refresh
          </button>
        </div>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      <div className="alert alert-warning">
        Deleting snapshots frees space immediately. Recovery requires an existing Time Machine backup.
      </div>

      {report && <CleanupReportBanner report={report} onDismiss={() => setReport(null)} />}

      <div className="page-body page-body-scroll">
        <div className="card">
          <div className="toolbar">
            <span>
              <strong>{snapshots.length}</strong> snapshot(s)
              {selected.size > 0 && ` · ${selected.size} selected`}
            </span>
            <div className="btn-row">
              <button className="btn btn-secondary btn-sm" onClick={selectAll} disabled={!snapshots.length}>
                Select all
              </button>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void handleDelete()}
                disabled={selected.size === 0 || busy}
              >
                Delete selected
              </button>
              {busy && (
                <button className="btn btn-secondary btn-sm" onClick={() => CancelOperation()}>
                  Cancel
                </button>
              )}
            </div>
          </div>
          {loading && <p className="muted">Loading snapshots…</p>}
          {!loading && snapshots.length === 0 && (
            <p className="muted">No local snapshots found on /.</p>
          )}
          <ul className="snapshot-list">
            {snapshots.map((s) => (
              <li key={s.name} className="snapshot-row">
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={selected.has(s.name)}
                    onChange={() => toggle(s.name)}
                  />
                  <span>
                    <strong>{s.name}</strong>
                    {s.date && <small className="muted"> · {new Date(s.date).toLocaleString()}</small>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
