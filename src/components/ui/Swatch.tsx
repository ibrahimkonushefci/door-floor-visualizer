// A physical-sample style chip: circle for finishes, plank tile for floors.
// Unavailable swatches stay focusable so a tap can explain why.
export function Swatch({
  label,
  color,
  texture,
  shape = 'circle',
  selected,
  unavailable = false,
  onSelect,
}: {
  label: string;
  color: string;
  texture?: string;
  shape?: 'circle' | 'tile';
  selected: boolean;
  unavailable?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`swatch swatch-${shape}`}
      aria-pressed={selected}
      aria-disabled={unavailable || undefined}
      onClick={onSelect}
    >
      <span
        className="swatch-chip"
        aria-hidden="true"
        style={{
          backgroundColor: color,
          backgroundImage: texture ? `url("${texture}")` : undefined,
        }}
      />
      <span className="swatch-name">{label}</span>
    </button>
  );
}
