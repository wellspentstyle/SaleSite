import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink, ChevronRight, Instagram, Clock } from 'lucide-react';

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

interface SavedAsset {
  saleId: string;
  saleName: string;
  assetCount: number;
  successCount: number;
  createdAt: string;
}

type TabType = 'ready-to-post' | 'has-picks' | 'no-picks' | 'assets-generated';

export function GenerateAssets() {
  const navigate = useNavigate();
  const [sales, setSales] = useState<Sale[]>([]);
  const [savedAssets, setSavedAssets] = useState<SavedAsset[]>([]);
  const [loadingSales, setLoadingSales] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('ready-to-post');

  useEffect(() => {
    fetchSales();
    fetchSavedAssets();
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

  const fetchSavedAssets = async () => {
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

    try {
      const response = await fetch(`${API_BASE}/admin/saved-assets`, {
        headers: { 'auth': auth }
      });
      const data = await response.json();
      if (data.success) {
        setSavedAssets(data.savedAssets || []);
      }
    } catch (error) {
      console.error('Failed to fetch saved assets:', error);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
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

  const handleConfigureSale = (sale: Sale) => {
    navigate(`/admin/assets/configure/${sale.id}`);
  };

  const filteredSales = getFilteredSales();

  const tabs: { id: TabType; label: string; count: number }[] = [
    { id: 'ready-to-post', label: 'Ready to Post', count: savedAssets.length },
    { id: 'has-picks', label: 'Has Picks', count: salesWithPicks.length },
    { id: 'no-picks', label: 'Needs Picks', count: salesWithoutPicks.length },
    { id: 'assets-generated', label: 'Assets Generated', count: salesWithAssets.length },
  ];

  return (
    <div className="p-4 md:p-8 admin-page">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Generate Assets</h1>
          <p className="text-gray-600 mt-1 text-sm md:text-base">
            Click on a sale to configure and generate social media assets
          </p>
        </div>

        <div className="border-b border-border overflow-x-auto">
          <nav className="flex gap-4 md:gap-6 min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 text-xs md:text-sm font-medium transition-colors relative whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'text-black border-b-2 border-black'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`ml-1.5 md:ml-2 px-1.5 md:px-2 py-0.5 text-xs rounded-full ${
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
            {activeTab === 'ready-to-post' && (
              <div className="space-y-4">
                {savedAssets.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-gray-300 rounded-lg">
                    <Instagram className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                    <p className="text-muted-foreground text-sm">
                      No saved assets ready to post
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Generate assets from the "Has Picks" tab to save them here
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {savedAssets.map((asset) => (
                      <div
                        key={asset.saleId}
                        onClick={() => navigate(`/admin/assets/results?saleId=${asset.saleId}`)}
                        className="border border-border bg-white cursor-pointer transition-all hover:shadow-md hover:border-black p-5 group"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h3 className="font-semibold text-base">
                              {asset.saleName}
                            </h3>
                            <div className="flex items-center gap-3 mt-2 text-sm text-gray-600">
                              <span className="flex items-center gap-1">
                                <Instagram className="h-3.5 w-3.5" />
                                {asset.successCount} asset{asset.successCount !== 1 ? 's' : ''}
                              </span>
                              <span className="text-gray-400">|</span>
                              <span className="flex items-center gap-1 text-gray-500">
                                <Clock className="h-3.5 w-3.5" />
                                {formatTimeAgo(asset.createdAt)}
                              </span>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-black transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'has-picks' && (
              <div className="space-y-4">
                {filteredSales.length === 0 ? (
                  <p className="text-muted-foreground text-sm py-8 text-center">
                    No sales with picks ready for asset generation
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredSales.map((sale) => (
                      <div
                        key={sale.id}
                        onClick={() => handleConfigureSale(sale)}
                        className="border border-border bg-white cursor-pointer transition-all hover:shadow-md hover:border-black p-5 group"
                      >
                        <div className="flex items-start justify-between">
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
                          <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-black transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
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
                        onClick={() => handleConfigureSale(sale)}
                        className="border border-border bg-white p-5 cursor-pointer hover:shadow-md hover:border-black transition-all group"
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
                          <div className="flex items-center gap-2">
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
                            <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-black transition-colors" />
                          </div>
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
