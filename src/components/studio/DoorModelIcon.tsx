import type { DoorModel } from '@/lib/data/types';
// Line drawing of a leaf design for the model picker (decorative; the label names it).
export function DoorModelIcon({ icon }: { icon: DoorModel['icon'] }) {
  const casing = icon !== 'filomuro' && icon !== 'all-glass';
  return (
    <svg className="door-model-icon" viewBox="0 0 40 60" width={40} height={60} aria-hidden="true">
      {casing ? (
        <path d="M5 59V4h30v55" fill="none" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <path d="M2 59h36" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      )}
      <rect
        x="9"
        y="8"
        width="22"
        height="51"
        fill="none"
        stroke="currentColor"
        strokeWidth={icon === 'filomuro' ? 1 : 1.5}
      />
      {icon === 'grooved' &&
        [18, 28, 38, 48].map(y => <path key={y} d={`M9 ${y}h22`} stroke="currentColor" strokeWidth="1" />)}
      {icon === 'glass-insert' && <rect x="16.5" y="16" width="7" height="34" fill="currentColor" opacity="0.25" stroke="currentColor" strokeWidth="1" />}
      {icon === 'all-glass' && <rect x="11" y="10" width="18" height="47" fill="currentColor" opacity="0.2" />}
      <path d="M27 34h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
