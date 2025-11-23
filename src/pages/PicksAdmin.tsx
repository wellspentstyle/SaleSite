import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Loader2, ExternalLink, ArrowLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

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
type FilterType = 'active-no-picks' | 'active-with-picks' | 'inactive';

interface ProtectionWarning {
  show: boolean;
  store: string;
  successRate: string;
  recommendation: string;
  urlsToScrape: string[];
}

export function PicksAdmin() {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [urls, setUrls] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSales, setLoadingSales] = useState(true);
  const [filterType, setFilterType] = useState<FilterType>('active-no-picks');
  const [currentView, setCurrentView] = useState<View>('sales-list');
  const [protectionWarning, setProtectionWarning] = useState<ProtectionWarning>({
    show: false,
    store: '',
    successRate: '',
    recommendation: '',
    urlsToScrape: []
  });

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

  const performScraping = async (urlList: string[]) => {
    setIsLoading(true);
    const auth = sessionStorage.getItem('adminAuth');

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
            selectedSaleId: selectedSale?.id,
            salePercentOff: selectedSale?.percentOff,
            failures
          }
        });
      } else {
        toast.error('An error occurred while scraping. Please try again.');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Scraping error:', error);
      toast.error('An error occurred while scraping. Please try again.');
      setIsLoading(false);
    }
  };

  const handleScrapePicks = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSale) {
      toast.error('Please select a sale');
      return;
    }

    if (!urls.trim()) {
      toast.error('Please enter at least one URL');
      return;
    }

    const auth = sessionStorage.getItem('adminAuth');
    const urlList = urls.split('\n').filter(url => url.trim() !== '');

    // Check ALL URLs for ultra-high protection stores
    try {
      let ultraHighStore = null;
      
      // Check each URL for protection level
      for (const url of urlList) {
        const checkResponse = await fetch(`${API_BASE}/admin/check-url-protection`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'auth': auth || ''
          },
          body: JSON.stringify({ url })
        });

        const checkData = await checkResponse.json();
        
        // If we find ANY ultra-high protection URL, show warning
        if (checkData.success && checkData.protected && checkData.store.level === 'ultra-high') {
          ultraHighStore = checkData.store;
          break; // Stop checking once we find one ultra-high protection URL
        }
      }

      // Show warning if any ultra-high protection URL was found
      if (ultraHighStore) {
        setProtectionWarning({
          show: true,
          store: ultraHighStore.store,
          successRate: ultraHighStore.successRate,
          recommendation: ultraHighStore.recommendation,
          urlsToScrape: urlList
        });
        return;
      }

      // No warning needed, proceed with scraping
      await performScraping(urlList);
      
    } catch (error) {
      console.error('Error checking URL protection:', error);
      // If check fails, just proceed with scraping
      await performScraping(urlList);
    }
  };

  const handleProceedWithScraping = async () => {
    setProtectionWarning(prev => ({ ...prev, show: false }));
    await performScraping(protectionWarning.urlsToScrape);
  };

  const handleCancelScraping = () => {
    setProtectionWarning({
      show: false,
      store: '',
      successRate: '',
      recommendation: '',
      urlsToScrape: []
    });
  };

  const filteredSales = sales.filter(sale => {
    const hasPicks = sale.picksCount > 0;
    const isActive = sale.live === 'YES';
    
    if (filterType === 'active-no-picks') {
      return isActive && !hasPicks;
    } else if (filterType === 'active-with-picks') {
      return isActive && hasPicks;
    } else { // inactive
      return !isActive;
    }
  });

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {currentView === 'sales-list' ? (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Add Picks to Sales</h1>
                <p className="text-gray-600 mt-1">Select a sale to add curated product picks</p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setFilterType('active-no-picks')}
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  padding: '8px 16px',
                  backgroundColor: filterType === 'active-no-picks' ? '#000' : '#fff',
                  color: filterType === 'active-no-picks' ? '#fff' : '#000',
                  border: '1px solid',
                  borderColor: filterType === 'active-no-picks' ? '#000' : '#ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: filterType === 'active-no-picks' ? 600 : 400,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (filterType !== 'active-no-picks') {
                    e.currentTarget.style.borderColor = '#999';
                  }
                }}
                onMouseLeave={(e) => {
                  if (filterType !== 'active-no-picks') {
                    e.currentTarget.style.borderColor = '#ddd';
                  }
                }}
              >
                Active Sales Without Picks
              </button>
              
              <button
                onClick={() => setFilterType('active-with-picks')}
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  padding: '8px 16px',
                  backgroundColor: filterType === 'active-with-picks' ? '#000' : '#fff',
                  color: filterType === 'active-with-picks' ? '#fff' : '#000',
                  border: '1px solid',
                  borderColor: filterType === 'active-with-picks' ? '#000' : '#ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: filterType === 'active-with-picks' ? 600 : 400,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (filterType !== 'active-with-picks') {
                    e.currentTarget.style.borderColor = '#999';
                  }
                }}
                onMouseLeave={(e) => {
                  if (filterType !== 'active-with-picks') {
                    e.currentTarget.style.borderColor = '#ddd';
                  }
                }}
              >
                Active Sales With Picks
              </button>
              
              <button
                onClick={() => setFilterType('inactive')}
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  padding: '8px 16px',
                  backgroundColor: filterType === 'inactive' ? '#000' : '#fff',
                  color: filterType === 'inactive' ? '#fff' : '#000',
                  border: '1px solid',
                  borderColor: filterType === 'inactive' ? '#000' : '#ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: filterType === 'inactive' ? 600 : 400,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (filterType !== 'inactive') {
                    e.currentTarget.style.borderColor = '#999';
                  }
                }}
                onMouseLeave={(e) => {
                  if (filterType !== 'inactive') {
                    e.currentTarget.style.borderColor = '#ddd';
                  }
                }}
              >
                Inactive Sales
              </button>
            </div>

          {loadingSales ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground" style={{ padding: '60px' }}>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading sales...</span>
            </div>
          ) : filteredSales.length === 0 ? (
            <div className="border border-dashed border-border bg-muted/20" style={{ padding: '60px', textAlign: 'center', borderRadius: '8px' }}>
              <p className="text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                {filterType === 'active-no-picks' 
                  ? 'No active sales without picks found.' 
                  : filterType === 'active-with-picks'
                  ? 'No active sales with picks found.'
                  : 'No inactive sales found.'}
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

      {/* Protection Warning Modal */}
      <AlertDialog open={protectionWarning.show} onOpenChange={(open) => {
        if (!open) handleCancelScraping();
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'DM Sans, sans-serif' }}>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Advanced Bot Protection Detected
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontFamily: 'DM Sans, sans-serif', lineHeight: '1.6' }}>
              <p className="mb-3">
                <strong>{protectionWarning.store}</strong> uses advanced bot protection.
              </p>
              <p className="mb-2">
                <strong>Success rate:</strong> {protectionWarning.successRate}
              </p>
              <p className="mb-4">
                {protectionWarning.recommendation}
              </p>
              <p className="text-sm text-muted-foreground">
                Even with our advanced scraping technology (ScraperAPI ultra-premium + Playwright), 
                success rates remain very low for this store.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelScraping} style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Manual Entry
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleProceedWithScraping} style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Try Scraping Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
