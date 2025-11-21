import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Loader2, Copy, RotateCcw } from 'lucide-react';

const API_BASE = '/api';

interface BrandResult {
  name: string;
  type: string;
  priceRange: string;
  category: string;
  values: string;
  maxWomensSize: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export function AddBrands() {
  const [brandNames, setBrandNames] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<BrandResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [totalBrands, setTotalBrands] = useState<number>(0);

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
      alert('Please enter at least one brand name');
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
      status: 'pending'
    }));

    setResults(initialResults);
    setTotalBrands(brands.length);
    setIsProcessing(true);
    setCurrentIndex(0);

    // Process brands sequentially
    for (let i = 0; i < brands.length; i++) {
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
          body: JSON.stringify({ brandName: brands[i] })
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
      } catch (error) {
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
    // Create TSV format (no headers, multi-values comma-separated)
    const completedResults = results.filter(r => r.status === 'completed');
    
    if (completedResults.length === 0) {
      alert('No completed results to copy');
      return;
    }

    const tsv = completedResults
      .map(r => [r.name, r.type, r.priceRange, r.category, r.values, r.maxWomensSize].join('\t'))
      .join('\n');

    navigator.clipboard.writeText(tsv).then(() => {
      alert('Table copied to clipboard! Ready to paste into Airtable.');
    }).catch(err => {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    });
  };

  const completedCount = results.filter(r => r.status === 'completed').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

  return (
    <div className="p-8" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <h1 className="text-3xl tracking-tight font-bold mb-8">
        Add Brands
      </h1>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="space-y-4 max-w-2xl">
          <div>
            <Label htmlFor="brand-names" className="text-sm font-medium mb-2 block">
              Brand Names (one per line)
            </Label>
            <Textarea
              id="brand-names"
              value={brandNames}
              onChange={(e) => setBrandNames(e.target.value)}
              placeholder="Tove&#10;The Row&#10;Staud&#10;..."
              rows={10}
              className="font-mono text-sm"
              disabled={isProcessing}
            />
          </div>
          
          <Button 
            type="submit" 
            disabled={isProcessing || !brandNames.trim()}
            className="w-full"
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
        </div>
      </form>

      {/* Progress and Status */}
      {results.length > 0 && (
        <div className="mb-6 p-4 bg-muted rounded-lg max-w-2xl">
          <div className="flex items-center justify-between text-sm">
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
      )}

      {/* Results Table */}
      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Results</h2>
            <Button
              onClick={handleCopyTable}
              variant="outline"
              disabled={completedCount === 0}
            >
              <Copy className="mr-2 h-4 w-4" />
              Copy Table ({completedCount} rows)
            </Button>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Type</th>
                    <th className="px-4 py-3 text-left font-medium">Price Range</th>
                    <th className="px-4 py-3 text-left font-medium">Category</th>
                    <th className="px-4 py-3 text-left font-medium">Values</th>
                    <th className="px-4 py-3 text-left font-medium">Max Size</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-4 py-3 font-medium">{result.name}</td>
                      <td className="px-4 py-3">{result.type}</td>
                      <td className="px-4 py-3">{result.priceRange}</td>
                      <td className="px-4 py-3">{result.category}</td>
                      <td className="px-4 py-3">{result.values}</td>
                      <td className="px-4 py-3">{result.maxWomensSize}</td>
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
  );
}
