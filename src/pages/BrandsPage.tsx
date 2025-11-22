import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FilterSidebar } from '../components/FilterSidebar';
import { Filter } from 'lucide-react';
import { FilterOptions } from '../types';

interface Company {
  id: string;
  name: string;
  type: string;
  priceRange: string;
  category: string;
  maxWomensSize: string;
  values: string[];
  description: string;
  url: string;
}

export function BrandsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterOptions>({
    type: [],
    priceRange: [],
    discount: [],
    maxWomensSize: [],
    values: []
  });

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await fetch('/api/companies');
        const data = await response.json();
        if (data.success) {
          setCompanies(data.companies);
        }
      } catch (error) {
        console.error('Error fetching companies:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchCompanies();
  }, []);

  // Filter companies based on selected filters
  const filteredCompanies = useMemo(() => {
    return companies.filter(company => {
      // Type filter (Brand or Shop) - note: no "Has Faves" here
      if (filters.type.length > 0) {
        const typeMatch = filters.type.some(filterType => {
          if (filterType === 'Brand' || filterType === 'Shop') {
            return company.type === filterType;
          }
          return false;
        });
        if (!typeMatch) return false;
      }

      // Price range filter
      if (filters.priceRange.length > 0) {
        if (!filters.priceRange.includes(company.priceRange)) {
          return false;
        }
      }

      // Max women's size filter
      if (filters.maxWomensSize.length > 0) {
        if (!company.maxWomensSize) return false;
        
        const companyMaxSize = parseInt(company.maxWomensSize.replace('Up to ', ''));
        const matchesSize = filters.maxWomensSize.some(filterSize => {
          const filterMaxSize = parseInt(filterSize.replace('Up to ', '').replace('+', ''));
          return companyMaxSize >= filterMaxSize;
        });
        
        if (!matchesSize) return false;
      }

      // Values filter (Sustainable, Women-owned, etc.)
      if (filters.values.length > 0) {
        const hasMatchingValue = filters.values.some(filterValue => 
          company.values.includes(filterValue)
        );
        if (!hasMatchingValue) return false;
      }

      return true;
    });
  }, [companies, filters]);

  // Separate into brands and shops
  const brands = useMemo(() => 
    filteredCompanies.filter(c => c.type === 'Brand').sort((a, b) => a.name.localeCompare(b.name)),
    [filteredCompanies]
  );

  const shops = useMemo(() => 
    filteredCompanies.filter(c => c.type === 'Shop').sort((a, b) => a.name.localeCompare(b.name)),
    [filteredCompanies]
  );

  const scrollToSection = (section: 'brands' | 'shops') => {
    const element = document.getElementById(section);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', fontFamily: 'DM Sans, sans-serif' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid var(--border)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(4px)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Link to="/" style={{ cursor: 'pointer' }}>
            <img 
              src="/logo.png" 
              alt="Well Spent Style" 
              style={{ height: '64px' }}
            />
          </Link>
          <nav>
            <Link 
              to="/brands" 
              style={{
                fontSize: '13px',
                letterSpacing: '1.5px',
                textTransform: 'uppercase',
                fontWeight: 500,
                fontFamily: 'DM Sans, sans-serif',
                opacity: 1,
                transition: 'opacity 0.2s',
                textDecoration: 'none',
                color: '#000'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.6'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              Our Brands
            </Link>
          </nav>
        </div>
      </header>
      
      {/* Hero Section */}
      <div style={{ 
        padding: '80px 24px 60px',
        borderBottom: '1px solid var(--border)',
        backgroundColor: '#fff'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{ 
            fontFamily: 'Crimson Pro, serif',
            fontSize: '48px',
            fontWeight: 400,
            marginBottom: '16px',
            letterSpacing: '-0.02em'
          }}>
            Our Brands
          </h1>
          <p style={{ 
            fontSize: '16px',
            color: '#666',
            maxWidth: '600px',
            lineHeight: 1.6
          }}>
            Discover {companies.length} carefully curated brands and shops. Filter by price range, values, and more to find your next favorite designer.
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ 
        display: 'flex',
        position: 'relative'
      }}>
        {/* Left Sidebar Navigation */}
        <div style={{
          width: '200px',
          flexShrink: 0,
          position: 'sticky',
          top: '80px',
          height: 'fit-content',
          padding: '32px 24px',
          borderRight: '1px solid var(--border)',
          backgroundColor: '#fff'
        }}>
          <nav>
            <button
              onClick={() => scrollToSection('brands')}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 0',
                fontSize: '14px',
                fontWeight: 500,
                color: '#000',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.6'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              Brands ({brands.length})
            </button>
            <button
              onClick={() => scrollToSection('shops')}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 0',
                fontSize: '14px',
                fontWeight: 500,
                color: '#000',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                transition: 'opacity 0.2s',
                marginTop: '4px'
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.6'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              Shops ({shops.length})
            </button>
          </nav>
        </div>

        {/* Center Content */}
        <div style={{ 
          flex: 1,
          padding: '48px',
          maxWidth: '1000px',
          marginRight: filterOpen ? '0' : 'auto',
          transition: 'margin-right 0.3s ease-in-out'
        }}>
          {/* Filter Button */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'flex-end', 
            marginBottom: '32px'
          }}>
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                backgroundColor: filterOpen ? '#000' : '#fff',
                color: filterOpen ? '#fff' : '#000',
                border: '1px solid #000',
                borderRadius: '3px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                fontFamily: 'DM Sans, sans-serif'
              }}
            >
              <Filter className="w-4 h-4" />
              Filter
            </button>
          </div>

          {/* Brands Section */}
          <section id="brands" style={{ marginBottom: '80px' }}>
            <h2 style={{
              fontFamily: 'Crimson Pro, serif',
              fontSize: '36px',
              fontWeight: 400,
              marginBottom: '32px',
              letterSpacing: '-0.02em'
            }}>
              Brands
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '24px'
            }}>
              {brands.map(brand => (
                <CompanyCard key={brand.id} company={brand} />
              ))}
            </div>
            {brands.length === 0 && (
              <p style={{ color: '#666', fontStyle: 'italic' }}>
                No brands match your filters.
              </p>
            )}
          </section>

          {/* Shops Section */}
          <section id="shops">
            <h2 style={{
              fontFamily: 'Crimson Pro, serif',
              fontSize: '36px',
              fontWeight: 400,
              marginBottom: '32px',
              letterSpacing: '-0.02em'
            }}>
              Shops
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '24px'
            }}>
              {shops.map(shop => (
                <CompanyCard key={shop.id} company={shop} />
              ))}
            </div>
            {shops.length === 0 && (
              <p style={{ color: '#666', fontStyle: 'italic' }}>
                No shops match your filters.
              </p>
            )}
          </section>
        </div>

        {/* Right Filter Sidebar */}
        <FilterSidebar
          filters={filters}
          onFilterChange={setFilters}
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
        />
      </div>
    </div>
  );
}

