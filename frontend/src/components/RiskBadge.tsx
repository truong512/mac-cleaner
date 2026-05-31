const styles: Record<string, string> = {
  safe: 'badge badge-safe',
  moderate: 'badge badge-moderate',
  risky: 'badge badge-risky',
  manual: 'badge badge-manual',
};

export function RiskBadge({ risk }: { risk: string }) {
  return <span className={styles[risk]}>{risk}</span>;
}
