import type { ScanFileListView } from '../utils/scanFileListView';

type Props = {
  value: ScanFileListView;
  onChange: (view: ScanFileListView) => void;
};

function TreeViewIcon() {
  return (
    <svg
      className="scan-file-view-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M4 3.5v9M4 6.5h5M4 10.5h5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="11.5" cy="6.5" r="1.25" fill="currentColor" />
      <circle cx="11.5" cy="10.5" r="1.25" fill="currentColor" />
      <circle cx="4" cy="3.5" r="1.25" fill="currentColor" />
    </svg>
  );
}

function FlatViewIcon() {
  return (
    <svg
      className="scan-file-view-icon"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M2 3.5h12M2 8h12M2 12.5h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ScanFileListViewToggle({ value, onChange }: Props) {
  return (
    <div className="scan-file-view-toggle" role="group" aria-label="File list view">
      <button
        type="button"
        className={`scan-file-view-btn${value === 'tree' ? ' active' : ''}`}
        aria-pressed={value === 'tree'}
        aria-label="Tree view"
        title="Tree view"
        onClick={() => onChange('tree')}
      >
        <TreeViewIcon />
      </button>
      <button
        type="button"
        className={`scan-file-view-btn${value === 'flat' ? ' active' : ''}`}
        aria-pressed={value === 'flat'}
        aria-label="Flat list view"
        title="Flat list view"
        onClick={() => onChange('flat')}
      >
        <FlatViewIcon />
      </button>
    </div>
  );
}