function CompanyCard({ company }: { company: Company }) {
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: '4px',
      padding: '24px',
      backgroundColor: '#fff',
      transition: 'box-shadow 0.2s',
      cursor: company.url ? 'pointer' : 'default'
    }}
    onClick={() => company.url && window.open(company.url, '_blank')}
    onMouseEnter={(e) => {
      if (company.url) {
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
      }
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.boxShadow = 'none';
    }}
    >
      <h3 style={{
        fontSize: '20px',
        fontWeight: 600,
        marginBottom: '12px',
        fontFamily: 'DM Sans, sans-serif'
      }}>
        {company.name}
      </h3>

      {company.description && (
        <p style={{
          fontSize: '14px',
          lineHeight: 1.6,
          color: '#555',
          marginBottom: '16px'
        }}>
          {company.description}
        </p>
      )}

      {/* Tags */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {company.priceRange && (
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '3px',
            backgroundColor: '#f5f5f5',
            color: '#000',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {company.priceRange}
          </span>
        )}
        {company.maxWomensSize && (
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '3px',
            backgroundColor: '#f5f5f5',
            color: '#000',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {company.maxWomensSize}
          </span>
        )}
        {company.values.map(value => (
          <span key={value} style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: '3px',
            backgroundColor: '#f0f9ff',
            color: '#0369a1',
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}
