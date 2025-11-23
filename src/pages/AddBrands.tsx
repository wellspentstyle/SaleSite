import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Loader2, Copy, RotateCcw, X, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { EditBrandDialog } from '../components/EditBrandDialog';

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
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  partialData?: boolean; // Flag for missing price data
  error?: string;
  evidence?: {
    products: Product[];
    medianPrice: number | null;
  };
}

export function AddBrands() {
  const [brandNames, setBrandNames] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<BrandResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [totalBrands, setTotalBrands] = useState<number>(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<number>>(new Set());

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
      url: '',
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
              url: data.brand.url || '',
              evidence: data.brand.evidence,
              partialData: data.partialData || false,
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
            url: data.brand.url || '',
            evidence: data.brand.evidence,
            partialData: data.partialData || false,
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
    // Note: Type is always "Brand" so we hardcode it instead of using r.type
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
          'Brand', // Always "Brand" for this tool
          r.priceRange, 
          r.category, 
          r.values, 
          r.maxWomensSize,
          r.description,
          r.url,
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

  const handleCancel = () => {
    // Abort in-flight requests but keep results
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
    setIsProcessing(false);
    setCurrentIndex(-1);
    toast.info('Processing cancelled - results preserved');
  };

  const handleClear = () => {
    // Reset all state
    setBrandNames('');
    setResults([]);
    setCurrentIndex(-1);
    setTotalBrands(0);
    setIsProcessing(false);
    
    toast.success('Table and input cleared');
  };

  const handleEditSave = (index: number, updatedData: BrandResult) => {
    setResults(prev => prev.map((r, idx) => {
      if (idx === index) {
        const merged = { ...r, ...updatedData };
        // Clear partialData flag if user manually added price info
        if (merged.priceRange && merged.priceRange.trim() !== '') {
          merged.partialData = false;
        }
        return merged;
      }
      return r;
    }));
    toast.success('Brand data updated');
  };

  const handleSendToAirtable = async () => {
    const completedResults = results.filter(r => r.status === 'completed');
    
    if (completedResults.length === 0) {
      toast.error('No completed results to send');
      return;
    }

    const auth = sessionStorage.getItem('adminAuth') || '';
    let updatedCount = 0;
    let createdCount = 0;
    let failedCount = 0;

    toast.info(`Sending ${completedResults.length} brands to Airtable...`);

    for (const result of completedResults) {
      try {
        // Handle both string and array formats for category/values
        const categoryArray = Array.isArray(result.category)
          ? result.category
          : (result.category ? result.category.split(',').map(c => c.trim()).filter(c => c) : []);
        
        const valuesArray = Array.isArray(result.values)
          ? result.values
          : (result.values ? result.values.split(',').map(v => v.trim()).filter(v => v) : []);
        
        const response = await fetch(`${API_BASE}/admin/update-brand-in-airtable`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'auth': auth
          },
          body: JSON.stringify({
            brandData: {
              name: result.name,
              type: result.type || 'Brand',
              priceRange: result.priceRange,
              category: categoryArray,
              values: valuesArray,
              maxWomensSize: result.maxWomensSize,
              description: result.description,
              url: result.url
            }
          })
        });

        const data = await response.json();

        if (data.success) {
          if (data.action === 'updated') {
            updatedCount++;
          } else if (data.action === 'created') {
            createdCount++;
          }
        } else {
          failedCount++;
          console.error(`Failed to send ${result.name}:`, data.message);
        }
      } catch (error) {
        failedCount++;
        console.error(`Error sending ${result.name}:`, error);
      }
    }

    // Show summary toast
    const summary = [];
    if (createdCount > 0) summary.push(`${createdCount} created`);
    if (updatedCount > 0) summary.push(`${updatedCount} updated`);
    if (failedCount > 0) summary.push(`${failedCount} failed`);

    if (failedCount === 0) {
      toast.success(`Successfully sent to Airtable! ${summary.join(', ')}`);
    } else {
      toast.warning(`Partially completed: ${summary.join(', ')}`);
    }
  };

  const completedCount = results.filter(r => r.status === 'completed').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Add Brands</h1>
            <p className="text-gray-600 mt-1">Research fashion brands using AI to automatically categorize pricing, values, and size ranges</p>
          </div>
        </div>

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
              
              {isProcessing ? (
                <Button 
                  type="button"
                  onClick={handleCancel}
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
                  Cancel
                </Button>
              ) : (
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
                  Clear
                </Button>
              )}
            </div>

            {/* Live Progress Indicator */}
            {isProcessing && currentIndex >= 0 && results[currentIndex] && (
              <div style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
                color: '#666',
                marginTop: '12px',
                paddingTop: '8px'
              }}>
                Researching: {results[currentIndex].name}
                {results[currentIndex].status === 'processing' && (
                  <span style={{ marginLeft: '8px', color: '#999' }}>
                    (gathering brand information...)
                  </span>
                )}
              </div>
            )}
          </form>

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
              <div style={{ display: 'flex', gap: '12px' }}>
                <Button
                  onClick={handleSendToAirtable}
                  disabled={completedCount === 0}
                  style={{ 
                    fontFamily: 'DM Sans, sans-serif',
                    height: '48px',
                    paddingLeft: '32px',
                    paddingRight: '32px',
                    backgroundColor: '#000',
                    color: '#fff'
                  }}
                >
                  Send to Airtable ({completedCount})
                </Button>
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
                  Copy Table
                </Button>
              </div>
            </div>

            {/* Results Table */}
            <div className="border rounded-lg overflow-hidden">
              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '600px' }}>
                <table className="text-sm" style={{ fontFamily: 'DM Sans, sans-serif', width: '100%', minWidth: '1400px' }}>
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium" style={{ minWidth: '150px' }}>Name</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ minWidth: '100px' }}>Price Range</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ minWidth: '120px' }}>Median Price</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ minWidth: '150px' }}>Category</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ minWidth: '180px' }}>Values</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ minWidth: '100px' }}>Max Size</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ minWidth: '250px' }}>Description</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ minWidth: '150px' }}>URL</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ minWidth: '120px' }}>Status</th>
                    <th className="px-4 py-3 text-left font-medium" style={{ minWidth: '100px' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-4 py-3 font-medium">{result.name}</td>
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
                      <td className="px-4 py-3" style={{ maxWidth: '300px' }}>
                        {result.description ? (
                          <span 
                            className="text-sm text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                            onClick={() => {
                              setExpandedDescriptions(prev => {
                                const next = new Set(prev);
                                if (next.has(index)) {
                                  next.delete(index);
                                } else {
                                  next.add(index);
                                }
                                return next;
                              });
                            }}
                          >
                            {expandedDescriptions.has(index) || result.description.length <= 100
                              ? result.description
                              : result.description.substring(0, 100) + '...'}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {result.url ? (
                          <a 
                            href={result.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            {result.url.replace('https://', '').replace('www.', '')}
                          </a>
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
                          <span className={result.partialData ? "text-amber-600" : "text-green-600"}>
                            {result.partialData ? '⚠ Partial' : '✓ Complete'}
                          </span>
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
                      <td className="px-4 py-3">
                        {(result.status === 'completed' || result.status === 'failed') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingIndex(index)}
                            className="h-8 px-2"
                            style={{ fontFamily: 'DM Sans, sans-serif' }}
                          >
                            <Edit2 className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
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

        {/* Edit Brand Dialog */}
        {editingIndex !== null && results[editingIndex] && (
          <EditBrandDialog
            open={editingIndex !== null}
            onOpenChange={(open) => !open && setEditingIndex(null)}
            brandData={{
              name: results[editingIndex].name,
              type: results[editingIndex].type,
              priceRange: results[editingIndex].priceRange,
              category: results[editingIndex].category,
              values: results[editingIndex].values,
              maxWomensSize: results[editingIndex].maxWomensSize,
              description: results[editingIndex].description,
              url: results[editingIndex].url
            }}
            onSave={(updatedData) => handleEditSave(editingIndex, updatedData)}
          />
        )}
      </div>
    </div>
  );
}
