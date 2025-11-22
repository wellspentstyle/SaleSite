import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Loader2, ExternalLink, ArrowLeft } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs';

const API_BASE = '/api';

interface Sale {
  id: string;
  saleName: string;
  percentOff: number;
  live: string;
  saleUrl?: string;
  picksCount: number;
  startDate?: string;
  endDate?: string;
}

type View = 'sales-list' | 'url-entry';

export function PicksAdmin() {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [urls, setUrls] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSales, setLoadingSales] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'inactive'>('active');
  const [currentView, setCurrentView] = useState<View>('sales-list');

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

    try {
      const response = await fetch(`${API_BASE}/admin/sales`, {
        headers: { 'auth': auth }
      });
      const data = await response.json();
      if (data.success) {
        setSales(data.sales || []);
      }
    } catch (error) {
      console.error('Failed to fetch sales:', error);
    } finally {
      setLoadingSales(false);
    }
  };

  const handleSaleClick = (sale: Sale) => {
    setSelectedSale(sale);
    setUrls('');
    setCurrentView('url-entry');
    
    if (sale.saleUrl) {
      window.open(sale.saleUrl, '_blank');
    }
  };

  const handleBackToSales = () => {
    setCurrentView('sales-list');
    setSelectedSale(null);
    setUrls('');
  };

  const handleScrapePicks = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSale) {
      alert('Please select a sale');
      return;
    }

    if (!urls.trim()) {
      alert('Please enter at least one URL');
      return;
    }

    setIsLoading(true);

    const auth = sessionStorage.getItem('adminAuth');
    const urlList = urls.split('\n').filter(url => url.trim() !== '');

    try {
      const response = await fetch(`${API_BASE}/admin/scrape-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth || ''
        },
        body: JSON.stringify({ urls: urlList })
      });

      const data = await response.json();
      
      if (data.success) {
        const successes = data.successes || [];
        const failures = data.failures || [];
        
        const scrapedProducts = successes.map((s: any) => ({
          ...s.product,
          confidence: s.confidence,
          extractionMethod: s.extractionMethod
        }));
        
        navigate('/admin/picks/finalize', {
          state: {
            scrapedProducts,
            selectedSaleId: selectedSale.id,
            salePercentOff: selectedSale.percentOff,
            failures
          }
        });
      } else {
        alert('An error occurred while scraping. Please try again.');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Scraping error:', error);
      alert('An error occurred while scraping. Please try again.');
      setIsLoading(false);
    }
  };

  const filteredSales = sales.filter(sale => {
    const hasNoPicks = sale.picksCount === 0;
    const isActive = sale.live === 'YES';
    
    if (activeTab === 'inactive') {
      return hasNoPicks && !isActive;
    }
    return hasNoPicks && isActive;
  });

  return (
    <div style={{ padding: '40px 24px', maxWidth: '1400px', margin: '0 auto' }}>
      {currentView === 'sales-list' ? (
        <>
          <div style={{ marginBottom: '40px' }}>
            <h1 
              className="mb-2 tracking-tight" 
              style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '31px' }}
            >
              Add Picks to Sales
            </h1>
            <p 
              className="text-muted-foreground mb-6" 
              style={{ fontFamily: 'Crimson Pro, serif', fontSize: '18px' }}
            >
              Select a sale to add curated product picks. Sales without picks are shown first.
            </p>
            
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'active' | 'inactive')}>
              <TabsList>
                <TabsTrigger value="active" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Active Sales
                </TabsTrigger>
                <TabsTrigger value="inactive" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                  Inactive Sales
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {loadingSales ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground" style={{ padding: '60px' }}>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading sales...</span>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="border border-dashed border-border bg-muted/20" style={{ padding: '60px', textAlign: 'center', borderRadius: '8px' }}>
              <p className="text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                {activeTab === 'inactive' 
                  ? 'No inactive sales without picks found.' 
                  : 'No active sales without picks found. Try switching to "Inactive Sales" tab.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSales.map((sale) => (
                <div
                  key={sale.id}
                  onClick={() => handleSaleClick(sale)}
                  className="border bg-white cursor-pointer transition-all border-border hover:border-gray-400 hover:shadow-md"
                  style={{ padding: '20px', borderRadius: '4px' }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h3 
                      style={{ 
                        fontFamily: 'DM Sans, sans-serif', 
                        fontWeight: 600, 
                        fontSize: '16px',
                        flex: 1
                      }}
                    >
                      {sale.saleName}
                    </h3>
                    {sale.saleUrl && (
                      <ExternalLink className="h-4 w-4 text-muted-foreground ml-2 flex-shrink-0" />
                    )}
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                        {sale.percentOff}% Off
                      </span>
                      <span 
                        className={`px-2 py-0.5 text-xs rounded ${
                          sale.live === 'YES' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}
                        style={{ fontFamily: 'DM Sans, sans-serif' }}
                      >
                        {sale.live === 'YES' ? 'Live' : 'Draft'}
                      </span>
                    </div>
                    
                    {sale.startDate && sale.endDate && (
                      <p className="text-xs text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                        {new Date(sale.startDate).toLocaleDateString()} - {new Date(sale.endDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="border border-border bg-white" style={{ padding: '32px', borderRadius: '4px' }}>
          <div className="mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBackToSales}
              className="mb-4"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sales List
            </Button>
            
            <h2 
              style={{ 
                fontFamily: 'DM Sans, sans-serif', 
                fontWeight: 700, 
                fontSize: '20px',
                marginBottom: '4px'
              }}
            >
              Add Picks to: {selectedSale?.saleName}
            </h2>
            <p className="text-sm text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Paste product URLs below to scrape and add picks to this sale.
            </p>
          </div>

          <form onSubmit={handleScrapePicks}>
            <div className="space-y-2" style={{ marginBottom: '24px' }}>
              <Label 
                htmlFor="urls"
                style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: '14px' }}
              >
                Product URLs
              </Label>
              <Textarea
                id="urls"
                value={urls}
                onChange={(e) => setUrls(e.target.value)}
                placeholder="Paste product URLs here, one per line:&#10;https://example.com/product-1&#10;https://example.com/product-2&#10;https://example.com/product-3"
                className="min-h-[200px] text-sm"
                style={{ fontFamily: 'monospace' }}
                required
                disabled={isLoading}
              />
            </div>

            <Button 
              type="submit" 
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                backgroundColor: '#000',
                color: '#fff',
                height: '44px',
                paddingLeft: '24px',
                paddingRight: '24px'
              }}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Scraping...
                </>
              ) : (
                'Scrape Picks'
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
