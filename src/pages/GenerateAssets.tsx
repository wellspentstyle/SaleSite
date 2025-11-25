import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

interface Sale {
  id: string;
  saleName: string;
  percentOff: number;
  live: string;
  picksCount: number;
  featuredAssetUrl: string | null;
  featuredAssetDate: string | null;
}

type TabType = 'has-picks' | 'no-picks' | 'assets-generated';

export function GenerateAssets() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [selectedAssetSales, setSelectedAssetSales] = useState<Set<string>>(new Set());
  const [isGeneratingAssets, setIsGeneratingAssets] = useState(false);
  const [assetMessage, setAssetMessage] = useState<string>('');
  const [activeTab, setActiveTab] = useState<TabType>('has-picks');

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

  const liveSales = sales.filter(sale => sale.live === 'YES');
  
  const salesWithPicks = liveSales.filter(sale => sale.picksCount > 0 && !sale.featuredAssetUrl);
  const salesWithoutPicks = liveSales.filter(sale => sale.picksCount === 0);
  const salesWithAssets = liveSales.filter(sale => sale.featuredAssetUrl);

  const getFilteredSales = () => {
    switch (activeTab) {
      case 'has-picks':
        return salesWithPicks;
      case 'no-picks':
        return salesWithoutPicks;
      case 'assets-generated':
        return salesWithAssets;
      default:
        return [];
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
        setAssetMessage(`${data.message} - Check Google Drive!`);
        setSelectedAssetSales(new Set());
        fetchSales();
        setTimeout(() => setAssetMessage(''), 8000);
      } else {
        setAssetMessage(`Error: ${data.message}`);
        setTimeout(() => setAssetMessage(''), 8000);
      }
    } catch (error) {
      console.error('Asset generation error:', error);
      setAssetMessage('Generation failed. Please try again.');
      setTimeout(() => setAssetMessage(''), 8000);
    } finally {
      setIsGeneratingAssets(false);
    }
  };

  const filteredSales = getFilteredSales();

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'has-picks', label: 'Has Picks', count: salesWithPicks.length },
    { id: 'no-picks', label: 'Needs Picks', count: salesWithoutPicks.length },
    { id: 'assets-generated', label: 'Assets Generated', count: salesWithAssets.length },
  ];

  return (
    <div className="p-8 admin-page">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Generate Assets</h1>
          <p className="text-gray-600 mt-1">
            Select sales to generate social media assets (1080x1350) saved to Google Drive
          </p>
        </div>

        {assetMessage && (
          <div className="border border-border bg-muted p-4 text-sm">
            {assetMessage}
          </div>
        )}

        <div className="border-b border-border">
          <nav className="flex gap-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedAssetSales(new Set());
                }}
                className={`pb-3 text-sm font-medium transition-colors relative ${
                  activeTab === tab.id
                    ? 'text-black border-b-2 border-black'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                    activeTab === tab.id ? 'bg-black text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {loadingSales ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading sales...</span>
          </div>
        ) : (
          <>
            {activeTab === 'has-picks' && (
              <div className="space-y-4">
                {filteredSales.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    No sales with picks ready for asset generation
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredSales.map((sale) => (
                        <div
                          key={sale.id}
                          onClick={() => handleToggleSaleForAsset(sale.id)}
                          className={`border bg-white cursor-pointer transition-all hover:shadow-md p-5 ${
                            selectedAssetSales.has(sale.id) 
                              ? 'border-black ring-1 ring-black' 
                              : 'border-border hover:border-gray-400'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedAssetSales.has(sale.id)}
                              onChange={() => handleToggleSaleForAsset(sale.id)}
                              className="h-4 w-4 mt-1"
                              disabled={isGeneratingAssets}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1">
                              <h3 className="font-semibold text-base">
                                {sale.saleName}
                              </h3>
                              <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                                <span className="font-medium">{sale.percentOff}% Off</span>
                                <span className="text-gray-400">|</span>
                                <span>{sale.picksCount} picks</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <Button 
                      onClick={handleGenerateAssets}
                      disabled={isGeneratingAssets || selectedAssetSales.size === 0}
                      className="h-12 px-8"
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
                  </>
                )}
              </div>
            )}

            {activeTab === 'no-picks' && (
              <div className="space-y-4">
                {filteredSales.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    All live sales have picks
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSales.map((sale) => (
                      <div
                        key={sale.id}
                        className="border border-border bg-white p-5 opacity-75"
                      >
                        <h3 className="font-semibold text-base">
                          {sale.saleName}
                        </h3>
                        <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                          <span className="font-medium">{sale.percentOff}% Off</span>
                          <span className="text-gray-400">|</span>
                          <span className="text-amber-600">No picks yet</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'assets-generated' && (
              <div className="space-y-4">
                {filteredSales.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    No assets generated yet
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSales.map((sale) => (
                      <div
                        key={sale.id}
                        className="border border-border bg-white p-5"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="font-semibold text-base">
                              {sale.saleName}
                            </h3>
                            <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                              <span className="font-medium">{sale.percentOff}% Off</span>
                              {sale.featuredAssetDate && (
                                <>
                                  <span className="text-gray-400">|</span>
                                  <span className="text-green-600">
                                    Generated {sale.featuredAssetDate}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                          {sale.featuredAssetUrl && (
                            <a
                              href={sale.featuredAssetUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gray-500 hover:text-black transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
