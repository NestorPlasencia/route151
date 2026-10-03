import { RefreshCw } from 'lucide-react';
import type { T } from './i18n';

export function LoadNotice({
  message,
  onRetry,
  tr,
  banner = false,
}: {
  message: string;
  onRetry?: () => void;
  tr: T;
  banner?: boolean;
}) {
  return (
    <div
      className={`load-notice ${banner ? 'load-notice-banner' : ''}`}
      role={onRetry ? 'alert' : 'status'}
    >
      <p>{message}</p>
      {onRetry && (
        <button onClick={onRetry}>
          <RefreshCw />
          {tr.t('retryLoad')}
        </button>
      )}
    </div>
  );
}
