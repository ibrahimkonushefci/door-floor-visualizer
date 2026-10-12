import { Icon, type IconName } from './Icon';
export interface SegmentOption<T extends string | number> {
  value: T;
  label: string;
  icon?: IconName;
}
export function SegmentedControl<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button
          type="button"
          key={option.value}
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.icon && <Icon name={option.icon} size={18} />}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}
