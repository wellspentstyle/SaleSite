import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';

// API requests go through Vite proxy to webhook server
const API_BASE = '/api';

interface Sale {
  id: string;
  saleName: string;
  percentOff: number;
  live: string;
}

export function PicksAdmin() {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [urls, setUrls] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSales, setLoadingSales] = useState(true);

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

  const handleScrapePicks = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedSaleId) {
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
            selectedSaleId,
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

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 16px' }}>
      <div style={{ width: '100%', maxWidth: '700px' }}>
        <div className="border border-border bg-white" style={{ padding: '48px' }}>
            <h1 
              className="mb-2 tracking-tight" 
              style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '31px' }}
            >
              Manage Picks
            </h1>
            <p 
              className="text-muted-foreground mb-10" 
              style={{ fontFamily: 'Crimson Pro, serif' }}
            >
              Upload product URLs to scrape and add curated picks to your sales.
            </p>
            <form onSubmit={handleScrapePicks}>
              {/* Sale Selection */}
              <div className="space-y-2" style={{ marginBottom: '32px' }}>
                <Label 
                  htmlFor="sale"
                  style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '16px' }}
                >
                  Select Sale
                </Label>
                {loadingSales ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Loading sales...</span>
                  </div>
                ) : (
                  <Select value={selectedSaleId} onValueChange={setSelectedSaleId}>
                    <SelectTrigger className="h-12 text-sm">
                      <SelectValue placeholder="Choose a sale to add picks to..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sales.map((sale) => (
                        <SelectItem key={sale.id} value={sale.id}>
                          {sale.saleName} ({sale.live === 'YES' ? 'Live' : 'Draft'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* URL Input */}
              <div className="space-y-2" style={{ marginBottom: '32px' }}>
                <Label 
                  htmlFor="urls"
                  style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '16px' }}
                >
                  Product URLs
                </Label>
                <Textarea
                  id="urls"
                  value={urls}
                  onChange={(e) => setUrls(e.target.value)}
                  placeholder="Paste product URLs here, one per line:&#10;https://example.com/product-1&#10;https://example.com/product-2&#10;https://example.com/product-3"
                  className="min-h-[300px] text-sm"
                  style={{ fontFamily: 'monospace' }}
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Submit Button */}
              <div style={{ marginTop: '24px' }}>
                <div className="flex gap-4">
                  <Button 
                    type="submit" 
                    style={{ 
                      fontFamily: 'DM Sans, sans-serif',
                      backgroundColor: '#000',
                      color: '#fff',
                      height: '48px',
                      paddingLeft: '32px',
                      paddingRight: '32px',
                      whiteSpace: 'nowrap'
                    }}
                    disabled={isLoading || loadingSales}
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
                  <Button 
                    type="button"
                    variant="outline"
                    style={{ 
                      fontFamily: 'DM Sans, sans-serif',
                      height: '48px',
                      paddingLeft: '32px',
                      paddingRight: '32px',
                      whiteSpace: 'nowrap'
                    }}
                    onClick={() => {
                      setUrls('');
                      setSelectedSaleId('');
                    }}
                    disabled={isLoading}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
  );
}
