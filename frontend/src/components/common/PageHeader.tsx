import type { ReactNode } from 'react';
import Breadcrumbs from './Breadcrumbs';

interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({ breadcrumbs, title, subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-6 ${className || ''}`}>
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle && <p className="text-text-secondary text-sm mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
