import { NavLink } from 'react-router-dom';

export function AdminSidebar() {
  const navItems = [
    { path: '/admin/picks', label: 'Add Picks' },
    { path: '/admin/brands', label: 'Add Brands' },
    { path: '/admin/sync', label: 'Sync Gem' },
  ];

  return (
    <aside 
      className="border-r border-border bg-white"
      style={{ width: '240px', minHeight: 'calc(100vh - 73px)' }}
    >
      <nav className="p-6">
        <ul className="space-y-2">
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  `block px-4 py-3 transition-colors ${
                    isActive
                      ? 'bg-muted font-medium'
                      : 'hover:bg-muted/50'
                  }`
                }
                style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 300 }}
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
