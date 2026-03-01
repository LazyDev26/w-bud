import type { ReactNode } from 'react';

interface SectionCardProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
}

export default function SectionCard({ icon, title, subtitle, children, className }: SectionCardProps) {
  return (
    <section className={`bg-panel-dark border border-border-dark rounded-xl overflow-hidden ${className || ''}`}>
      <div className="px-6 py-4 border-b border-border-dark flex items-center gap-3">
        {typeof icon === 'string' ? (
          <span className="material-symbols-outlined text-primary">{icon}</span>
        ) : (
          icon
        )}
        <div>
          <h2 className="text-white font-bold">{title}</h2>
          <p className="text-text-secondary text-xs mt-0.5">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
