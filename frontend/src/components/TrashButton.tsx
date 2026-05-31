interface Props {
  mode?: 'scan' | 'clean';
  label?: string;
  scanLabel?: string;
  cleanLabel?: string;
  runningLabel?: string;
  running: boolean;
  percent: number;
  scanned?: number;
  total?: number;
  disabled?: boolean;
  size?: 'md' | 'sm';
  onClick: () => void;
}

export function TrashButton({
  mode = 'clean',
  label,
  scanLabel = 'Scan',
  cleanLabel = 'Clean',
  runningLabel = 'Cancel',
  running,
  percent,
  scanned = 0,
  total = 0,
  disabled = false,
  size = 'md',
  onClick,
}: Props) {
  const btnSize = size === 'sm' ? 72 : 112;
  const stroke = running ? 4 : 3;
  const ringSize = btnSize;
  const center = ringSize / 2;
  const radius = center - stroke / 2;
  const circumference = 2 * Math.PI * radius;
  const displayPercent = running ? Math.min(100, Math.max(percent, percent > 0 ? percent : 12)) : 0;
  const dashOffset = circumference - (displayPercent / 100) * circumference;

  const idleLabel = label ?? (mode === 'scan' ? scanLabel : cleanLabel);
  const showCount = running && total > 0;
  const showScannedOnly = running && total <= 0 && scanned > 0;
  const showPercent = running && !showCount && !showScannedOnly && percent > 0;
  const centerLabel = showCount
    ? `${scanned}/${total}`
    : showScannedOnly
      ? scanned.toLocaleString()
      : showPercent
        ? `${Math.round(percent)}%`
        : running
          ? runningLabel
          : idleLabel;

  const indeterminate = running && percent <= 0;

  return (
    <button
      type="button"
      className={`trash-btn trash-btn-${size} trash-btn-${mode}${running ? ' trash-btn-running' : ''}${indeterminate ? ' trash-btn-indeterminate' : ''}`}
      style={{ width: btnSize, height: btnSize }}
      onClick={onClick}
      disabled={disabled && !running}
      aria-busy={running}
      aria-valuenow={showCount ? scanned : showScannedOnly ? scanned : showPercent ? Math.round(percent) : undefined}
      aria-valuemax={showCount ? total : showPercent ? 100 : undefined}
      title={running ? 'Click to cancel' : undefined}
    >
      <span className="trash-btn-donut-wrap" style={{ width: ringSize, height: ringSize }}>
        <svg
          className="trash-btn-donut"
          width={ringSize}
          height={ringSize}
          viewBox={`0 0 ${ringSize} ${ringSize}`}
          aria-hidden="true"
        >
          <circle
            className="trash-btn-donut-bg"
            cx={center}
            cy={center}
            r={radius}
            strokeWidth={stroke}
            fill="none"
          />
          {running && (
            <circle
              className="trash-btn-donut-fill"
              cx={center}
              cy={center}
              r={radius}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${center} ${center})`}
            />
          )}
        </svg>
      </span>
      <span className={`trash-btn-label${showCount || showScannedOnly || showPercent ? ' trash-btn-count' : ''}`}>
        {centerLabel}
      </span>
    </button>
  );
}
