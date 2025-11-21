import { useState, useMemo, useEffect } from 'react';
import { Hero } from './components/Hero';
import { SaleCard } from './components/SaleCard';
import { FeaturedSaleCard } from './components/FeaturedSaleCard';
import { SalePicksDialog } from './components/SalePicksDialog';
import { FilterSidebar } from './components/FilterSidebar';
import { SortDropdown } from './components/SortDropdown';
import { Footer } from './components/Footer';
import { fetchSalesFromAirtable } from './services/airtable';
import { Sale, FilterOptions, SortOption } from './types';
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
    type: [],
    priceRange: [],
    discount: [],
    maxWomensSize: [],
    values: [],
  });
  const [sortOption, setSortOption] = useState<SortOption>('featured');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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

  const { featuredSales, regularSales } = useMemo(() => {
    // Apply filters
    const filtered = sales.filter((sale) => {
      // Filter by type (Brand/Store)
      if (filters.type.length > 0) {
        if (!sale.companyType || !filters.type.includes(sale.companyType)) {
          return false;
        }
      }

      // Filter by price range
      if (filters.priceRange.length > 0) {
        if (!sale.priceRange || !filters.priceRange.includes(sale.priceRange)) {
          return false;
        }
      }

      // Filter by discount
      if (filters.discount.length > 0) {
        const discountValue = parseInt(sale.discount);
        let matches = false;

        for (const discountFilter of filters.discount) {
          if (discountFilter === 'Up to 25% off' && discountValue <= 25) {
            matches = true;
            break;
          }
          if (discountFilter === '25-35% off' && discountValue >= 25 && discountValue <= 35) {
            matches = true;
            break;
          }
          if (discountFilter === '35-50% off' && discountValue >= 35 && discountValue <= 50) {
            matches = true;
            break;
          }
          if (discountFilter === '50%+ off' && discountValue >= 50) {
            matches = true;
            break;
          }
        }

        if (!matches) return false;
      }

      // Filter by max women's size
      if (filters.maxWomensSize.length > 0) {
        if (!sale.maxWomensSize || !filters.maxWomensSize.includes(sale.maxWomensSize)) {
          return false;
        }
      }

      // Filter by values (multi-select - sale must have ALL selected values)
      if (filters.values.length > 0) {
        const saleValues = sale.values || [];
        const hasAllValues = filters.values.every(filterValue => 
          saleValues.includes(filterValue)
        );
        if (!hasAllValues) return false;
      }

      return true;
    });

    // Apply sorting
    const sortSales = (salesToSort: Sale[]) => {
      const sorted = [...salesToSort];

      switch (sortOption) {
        case 'featured':
          // Featured first, then by date
          return sorted.sort((a, b) => {
            if (a.featured && !b.featured) return -1;
            if (!a.featured && b.featured) return 1;
            const timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
            const timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
            return timeB - timeA;
          });

        case 'alphabetically-a-z':
          return sorted.sort((a, b) => {
            const nameA = a.brandName || '';
            const nameB = b.brandName || '';
            return nameA.localeCompare(nameB);
          });

        case 'alphabetically-z-a':
          return sorted.sort((a, b) => {
            const nameA = a.brandName || '';
            const nameB = b.brandName || '';
            return nameB.localeCompare(nameA);
          });

        case 'discount-high-low':
          return sorted.sort((a, b) => {
            const discountA = parseInt(a.discount);
            const discountB = parseInt(b.discount);
            return discountB - discountA;
          });

        case 'date-old-new':
          return sorted.sort((a, b) => {
            const timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
            const timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
            return timeA - timeB;
          });

        case 'date-new-old':
          return sorted.sort((a, b) => {
            const timeA = a.createdTime ? new Date(a.createdTime).getTime() : 0;
            const timeB = b.createdTime ? new Date(b.createdTime).getTime() : 0;
            return timeB - timeA;
          });

        default:
          return sorted;
      }
    };

    // Separate featured and regular sales, then sort
    const featured = sortSales(filtered.filter(sale => sale.featured));
    const regular = sortSales(filtered.filter(sale => !sale.featured));

    return { featuredSales: featured, regularSales: regular };
  }, [sales, filters, sortOption]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border sticky top-0 z-20 bg-white/95 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <a 
              href="/" 
              className="cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                window.history.pushState({}, '', '/');
                setCurrentPath('/');
              }}
            >
              <img 
                src="/logo.png" 
                alt="Well Spent Style" 
                className="h-16"
              />
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <Hero />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-20 flex-1">
        {/* Layout container with controls, sidebar, and content */}
        <div className="flex">
          {/* Filter Sidebar */}
          <FilterSidebar
            filters={filters}
            onFilterChange={setFilters}
            isOpen={isFilterOpen}
          />

          {/* Main content area with controls and sales */}
          <div 
            className="flex-1 transition-all duration-300"
            style={{ 
              marginLeft: isFilterOpen ? '32px' : '0px'
            }}
          >
            {/* Filters and Sort */}
            <div className="mb-10 flex justify-end items-start gap-3">
              <SortDropdown
                currentSort={sortOption}
                onSortChange={setSortOption}
              />
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="flex items-center gap-3 px-6 py-3 border border-border bg-background hover:bg-muted transition-colors whitespace-nowrap"
                style={{ fontFamily: 'DM Sans, sans-serif' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="text-sm tracking-wider uppercase font-normal">{isFilterOpen ? 'HIDE FILTERS' : 'FILTER'}</span>
              </button>
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
                    <div className={`grid grid-cols-1 gap-8 transition-all duration-300 ${isFilterOpen ? 'md:grid-cols-1 lg:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
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
                    <div className={`grid grid-cols-1 gap-8 transition-all duration-300 ${isFilterOpen ? 'md:grid-cols-1 lg:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'}`}>
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
          </div>
        </div>
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
