import { useEffect, useRef } from 'react';
import { RiskBadge } from './RiskBadge';
import { formatBytes } from '../utils/format';
import type { CategoryRow } from '../utils/scanItems';

function CategorySelectCheckbox({
  categoryId,
  label,
  itemCount,
  selectedCount,
  onToggle,
}: {
  categoryId: string;
  label: string;
  itemCount: number;
  selectedCount: number;
  onToggle: (categoryId: string, selected: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const allSelected = itemCount > 0 && selectedCount === itemCount;
  const indeterminate = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate, selectedCount, itemCount]);

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={allSelected}
      aria-label={`Select all ${label}`}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        onToggle(categoryId, e.target.checked);
      }}
    />
  );
}

type Props = {
  categories: CategoryRow[];
  filterCategoryId: string | null;
  onFilterChange: (categoryId: string | null) => void;
  onToggleCategory: (categoryId: string, selected: boolean) => void;
  emptyMessage: string;
  totalItemCount?: number;
};

export function CategoryListPanel({
  categories,
  filterCategoryId,
  onFilterChange,
  onToggleCategory,
  emptyMessage,
  totalItemCount,
}: Props) {
  if (!categories.length) {
    return <p className="muted">{emptyMessage}</p>;
  }

  const allCount = totalItemCount ?? categories.reduce((n, c) => n + c.itemCount, 0);

  return (
    <div className="list">
      <div
        role="button"
        tabIndex={0}
        className={`list-row list-row-selectable${filterCategoryId === null ? ' list-row-active' : ''}`}
        onClick={() => onFilterChange(null)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onFilterChange(null);
          }
        }}
      >
        <span className="list-row-label">All categories</span>
        <span className="muted">{allCount} items</span>
      </div>
      {categories.map((cat) => (
        <div
          key={cat.id}
          role="button"
          tabIndex={0}
          className={`list-row list-row-selectable${filterCategoryId === cat.id ? ' list-row-active' : ''}`}
          onClick={() => onFilterChange(filterCategoryId === cat.id ? null : cat.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onFilterChange(filterCategoryId === cat.id ? null : cat.id);
            }
          }}
        >
          <div className="checkbox-row">
            <CategorySelectCheckbox
              categoryId={cat.id}
              label={cat.label}
              itemCount={cat.itemCount}
              selectedCount={cat.selectedCount}
              onToggle={onToggleCategory}
            />
            <span className="list-row-label">{cat.label}</span>
          </div>
          <RiskBadge risk={cat.risk} />
          <span className="muted">{cat.itemCount} items</span>
          <strong>{formatBytes(cat.sizeBytes)}</strong>
        </div>
      ))}
    </div>
  );
}
