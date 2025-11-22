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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 16px' }}>
      <div style={{ width: '100%', maxWidth: '700px' }}>
        <div className="border border-border bg-white" style={{ padding: '48px' }}>
          <h1 
            className="mb-2 tracking-tight" 
            style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '31px' }}
          >
            Generate Assets
          </h1>
          <p 
            className="text-muted-foreground mb-10" 
            style={{ fontFamily: 'Crimson Pro, serif' }}
          >
            Select sales to generate social media assets (1080x1350). Assets will be saved to Google Drive.
          </p>

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
            <div className="space-y-3 mb-6">
              {sales.filter(sale => sale.live === 'YES').length === 0 ? (
                <p className="text-muted-foreground text-sm">No live sales available</p>
              ) : (
                sales.filter(sale => sale.live === 'YES').map((sale) => (
                  <label 
                    key={sale.id}
                    className="flex items-center gap-3 p-3 border border-border rounded hover:bg-muted cursor-pointer"
                    style={{ fontFamily: 'DM Sans, sans-serif' }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedAssetSales.has(sale.id)}
                      onChange={() => handleToggleSaleForAsset(sale.id)}
                      className="h-4 w-4"
                      disabled={isGeneratingAssets}
                    />
                    <div className="flex-1">
                      <div className="font-semibold">{sale.saleName}</div>
                      <div className="text-sm text-muted-foreground">{sale.percentOff}% off</div>
                    </div>
                  </label>
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
    </div>
  );
}
