import { NavLink } from 'react-router-dom';
import { Package, Tag, Image, Gem, RefreshCw, CheckSquare } from 'lucide-react';

export function AdminSidebar() {
  const navItems = [
    { path: '/admin/picks', label: 'Add Picks', icon: Package },
    { path: '/admin/sales-approvals', label: 'Sales Approvals', icon: CheckSquare },
    { path: '/admin/brands', label: 'Add Brands', icon: Tag },
    { path: '/admin/assets', label: 'Generate Assets', icon: Image },
    { path: '/admin/freshness', label: 'Freshness', icon: RefreshCw },
    { path: '/admin/sync', label: 'Sync Gem', icon: Gem },
  ];

  return (
    <aside 
      className="bg-white"
      style={{ 
        width: '240px', 
        minHeight: 'calc(100vh - 73px)',
        borderRight: '1px solid #e5e7eb'
      }}
    >
      <nav style={{ padding: '24px' }}>
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-4 transition-colors rounded-md ${
                      isActive
                        ? 'bg-muted'
                        : 'hover:bg-muted/50'
                    }`
                  }
                  style={{ 
                    fontFamily: 'DM Sans, sans-serif', 
                    fontWeight: 300,
                    fontSize: '15px',
                    color: '#374151',
                    marginBottom: '12px'
                  }}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" style={{ color: '#6b7280' }} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
