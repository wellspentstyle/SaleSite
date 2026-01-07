import { cn } from '../../lib/utils';

type Status = 'saved' | 'applied' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn' | 'ghosted';

const statusConfig: Record<Status, { label: string; className: string }> = {
  saved: { label: 'Saved', className: 'bg-gray-100 text-gray-700' },
  applied: { label: 'Applied', className: 'bg-blue-100 text-blue-700' },
  interviewing: { label: 'Interviewing', className: 'bg-purple-100 text-purple-700' },
  offer: { label: 'Offer', className: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', className: 'bg-red-100 text-red-700' },
  withdrawn: { label: 'Withdrawn', className: 'bg-orange-100 text-orange-700' },
  ghosted: { label: 'Ghosted', className: 'bg-gray-200 text-gray-600' },
};

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.saved;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
