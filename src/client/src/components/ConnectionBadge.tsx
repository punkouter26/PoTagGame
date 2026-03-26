import type { ConnectionStatus } from '@/features/connection';

interface ConnectionBadgeProps {
  status: ConnectionStatus;
}

const STATUS_CONFIG: Record<ConnectionStatus, { label: string; colour: string }> = {
  connecting:   { label: 'Connecting…', colour: 'bg-yellow-400 text-yellow-900' },
  connected:    { label: 'Connected',   colour: 'bg-green-500  text-white'      },
  reconnecting: { label: 'Reconnecting…', colour: 'bg-orange-400 text-white'   },
  disconnected: { label: 'Offline',     colour: 'bg-red-500    text-white'      },
};

/** Small status indicator — hidden when connected (no noise for casual players). */
export function ConnectionBadge({ status }: ConnectionBadgeProps) {
  if (status === 'connected') return null;
  const cfg = STATUS_CONFIG[status];
  return (
    <span
      data-testid="connection-badge"
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cfg.colour}`}
    >
      {cfg.label}
    </span>
  );
}
