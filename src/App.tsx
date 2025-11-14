import { useState, useMemo, useEffect } from 'react';
import { Hero } from './components/Hero';
import { SaleCard } from './components/SaleCard';
import { FeaturedSaleCard } from './components/FeaturedSaleCard';
import { SalePicksDialog } from './components/SalePicksDialog';
import { FilterBar, FilterOptions } from './components/FilterBar';
import { Footer } from './components/Footer';
import { fetchSalesFromAirtable } from './services/airtable';
import { Sale } from './types';
import { Admin } from './pages/Admin';

export default function App() {
  // Simple routing based on URL path
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Show admin page if path is /admin
  if (currentPath === '/admin') {
    return <Admin />;
  }
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    discountRange: 'all',
    activeOnly: false,
  });

  useEffect(() => {
    async function loadSales() {
      try {
        setLoading(true);
        const fetchedSales = await fetchSalesFromAirtable();
        setSales(fetchedSales);
      } catch (error) {
        console.error('Failed to load sales:', error);
      } finally {
        setLoading(false);
      }
    }
    loadSales();
  }, []);

  const handleViewPicks = (sale: Sale) => {
    setSelectedSale(sale);
    setDialogOpen(true);
  };

  const isActiveNow = (sale: Sale) => {
    if (!sale.startDate) return false;
    const now = new Date();
    const start = new Date(sale.startDate);
    const end = sale.endDate ? new Date(sale.endDate) : null;
    
    return now >= start && (!end || now <= end);
  };

  const { featuredSales, regularSales } = useMemo(() => {
    const filtered = sales.filter((sale) => {
      // Filter by discount range
      if (filters.discountRange !== 'all') {
        const discountValue = parseInt(sale.discount);
        
        if (filters.discountRange === '50+') {
          if (discountValue < 50) return false;
        } else {
          const [minStr, maxStr] = filters.discountRange.split('-');
          const min = parseInt(minStr);
          const max = parseInt(maxStr);
          if (discountValue < min || discountValue > max) return false;
        }
      }

      // Filter by active status
      if (filters.activeOnly && !isActiveNow(sale)) return false;

      return true;
    });

    // Separate featured and regular sales
    const featured = filtered.filter(sale => sale.featured);
    const regular = filtered
      .filter(sale => !sale.featured)
      .sort((a, b) => {
        // Sort by createdTime, newest first
        const timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
        const timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
        return timeB - timeA;
      });

    return { featuredSales: featured, regularSales: regular };
  }, [sales, filters]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-20 bg-white/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <img 
              src="/logo.png" 
              alt="Well Spent Style" 
              className="h-16"
            />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <Hero />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-20 flex-1">
        {/* Filters */}
        <div className="mb-10 flex justify-end">
          <FilterBar
            filters={filters}
            onFilterChange={setFilters}
          />
        </div>

        {/* Sales Content */}
        {loading ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground" style={{ fontFamily: 'Crimson Pro, serif' }}>
              Loading sales...
            </p>
          </div>
        ) : featuredSales.length === 0 && regularSales.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground" style={{ fontFamily: 'Crimson Pro, serif' }}>
              {sales.length === 0 ? 'No active sales at the moment.' : 'No sales match your current filters.'}
            </p>
          </div>
        ) : (
          <div>
            {/* Featured Sales Section */}
            {featuredSales.length > 0 && (
              <section style={{ marginBottom: '2.5rem' }}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {featuredSales.map((sale) => (
                    <FeaturedSaleCard
                      key={sale.id}
                      sale={sale}
                      onViewPicks={handleViewPicks}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Regular Sales Section */}
            {regularSales.length > 0 && (
              <section>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {regularSales.map((sale) => (
                    <SaleCard
                      key={sale.id}
                      sale={sale}
                      onViewPicks={handleViewPicks}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <Footer />

      {/* Sale Picks Dialog */}
      <SalePicksDialog
        sale={selectedSale}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
