'use client';
import { useCallback, useEffect, useState } from 'react';
export interface ToastMessage {
  id: number;
  text: string;
}
export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const show = useCallback((text: string) => setToast({ id: Date.now(), text }), []);
  const dismiss = useCallback(() => setToast(null), []);
  return { toast, show, dismiss };
}
// The live region stays mounted so screen readers announce each new message.
export function Toast({ message, onDismiss }: { message: ToastMessage | null; onDismiss: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDismiss, 3600);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);
  return (
    <div className="toast-region" role="status" aria-live="polite">
      {message && (
        <p key={message.id} className="toast">
          {message.text}
        </p>
      )}
    </div>
  );
}
