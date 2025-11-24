import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Package, Tag, Image, Gem, RefreshCw, CheckSquare } from 'lucide-react';

const API_BASE = '/api';

export function AdminSidebar() {
  const [pendingCount, setPendingCount] = useState(0);
  const [draftsCount, setDraftsCount] = useState(0);
  const [pendingBrandsCount, setPendingBrandsCount] = useState(0);
  
  const navItems = [
    { path: '/admin/picks', label: 'Add Picks', icon: Package, badge: draftsCount },
    { path: '/admin/sales-approvals', label: 'Sales Approvals', icon: CheckSquare, badge: pendingCount },
    { path: '/admin/brands', label: 'Add Brands', icon: Tag, badge: pendingBrandsCount },
    { path: '/admin/assets', label: 'Generate Assets', icon: Image },
    { path: '/admin/freshness', label: 'Freshness', icon: RefreshCw },
    { path: '/admin/sync', label: 'Sync Gem', icon: Gem },
  ];
  
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const auth = sessionStorage.getItem('adminAuth') || '';
        
        const [salesRes, draftsRes, brandsRes] = await Promise.all([
          fetch(`${API_BASE}/pending-sales`, {
            headers: { 'auth': auth }
          }),
          fetch(`${API_BASE}/admin/finalize-drafts`, {
            headers: { 'auth': auth }
          }),
          fetch(`${API_BASE}/admin/pending-brands`, {
            headers: { 'auth': auth }
          })
        ]);
        
        const salesData = await salesRes.json();
        const draftsData = await draftsRes.json();
        const brandsData = await brandsRes.json();
        
        if (salesData.success && salesData.sales) {
          setPendingCount(salesData.sales.length);
        }
        
        if (draftsData.success && draftsData.drafts) {
          setDraftsCount(draftsData.drafts.length);
        }
        
        if (brandsData.success && brandsData.brands) {
          setPendingBrandsCount(brandsData.brands.length);
        }
      } catch (error) {
        console.error('Error fetching counts:', error);
      }
    };
    
    fetchCounts();
    // Refresh count every 30 seconds
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

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
            const hasBadge = item.badge !== undefined && item.badge > 0;
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
                    marginBottom: '12px',
                    position: 'relative'
                  }}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" style={{ color: '#6b7280' }} />
                  <span>{item.label}</span>
                  {hasBadge && (
                    <span
                      style={{
                        position: 'absolute',
                        right: '12px',
                        backgroundColor: '#ef4444',
                        color: 'white',
                        borderRadius: '9999px',
                        width: '20px',
                        height: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 600,
                        fontFamily: 'system-ui, sans-serif'
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
