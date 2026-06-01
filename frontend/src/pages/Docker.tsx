import { useEffect, useState } from 'react';
import {
  CancelOperation,
  DockerIsAvailable,
  DockerPrune,
  GetDockerDiskUsage,
  GetSettings,
} from '../../wailsjs/go/main/App';
import { model } from '../types';
import type { CleanupReport, DockerDiskUsage } from '../types';
import { formatBytes } from '../utils/format';
import { CleanupReportBanner } from '../components/CleanupReportBanner';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import { useOperationProgress } from '../hooks/useScanProgress';

export function DockerPage() {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<DockerDiskUsage | null>(null);
  const [opts, setOpts] = useState({ all: false, volumes: false, builder: true });
  const [loading, setLoading] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<CleanupReport | null>(null);
  const { active, kind } = useOperationProgress();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const ok = await DockerIsAvailable();
      setAvailable(ok);
      if (!ok) {
        setUsage(null);
        return;
      }
      const u = await GetDockerDiskUsage();
      setUsage(u);
      if (u.error) setError(u.error);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load Docker usage');
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
      setPruning(false);
      void load();
    });
  }, []);

  async function handlePrune(dryRun: boolean) {
    const settings = await GetSettings();
    if (!dryRun && settings.dryRunDefault) {
      const ok = window.confirm('Dry-run is enabled in Settings. Run Docker prune for real?');
      if (!ok) return;
    }
    if (!dryRun && opts.volumes) {
      const ok = window.confirm('Include unused volumes? This may delete data you still need.');
      if (!ok) return;
    }
    setPruning(true);
    DockerPrune(
      model.DockerPruneOptions.createFrom({
        all: opts.all,
        volumes: opts.volumes,
        builder: opts.builder,
      }),
      dryRun
    );
  }

  const busy = loading || pruning || (active && (kind === 'delete' || kind === 'scan'));
  const reclaimable =
    usage?.rows?.reduce((sum, r) => sum + (r.reclaimable || 0), 0) ?? 0;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1>Docker</h1>
          <p>Inspect Docker disk usage and prune unused resources</p>
        </div>
        <button className="btn btn-secondary" onClick={() => void load()} disabled={busy}>
          Refresh
        </button>
      </header>

      {error && <div className="alert alert-error">{error}</div>}
      {available === false && (
        <div className="alert alert-info">
          Docker CLI is not available. Install Docker Desktop and ensure <code>docker</code> is on your PATH.
        </div>
      )}

      {report && <CleanupReportBanner report={report} onDismiss={() => setReport(null)} />}

      <div className="page-body page-body-scroll">
        {available && usage && (
          <>
            <div className="card">
              <h3>Disk usage</h3>
              {reclaimable > 0 && (
                <p className="muted">Up to {formatBytes(reclaimable)} may be reclaimable (per Docker).</p>
              )}
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Total</th>
                    <th>Active</th>
                    <th>Reclaimable</th>
                  </tr>
                </thead>
                <tbody>
                  {(usage.rows || []).map((row) => (
                    <tr key={row.type}>
                      <td>{row.type}</td>
                      <td>{formatBytes(row.total)}</td>
                      <td>{row.active}</td>
                      <td>{formatBytes(row.reclaimable)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h3>Prune options</h3>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={opts.all}
                  onChange={(e) => setOpts({ ...opts, all: e.target.checked })}
                />
                <span>Remove all unused images (not just dangling)</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={opts.volumes}
                  onChange={(e) => setOpts({ ...opts, volumes: e.target.checked })}
                />
                <span>Include unused volumes (risky)</span>
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={opts.builder}
                  onChange={(e) => setOpts({ ...opts, builder: e.target.checked })}
                />
                <span>Prune build cache</span>
              </label>
              <div className="btn-row" style={{ marginTop: 16 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => void handlePrune(true)}
                  disabled={busy}
                >
                  Preview reclaimable
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => void handlePrune(false)}
                  disabled={busy}
                >
                  Run prune
                </button>
                {busy && (
                  <button className="btn btn-secondary" onClick={() => CancelOperation()}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
