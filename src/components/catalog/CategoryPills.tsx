'use client';
import type { CategoryId } from '@/lib/data/types';
import type { Messages } from '@/lib/i18n/messages';
import { categoryIds } from '@/lib/catalog/query';
export function CategoryPills({
  value,
  onChange,
  messages,
}: {
  value: CategoryId;
  onChange: (id: CategoryId) => void;
  messages: Messages;
}) {
  return (
    <nav className="category-row" aria-label={messages['catalog.title']}>
      <div className="category-scroll">
        {categoryIds.map(id => (
          <button
            key={id}
            className="category-pill"
            aria-pressed={id === value}
            onClick={() => onChange(id)}
          >
            {messages[`category.${id}`]}
          </button>
        ))}
      </div>
    </nav>
  );
}
