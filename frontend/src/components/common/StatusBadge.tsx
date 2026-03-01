const statusStyles: Record<string, { bg: string; text: string }> = {
  planning: { bg: 'bg-primary/10 border-primary/20', text: 'text-primary' },
  awaiting_approval: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400' },
  executing: { bg: 'bg-primary/10 border-primary/20', text: 'text-primary' },
  done: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400' },
  failed: { bg: 'bg-red-500/10 border-red-500/20', text: 'text-red-400' },
  aborted: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400' },
};

const statusLabels: Record<string, string> = {
  done: 'Success',
  failed: 'Failed',
  aborted: 'Aborted',
  planning: 'Planning',
  awaiting_approval: 'Awaiting',
  executing: 'Executing',
};

const statusIcons: Record<string, string> = {
  done: 'check_circle',
  failed: 'cancel',
  aborted: 'do_not_disturb_on',
  planning: 'smart_toy',
  awaiting_approval: 'hourglass_top',
  executing: 'play_arrow',
};

interface StatusBadgeProps {
  status: string;
  showPulse?: boolean;
  showIcon?: boolean;
  className?: string;
}

export default function StatusBadge({ status, showPulse = true, showIcon = false, className }: StatusBadgeProps) {
  const c = statusStyles[status] || statusStyles.planning;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full ${c.bg} border ${c.text} text-xs font-mono font-medium uppercase tracking-wide ${className || ''}`}>
      {showIcon && (
        <span className="material-symbols-outlined text-[14px]">{statusIcons[status] || 'smart_toy'}</span>
      )}
      {showPulse && ['planning', 'executing'].includes(status) && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
        </span>
      )}
      {statusLabels[status] || status.replace('_', ' ')}
    </span>
  );
}

export { statusStyles, statusLabels, statusIcons };
