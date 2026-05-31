import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

/** 112px button → 56px radius, geometry in 1000-wide viewBox */
const R = 56;
const CX = 500;
const SHOULDER = 56;
const LEFT = CX - R;
const RIGHT = CX + R;
const PEAK = SHOULDER - R;
const FLOOR = 132;

export function ActionDock({ children }: Props) {
  const topEdge = [
    `M 0 ${SHOULDER}`,
    `H ${LEFT}`,
    `A ${R} ${R} 0 0 1 ${CX} ${PEAK}`,
    `A ${R} ${R} 0 0 1 ${RIGHT} ${SHOULDER}`,
    `H 1000`,
  ].join(' ');

  const dockPath = `${topEdge} V ${FLOOR} H 0 Z`;

  return (
    <footer className="action-dock" aria-label="Primary action">
      <svg
        className="action-dock-shape"
        viewBox={`0 ${PEAK - 1} 1000 ${FLOOR - PEAK + 1}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path className="action-dock-path" d={dockPath} />
        <path className="action-dock-edge" d={topEdge} />
      </svg>
      <div className="action-dock-slot">{children}</div>
    </footer>
  );
}
