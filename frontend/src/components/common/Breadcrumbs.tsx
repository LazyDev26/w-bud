import { Link } from 'react-router-dom';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export default function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && (
              <span className="material-symbols-outlined text-slate-600 text-[14px]">chevron_right</span>
            )}
            {isLast || !item.to ? (
              <span className={isLast ? 'text-white font-medium' : 'text-text-secondary'}>
                {item.label}
              </span>
            ) : (
              <Link
                to={item.to}
                className="text-text-secondary hover:text-primary transition-colors"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
