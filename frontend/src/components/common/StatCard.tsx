interface StatCardProps {
  label: string;
  value: string;
  highlight?: boolean;
}

export default function StatCard({ label, value, highlight }: StatCardProps) {
  return (
    <div className="p-3 bg-surface-dark rounded-lg border border-border-dark">
      <p className="text-xs text-text-secondary font-medium mb-1">{label}</p>
      <p className={`text-sm font-mono font-bold ${highlight ? 'text-primary capitalize' : 'text-white'} truncate`}>
        {value}
      </p>
    </div>
  );
}
