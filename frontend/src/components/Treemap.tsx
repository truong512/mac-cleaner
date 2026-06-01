import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts';
import type { DirNode } from '../types';
import { formatBytes } from '../utils/format';

interface Props {
  node: DirNode;
  onDrill: (node: DirNode) => void;
}

const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6', '#ef4444'];

export function Treemap({ node, onDrill }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  const children = useMemo(() => {
    return (node.children || [])
      .filter((c: DirNode) => c.isDir || c.sizeBytes > 0)
      .sort((a: DirNode, b: DirNode) => b.sizeBytes - a.sizeBytes)
      .slice(0, 40);
  }, [node]);

  const treemapValue = (c: DirNode) => Math.max(c.sizeBytes, c.isDir ? 1 : 0);

  useEffect(() => {
    if (!ref.current) return;
    if (!chartRef.current) {
      chartRef.current = echarts.init(ref.current);
    }
    const chart = chartRef.current;

    if (!children.length) {
      chart.clear();
      return;
    }

    chart.setOption({
      tooltip: {
        formatter: (info: unknown) => {
          const p = Array.isArray(info) ? info[0] : info;
          const row = (p as { data?: { name?: string; value?: number }; name?: string; value?: number }) ?? {};
          const d = row.data ?? row;
          const name = d.name ?? '';
          const value = typeof d.value === 'number' ? d.value : 0;
          if (!name) {
            return '';
          }
          return `${name}<br/>${formatBytes(value)}`;
        },
      },
      series: [
        {
          type: 'treemap',
          roam: false,
          nodeClick: false,
          breadcrumb: { show: false },
          label: { show: true, formatter: '{b}' },
          upperLabel: { show: false },
          itemStyle: { borderColor: '#0f1117', borderWidth: 2, gapWidth: 2 },
          data: children.map((c: DirNode, i: number) => ({
            name: c.name,
            value: treemapValue(c),
            path: c.path,
            isDir: c.isDir,
            itemStyle: { color: colors[i % colors.length] },
          })),
        },
      ],
    });

    chart.off('click');
    chart.on('click', (raw: unknown) => {
      const path = (raw as { data?: { path?: string } }).data?.path;
      if (!path) {
        return;
      }
      const child = children.find((c: DirNode) => c.path === path);
      if (child?.isDir) {
        onDrill(child);
      }
    });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [children, onDrill]);

  return (
    <div className="treemap-wrap">
      <div ref={ref} className="treemap" />
      {!children.length && (
        <p className="treemap-empty muted">
          No items to chart here. Use Open on folders in the list, or scan again from a deeper root.
        </p>
      )}
    </div>
  );
}
