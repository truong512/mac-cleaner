import { useEffect } from 'react';

interface Props {
  summary: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ summary, onConfirm, onCancel }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div className="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="confirm-dialog card">
        <h3 id="confirm-title">Confirm cleanup</h3>
        <p>{summary}</p>
        <p className="muted">Items will be moved to Trash.</p>
        <div className="btn-row confirm-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            Move to Trash
          </button>
        </div>
      </div>
    </div>
  );
}
