import { useEffect, useMemo, useRef, useState } from 'react';
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
      .filter((c: DirNode) => c.sizeBytes > 0)
      .sort((a: DirNode, b: DirNode) => b.sizeBytes - a.sizeBytes)
      .slice(0, 40);
  }, [node]);

  useEffect(() => {
    if (!ref.current) return;
    if (!chartRef.current) {
      chartRef.current = echarts.init(ref.current);
    }
    const chart = chartRef.current;

    chart.setOption({
      tooltip: {
        formatter: (info: any) => {
          const d = info.data;
          return `${d.name}<br/>${formatBytes(d.value)}`;
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
            value: c.sizeBytes,
            path: c.path,
            isDir: c.isDir,
            itemStyle: { color: colors[i % colors.length] },
          })),
        },
      ],
    });

    chart.off('click');
    chart.on('click', (params: any) => {
      const child = children.find((c: DirNode) => c.path === params.data?.path);
      if (child?.isDir) onDrill(child);
    });

    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [children, onDrill]);

  return <div ref={ref} className="treemap" />;
}
