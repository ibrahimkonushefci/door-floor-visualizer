import { Icon, type IconName } from './Icon';
export function IconButton({
  icon,
  label,
  onClick,
  pressed,
  disabled,
  variant = 'translucent',
  className = '',
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  disabled?: boolean;
  variant?: 'translucent' | 'plain';
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-${variant} ${className}`.trim()}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}
