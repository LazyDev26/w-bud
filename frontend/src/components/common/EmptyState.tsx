interface EmptyStateProps {
  icon: string;
  message: string;
  className?: string;
}

export default function EmptyState({ icon, message, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-text-secondary ${className || ''}`}>
      <span className="material-symbols-outlined text-4xl mb-2 block opacity-30">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
}
