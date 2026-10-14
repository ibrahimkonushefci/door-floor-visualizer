'use client';
import { useRef, useState } from 'react';
import type { Messages } from '@/lib/i18n/messages';
import { Icon } from '../../ui/Icon';

// File, camera or drag-and-drop. HEIC is offered too: Safari decodes it, and
// iOS converts it when the picker hands it over; other browsers say so clearly.
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';

export function PhotoIntake({
  messages: m,
  opening,
  error,
  onFile,
  onSample,
}: {
  messages: Messages;
  opening: boolean;
  error: string | null;
  onFile: (file: File) => void;
  onSample: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null),
    cameraInput = useRef<HTMLInputElement>(null),
    [over, setOver] = useState(false);
  const take = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };
  return (
    <div
      className={`photo-intake${over ? ' is-over' : ''}`}
      aria-busy={opening}
      onDragOver={e => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={e => {
        e.preventDefault();
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <Icon name="image" size={40} />
      <p className="photo-intake-title">{opening ? m['photo.opening'] : m['photo.drop']}</p>
      <div className="photo-intake-actions">
        <button type="button" className="btn btn-primary" disabled={opening} onClick={() => fileInput.current?.click()}>
          <Icon name="image" size={18} />
          {m['photo.choose']}
        </button>
        <button type="button" className="btn btn-secondary" disabled={opening} onClick={() => cameraInput.current?.click()}>
          <Icon name="camera" size={18} />
          {m['photo.camera']}
        </button>
      </div>
      <button type="button" className="photo-intake-sample" disabled={opening} onClick={onSample}>
        {m['photo.sample']}
      </button>
      {error && (
        <p className="photo-error" role="alert">
          {error}
        </p>
      )}
      <p className="photo-privacy">{m['photo.privacy']}</p>
      <input
        ref={fileInput}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={e => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInput}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={e => {
          take(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
