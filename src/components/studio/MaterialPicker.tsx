export function MaterialPicker({
  items,
  selectedId,
  onSelect,
  label,
}: {
  items: readonly { id: string; label: string; swatch: string; disabledReason?: string }[];
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
}) {
  return (
    <div className="material-picker" role="group" aria-label={label}>
      {items.map(i => (
        <button
          key={i.id}
          disabled={!!i.disabledReason}
          aria-pressed={selectedId === i.id}
          title={i.disabledReason || i.label}
          onClick={() => onSelect(i.id)}
        >
          <span className="material-swatch" style={{ background: i.swatch }} />
          <span>{i.label}</span>
          {i.disabledReason && <small>{i.disabledReason}</small>}
        </button>
      ))}
    </div>
  );
}
