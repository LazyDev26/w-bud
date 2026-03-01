import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', icon: 'view_kanban', label: 'Sprint Board' },
  { to: '/repos', icon: 'folder_copy', label: 'Repo Registry' },
  { to: '/history', icon: 'history', label: 'Run History' },
];

export default function Sidebar() {
  return (
    <aside className="flex w-20 flex-col items-center border-r border-border-dark bg-panel-dark py-6 gap-6 shrink-0 z-20">
      <div className="flex flex-col items-center gap-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20 text-primary">
          <span className="material-symbols-outlined text-2xl">terminal</span>
        </div>
        <span className="text-[10px] font-bold text-primary tracking-wide">w-bud</span>
      </div>
      <nav className="flex flex-1 flex-col items-center gap-4">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `group relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-surface-hover text-slate-500 hover:text-primary'
              }`
            }
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="absolute left-14 hidden rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block z-50 whitespace-nowrap">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>
      <div className="flex flex-col items-center gap-4">
        <NavLink
          to="/settings"
          className="group relative flex h-10 w-10 items-center justify-center rounded-lg hover:bg-surface-hover text-slate-500 hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined">settings</span>
        </NavLink>
      </div>
    </aside>
  );
}
