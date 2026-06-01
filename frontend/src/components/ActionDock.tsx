import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

/** md TrashButton is 112px; notch radius = (diameter + 20) / 2 on screen */
const TRASH_BTN_SIZE = 112;
const NOTCH_PAD = 20;
const R_SCREEN = (TRASH_BTN_SIZE + NOTCH_PAD) / 2;
/** Shoulder fillet where flat dock top meets the notch (screen px) */
const FILLET_SCREEN = 10;
const VB_W = 1000;
const CX = VB_W / 2;
const PEAK = 0;
const FLOOR = 142;
const VB_H = FLOOR - PEAK + 1;

export function ActionDock({ children }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [renderSize, setRenderSize] = useState({ w: VB_W, h: VB_H });

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setRenderSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // preserveAspectRatio="none" scales X and Y independently; use elliptical arcs in
  // viewBox so they map to a true semicircle (radius R_SCREEN) on screen.
  const rx = (R_SCREEN * VB_W) / renderSize.w;
  const ry = (R_SCREEN * VB_H) / renderSize.h;
  const fx = (FILLET_SCREEN * VB_W) / renderSize.w;
  const fy = (FILLET_SCREEN * VB_H) / renderSize.h;
  const shoulder = ry;
  const left = CX - rx;
  const right = CX + rx;

  const topEdge = [
    `M 0 ${shoulder}`,
    `H ${left - fx}`,
    `A ${fx} ${fy} 0 0 0 ${left} ${shoulder - fy}`,
    `A ${rx} ${ry} 0 0 1 ${CX} ${PEAK}`,
    `A ${rx} ${ry} 0 0 1 ${right} ${shoulder - fy}`,
    `A ${fx} ${fy} 0 0 0 ${right + fx} ${shoulder}`,
    `H ${VB_W}`,
  ].join(' ');

  const dockPath = `${topEdge} V ${FLOOR} H 0 Z`;

  return (
    <footer className="action-dock" aria-label="Primary action">
      <svg
        ref={svgRef}
        className="action-dock-shape"
        viewBox={`0 ${PEAK - 1} ${VB_W} ${VB_H}`}
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
