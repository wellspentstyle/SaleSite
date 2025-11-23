import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

interface Sale {
  id: string;
  saleName: string;
  percentOff: number;
  live: string;
}

export function GenerateAssets() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [selectedAssetSales, setSelectedAssetSales] = useState<Set<string>>(new Set());
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [assetMessage, setAssetMessage] = useState<string>('');

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

  const handleToggleSaleForAsset = (saleId: string) => {
    const newSet = new Set(selectedAssetSales);
    if (newSet.has(saleId)) {
      newSet.delete(saleId);
    } else {
      newSet.add(saleId);
    }
    setSelectedAssetSales(newSet);
  };

  const handleGenerateAssets = async () => {
    if (selectedAssetSales.size === 0) {
      toast.error('Please select at least one sale');
      return;
    }

    setIsGeneratingAssets(true);
    setAssetMessage(`Generating assets for ${selectedAssetSales.size} sale(s)...`);

    const auth = sessionStorage.getItem('adminAuth');

    try {
      const response = await fetch(`${API_BASE}/admin/generate-featured-assets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth || ''
        },
        body: JSON.stringify({ saleIds: Array.from(selectedAssetSales) })
      });

      const data = await response.json();

      if (data.success) {
        setAssetMessage(`✅ ${data.message} - Check Google Drive!`);
        setSelectedAssetSales(new Set());
        setTimeout(() => setAssetMessage(''), 8000);
      } else {
        setAssetMessage(`❌ Error: ${data.message}`);
        setTimeout(() => setAssetMessage(''), 8000);
      }
    } catch (error) {
      console.error('Asset generation error:', error);
      setAssetMessage('❌ Generation failed. Please try again.');
      setTimeout(() => setAssetMessage(''), 8000);
    } finally {
      setIsGeneratingAssets(false);
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Generate Assets</h1>
            <p className="text-gray-600 mt-1">Select sales to generate social media assets (1080x1350) saved to Google Drive</p>
          </div>
        </div>

          {/* Asset Generation Status Message */}
          {assetMessage && (
            <div 
              className="border border-border bg-muted mb-6" 
              style={{ 
                padding: '16px',
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px'
              }}
            >
              {assetMessage}
            </div>
          )}

          {/* Sales List */}
          {loadingSales ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading sales...</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {sales.filter(sale => sale.live === 'YES').length === 0 ? (
                <p className="text-muted-foreground text-sm col-span-full">No live sales available</p>
              ) : (
                sales.filter(sale => sale.live === 'YES').map((sale) => (
                  <div
                    key={sale.id}
                    onClick={() => handleToggleSaleForAsset(sale.id)}
                    className="border bg-white cursor-pointer transition-all border-border hover:border-gray-400 hover:shadow-md"
                    style={{ padding: '20px', borderRadius: '4px' }}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <input
                        type="checkbox"
                        checked={selectedAssetSales.has(sale.id)}
                        onChange={() => handleToggleSaleForAsset(sale.id)}
                        className="h-4 w-4 mt-1"
                        disabled={isGeneratingAssets}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1">
                        <h3 style={{ 
                          fontFamily: 'DM Sans, sans-serif', 
                          fontWeight: 600, 
                          fontSize: '16px'
                        }}>
                          {sale.saleName}
                        </h3>
                      </div>
                    </div>
                    <div className="ml-7">
                      <span className="font-semibold text-sm" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                        {sale.percentOff}% Off
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Generate Button */}
          <Button 
            onClick={handleGenerateAssets}
            disabled={isGeneratingAssets || selectedAssetSales.size === 0 || loadingSales}
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
            {isGeneratingAssets ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              `Generate ${selectedAssetSales.size > 0 ? `${selectedAssetSales.size} Asset${selectedAssetSales.size > 1 ? 's' : ''}` : 'Assets'}`
            )}
          </Button>
      </div>
    </div>
  );
}
