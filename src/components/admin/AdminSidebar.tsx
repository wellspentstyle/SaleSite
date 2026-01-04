import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Package, Tag, Image, Gem, RefreshCw, CheckSquare, X, Settings } from 'lucide-react';

const API_BASE = '/api';

interface AdminSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function AdminSidebar({ isOpen, onClose }: AdminSidebarProps) {
  const [pendingCount, setPendingCount] = useState(0);
  const [draftsCount, setDraftsCount] = useState(0);
  const [pendingBrandsCount, setPendingBrandsCount] = useState(0);
  
  const navItems = [
    { path: '/admin/sales-approvals', label: 'Add Sales', icon: CheckSquare, badge: pendingCount },
    { path: '/admin/manage-sales', label: 'Manage Sales', icon: Settings },
    { path: '/admin/picks', label: 'Add Picks', icon: Package, badge: draftsCount },
    { path: '/admin/brands', label: 'Add Brands', icon: Tag, badge: pendingBrandsCount },
    { path: '/admin/manage-brands', label: 'Manage Brands', icon: Settings },
    { path: '/admin/assets', label: 'Generate Assets', icon: Image },
    { path: '/admin/freshness', label: 'Freshness', icon: RefreshCw },
    { path: '/admin/sync', label: 'Sync Gem', icon: Gem },
  ];
  
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const auth = localStorage.getItem('adminAuth') || '';
        
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
          const highPriorityCount = brandsData.brands.filter((b: any) => b.hasActiveSales).length;
          setPendingBrandsCount(highPriorityCount);
        }
      } catch (error) {
        console.error('Error fetching counts:', error);
      }
    };
    
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleNavClick = () => {
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onClose}
        />
      )}
      
      {/* Sidebar */}
      <aside 
        className={`
          bg-white fixed md:relative z-50 md:z-auto
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ 
          width: '240px', 
          minHeight: 'calc(100vh - 73px)',
          borderRight: '1px solid #e5e7eb',
          top: '73px',
          left: 0,
          height: 'calc(100vh - 73px)',
          overflowY: 'auto'
        }}
      >
        {/* Mobile close button */}
        <div className="md:hidden flex justify-end p-4">
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <nav style={{ padding: '0 24px 24px 24px' }} className="md:pt-6">
          <ul style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {navItems.map((item) => {
              const Icon = item.icon;
              const hasBadge = item.badge !== undefined && item.badge > 0;
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={handleNavClick}
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
    </>
  );
}
