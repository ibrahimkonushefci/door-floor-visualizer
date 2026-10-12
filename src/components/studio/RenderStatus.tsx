import type { StudioSnapshot } from '@/lib/studio/types';
export function RenderStatus({
  status,
  message,
  onRetry,
}: {
  status: StudioSnapshot['status'];
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="render-status" role="status" data-render-status={status}>
      {message}
      {status === 'error' && <button onClick={onRetry}>↻</button>}
    </div>
  );
}
