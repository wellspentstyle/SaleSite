import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Loader2, Copy, RotateCcw, X } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

interface Product {
  name: string;
  price: number;
  url: string;
}

interface BrandResult {
  name: string;
  type: string;
  priceRange: string;
  category: string;
  values: string;
  maxWomensSize: string;
  description: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
  evidence?: {
    products: Product[];
    medianPrice: number;
  };
}

export function AddBrands() {
  const [brandNames, setBrandNames] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<BrandResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [totalBrands, setTotalBrands] = useState<number>(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Parse brand names (one per line, trim whitespace, remove duplicates)
    const brands = Array.from(new Set(
      brandNames
        .split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0)
    ));

    if (brands.length === 0) {
      toast.error('Please enter at least one brand name');
      return;
    }

    // Initialize results array with pending status
    const initialResults: BrandResult[] = brands.map(name => ({
      name,
      type: '',
      priceRange: '',
      category: '',
      values: '',
      maxWomensSize: '',
      description: '',
      status: 'pending'
    }));

    setResults(initialResults);
    setTotalBrands(brands.length);
    setIsProcessing(true);
    setCurrentIndex(0);

    // Create AbortController for this batch
    const controller = new AbortController();
    setAbortController(controller);

    // Process brands sequentially
    for (let i = 0; i < brands.length; i++) {
      // Check if aborted
      if (controller.signal.aborted) {
        break;
      }

      setCurrentIndex(i);
      
      // Update status to processing
      setResults(prev => prev.map((r, idx) => 
        idx === i ? { ...r, status: 'processing' } : r
      ));

      try {
        const auth = sessionStorage.getItem('adminAuth') || '';
        const response = await fetch(`${API_BASE}/admin/brand-research`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'auth': auth
          },
          body: JSON.stringify({ brandName: brands[i] }),
          signal: controller.signal
        });

        const data = await response.json();

        if (data.success && data.brand) {
          // Update with successful result
          setResults(prev => prev.map((r, idx) => 
            idx === i ? {
              ...r,
              type: data.brand.type || '',
              priceRange: data.brand.priceRange || '',
              category: data.brand.category || '',
              values: data.brand.values || '',
              maxWomensSize: data.brand.maxWomensSize || '',
              description: data.brand.description || '',
              evidence: data.brand.evidence,
              status: 'completed'
            } : r
          ));
        } else {
          // Mark as failed
          setResults(prev => prev.map((r, idx) => 
            idx === i ? {
              ...r,
              status: 'failed',
              error: data.error || 'Failed to research brand'
            } : r
          ));
        }
      } catch (error: any) {
        // Don't mark as failed if aborted by user
        if (error.name === 'AbortError') {
          console.log(`Request aborted for brand ${brands[i]}`);
          break;
        }
        
        console.error(`Error researching brand ${brands[i]}:`, error);
        setResults(prev => prev.map((r, idx) => 
          idx === i ? {
            ...r,
            status: 'failed',
            error: 'Network error or timeout'
          } : r
        ));
      }
    }

    setIsProcessing(false);
    setCurrentIndex(-1);
    setAbortController(null);
  };

  const handleRetry = async (index: number) => {
    const brand = results[index];
    
    setResults(prev => prev.map((r, idx) => 
      idx === index ? { ...r, status: 'processing', error: undefined } : r
    ));

    try {
      const auth = sessionStorage.getItem('adminAuth') || '';
      const response = await fetch(`${API_BASE}/admin/brand-research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify({ brandName: brand.name })
      });

      const data = await response.json();

      if (data.success && data.brand) {
        setResults(prev => prev.map((r, idx) => 
          idx === index ? {
            ...r,
            type: data.brand.type || '',
            priceRange: data.brand.priceRange || '',
            category: data.brand.category || '',
            values: data.brand.values || '',
            maxWomensSize: data.brand.maxWomensSize || '',
            description: data.brand.description || '',
            evidence: data.brand.evidence,
            status: 'completed'
          } : r
        ));
      } else {
        setResults(prev => prev.map((r, idx) => 
          idx === index ? {
            ...r,
            status: 'failed',
            error: data.error || 'Failed to research brand'
          } : r
        ));
      }
    } catch (error) {
      console.error(`Error retrying brand ${brand.name}:`, error);
      setResults(prev => prev.map((r, idx) => 
        idx === index ? {
          ...r,
          status: 'failed',
          error: 'Network error or timeout'
        } : r
      ));
    }
  };

  const handleCopyTable = () => {
    // Create TSV format with evidence columns (no headers, multi-values comma-separated)
    const completedResults = results.filter(r => r.status === 'completed');
    
    if (completedResults.length === 0) {
      toast.error('No completed results to copy');
      return;
    }

    const tsv = completedResults
      .map(r => {
        // Format product samples as "Product 1 ($X), Product 2 ($Y), ..."
        const productSamples = r.evidence?.products 
          ? r.evidence.products.map(p => `${p.name} ($${p.price})`).join(', ')
          : '';
        
        const medianPrice = r.evidence?.medianPrice 
          ? `$${r.evidence.medianPrice}`
          : '';
        
        return [
          r.name, 
          r.type, 
          r.priceRange, 
          r.category, 
          r.values, 
          r.maxWomensSize,
          r.description,
          medianPrice,
          productSamples
        ].join('\t');
      })
      .join('\n');

    navigator.clipboard.writeText(tsv).then(() => {
      toast.success(`Table copied! ${completedResults.length} rows ready to paste into Airtable.`);
    }).catch(err => {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy to clipboard');
    });
  };

  const handleClear = () => {
    // Abort any in-flight requests
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    
    // Reset all state
    setBrandNames('');
    setResults([]);
    setCurrentIndex(-1);
    setTotalBrands(0);
    setIsProcessing(false);
    
    toast.success('Table and input cleared');
  };

  const completedCount = results.filter(r => r.status === 'completed').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 16px' }}>
      <div style={{ width: '100%', maxWidth: '700px' }}>
        <div className="border border-border bg-white" style={{ padding: '48px' }}>
          <h1 
            className="mb-2 tracking-tight" 
            style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '31px' }}
          >
            Add Brands
          </h1>
          <p 
            className="text-muted-foreground mb-10" 
            style={{ fontFamily: 'Crimson Pro, serif' }}
          >
            Research fashion brands using AI to automatically categorize pricing, values, and size ranges.
          </p>

          {/* Input Form */}
          <form onSubmit={handleSubmit}>
            <div className="space-y-2" style={{ marginBottom: '32px' }}>
              <Label 
                htmlFor="brand-names"
                style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '16px' }}
              >
                Brand Names (one per line)
              </Label>
              <Textarea
                id="brand-names"
                value={brandNames}
                onChange={(e) => setBrandNames(e.target.value)}
                placeholder="Tove&#10;The Row&#10;Staud&#10;..."
                rows={10}
                className="text-sm"
                style={{ fontFamily: 'monospace' }}
                disabled={isProcessing}
              />
            </div>
            
            <div style={{ marginTop: '24px', display: 'flex', gap: '12px' }}>
              <Button 
                type="submit" 
                disabled={isProcessing || !brandNames.trim()}
                style={{ 
                  fontFamily: 'DM Sans, sans-serif',
                  backgroundColor: '#000',
                  color: '#fff',
                  height: '48px',
                  paddingLeft: '32px',
                  paddingRight: '32px',
                  whiteSpace: 'nowrap'
                }}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Researching ({currentIndex + 1} of {totalBrands})...
                  </>
                ) : (
                  'Research Brands'
                )}
              </Button>
              
              <Button 
                type="button"
                onClick={handleClear}
                disabled={!brandNames.trim() && results.length === 0}
                variant="outline"
                style={{ 
                  fontFamily: 'DM Sans, sans-serif',
                  height: '48px',
                  paddingLeft: '32px',
                  paddingRight: '32px',
                  whiteSpace: 'nowrap'
                }}
              >
                <X className="mr-2 h-4 w-4" />
                {isProcessing ? 'Cancel & Clear' : 'Clear'}
              </Button>
            </div>
          </form>

        </div>

        {/* Progress and Results */}
        {results.length > 0 && (
          <div className="border border-border bg-white mt-6" style={{ padding: '48px' }}>
            {/* Progress Status */}
            <div className="border border-border bg-muted mb-6" style={{ padding: '16px' }}>
              <div className="flex items-center justify-between text-sm" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                <span>
                  <strong>Completed:</strong> {completedCount} / {totalBrands}
                </span>
                {failedCount > 0 && (
                  <span className="text-destructive">
                    <strong>Failed:</strong> {failedCount}
                  </span>
                )}
              </div>
            </div>

            {/* Results Table Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 
                className="tracking-tight" 
                style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '24px' }}
              >
                Results
              </h2>
              <Button
                onClick={handleCopyTable}
                variant="outline"
                disabled={completedCount === 0}
                style={{ 
                  fontFamily: 'DM Sans, sans-serif',
                  height: '48px',
                  paddingLeft: '32px',
                  paddingRight: '32px'
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy Table ({completedCount} rows)
              </Button>
            </div>

            {/* Results Table */}
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Price Range</th>
                    <th className="px-4 py-3 text-left font-medium">Median Price</th>
                    <th className="px-4 py-3 text-left font-medium">Category</th>
                    <th className="px-4 py-3 text-left font-medium">Values</th>
                    <th className="px-4 py-3 text-left font-medium">Max Size</th>
                    <th className="px-4 py-3 text-left font-medium">Description</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-4 py-3 font-medium">{result.name}</td>
                      <td className="px-4 py-3">{result.type}</td>
                      <td className="px-4 py-3">{result.priceRange}</td>
                      <td className="px-4 py-3">
                        {result.evidence?.medianPrice ? (
                          <span className="text-muted-foreground">
                            ${result.evidence.medianPrice}
                            <span className="text-xs ml-1">
                              ({result.evidence.products?.length || 0} products)
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{result.category}</td>
                      <td className="px-4 py-3">{result.values}</td>
                      <td className="px-4 py-3">{result.maxWomensSize}</td>
                      <td className="px-4 py-3 max-w-md">
                        {result.description ? (
                          <span className="text-sm text-muted-foreground line-clamp-3">
                            {result.description}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {result.status === 'pending' && (
                          <span className="text-muted-foreground">Pending</span>
                        )}
                        {result.status === 'processing' && (
                          <span className="flex items-center text-blue-600">
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Processing...
                          </span>
                        )}
                        {result.status === 'completed' && (
                          <span className="text-green-600">✓ Complete</span>
                        )}
                        {result.status === 'failed' && (
                          <div className="flex items-center gap-2">
                            <span className="text-destructive text-xs">
                              {result.error || 'Failed'}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRetry(index)}
                              className="h-6 px-2"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
