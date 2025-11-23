import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Input } from '../components/ui/input';
import { Loader2, ExternalLink, ArrowLeft, AlertTriangle, Power, Edit, FileEdit, Trash2, X } from 'lucide-react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

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
  promoCode?: string;
}

type View = 'sales-list' | 'url-entry' | 'drafts';
type FilterType = 'active-no-picks' | 'active-with-picks' | 'inactive';

interface Draft {
  id: string;
  saleId: string;
  saleName: string;
  salePercentOff: number;
  picks: any[];
  createdAt: string;
  updatedAt: string;
  type?: 'manual' | 'finalize';
  manualEntries?: any[];
  failedUrls?: string[];
}

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
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [urls, setUrls] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingSales, setLoadingSales] = useState(true);
  const [loadingDrafts, setLoadingDrafts] = useState(false);
  const [filterType, setFilterType] = useState<FilterType>('active-no-picks');
  const [currentView, setCurrentView] = useState<View>('sales-list');
  const [protectionWarning, setProtectionWarning] = useState<ProtectionWarning>({
    show: false,
    store: '',
    successRate: '',
    recommendation: '',
    urlsToScrape: []
  });
  
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<Sale | null>(null);
  const cancelScrapingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [editForm, setEditForm] = useState({
    percentOff: '',
    promoCode: '',
    endDate: ''
  });
  const [deactivateSale, setDeactivateSale] = useState<Sale | null>(null);

  useEffect(() => {
    fetchSales();
    if (currentView === 'drafts') {
      fetchDrafts();
    }
  }, [currentView]);

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

  const fetchDrafts = async () => {
    setLoadingDrafts(true);
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

    try {
      // Fetch both manual pick drafts and finalize drafts
      const [manualResponse, finalizeResponse] = await Promise.all([
        fetch(`${API_BASE}/admin/manual-picks/drafts`, {
          headers: { 'auth': auth }
        }),
        fetch(`${API_BASE}/admin/finalize-drafts`, {
          headers: { 'auth': auth }
        })
      ]);

      const manualData = await manualResponse.json();
      const finalizeData = await finalizeResponse.json();

      const allDrafts = [
        ...(manualData.success ? manualData.drafts.map((d: Draft) => ({ ...d, type: 'manual' as const })) : []),
        ...(finalizeData.success ? finalizeData.drafts.map((d: Draft) => ({ ...d, type: 'finalize' as const })) : [])
      ];

      // Sort by updated date, newest first
      allDrafts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      
      setDrafts(allDrafts);
    } catch (error) {
      console.error('Failed to fetch drafts:', error);
    } finally {
      setLoadingDrafts(false);
    }
  };

  const handleSaleClick = (sale: Sale) => {
    setSelectedSale(sale);
    setUrls('');
    setCurrentView('url-entry');
  };

  const handleManualEntry = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    const urlList = urls.trim().split('\n').filter(url => url.trim());
    
    navigate('/admin/picks/manual', {
      state: {
        selectedSaleId: sale?.id ?? selectedSale?.id,
        saleName: sale?.saleName ?? selectedSale?.saleName,
        salePercentOff: sale?.percentOff ?? selectedSale?.percentOff,
        urls: urlList.length > 0 ? urlList : undefined
      }
    });
  };

  const handleBackToSales = () => {
    setCurrentView('sales-list');
    setSelectedSale(null);
    setUrls('');
  };

  const handleResumeDraft = (draft: Draft) => {
    if (draft.type === 'finalize') {
      // For finalize drafts, navigate to the finalize picks page
      // The FinalizePicks page will auto-load the draft on mount
      navigate('/admin/picks/finalize', {
        state: {
          scrapedProducts: draft.picks || [],
          selectedSaleId: draft.saleId,
          saleName: draft.saleName,
          salePercentOff: draft.salePercentOff,
          failures: (draft.failedUrls || []).map((url: string) => ({ url, error: 'Previously failed' }))
        }
      });
    } else {
      // For manual drafts, navigate to the manual entry page
      navigate('/admin/picks/manual', {
        state: {
          selectedSaleId: draft.saleId,
          saleName: draft.saleName,
          salePercentOff: draft.salePercentOff,
          draftId: draft.id
        }
      });
    }
  };

  const handleDeleteDraft = async (draftId: string, draftType: 'manual' | 'finalize') => {
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';
    
    try {
      const endpoint = draftType === 'manual' 
        ? `${API_BASE}/admin/manual-picks/drafts/${draftId}`
        : `${API_BASE}/admin/finalize-drafts/${draftId}`;
        
      const response = await fetch(endpoint, {
        method: 'DELETE',
        headers: { 'auth': auth }
      });
      
      const data = await response.json();
      if (data.success) {
        toast.success('Draft deleted');
        fetchDrafts();
      } else {
        toast.error(data.message || 'Failed to delete draft');
      }
    } catch (error) {
      toast.error('An error occurred while deleting draft');
    }
  };

  const handleToggleActive = async (sale: Sale, e: React.MouseEvent) => {
    e.stopPropagation();
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';
    const newLiveStatus = sale.live === 'YES' ? 'NO' : 'YES';

    setSales(prevSales => 
      prevSales.map(s => 
        s.id === sale.id ? { ...s, live: newLiveStatus } : s
      )
    );

    try {
      const response = await fetch(`${API_BASE}/admin/sales/${sale.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify({ live: newLiveStatus })
      });

      const data = await response.json();
      if (!data.success) {
        setSales(prevSales => 
          prevSales.map(s => 
            s.id === sale.id ? { ...s, live: sale.live } : s
          )
        );
        toast.error('Failed to update sale status');
      } else {
        toast.success(`Sale ${newLiveStatus === 'YES' ? 'activated' : 'deactivated'}`);
      }
    } catch (error) {
      setSales(prevSales => 
        prevSales.map(s => 
          s.id === sale.id ? { ...s, live: sale.live } : s
        )
      );
      toast.error('Failed to update sale status');
    }
  };

  const handleOpenEditDialog = (sale: Sale, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingSale(sale);
    setEditForm({
      percentOff: sale.percentOff.toString(),
      promoCode: sale.promoCode || '',
      endDate: sale.endDate || ''
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editingSale) return;
    
    if (!editForm.percentOff || isNaN(parseInt(editForm.percentOff))) {
      toast.error('Please enter a valid discount percentage');
      return;
    }
    
    const percentOffValue = parseInt(editForm.percentOff);
    if (percentOffValue < 0 || percentOffValue > 100) {
      toast.error('Discount percentage must be between 0 and 100');
      return;
    }
    
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

    try {
      const response = await fetch(`${API_BASE}/admin/sales/${editingSale.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify({
          percentOff: percentOffValue,
          promoCode: editForm.promoCode,
          endDate: editForm.endDate
        })
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Sale updated successfully');
        setEditDialogOpen(false);
        fetchSales();
      } else {
        toast.error(data.message || 'Failed to update sale');
      }
    } catch (error) {
      toast.error('Failed to update sale');
    }
  };

  const performScraping = async (urlList: string[]) => {
    setIsLoading(true);
    cancelScrapingRef.current = false;
    const auth = sessionStorage.getItem('adminAuth');

    const scrapedProducts: any[] = [];
    const failures: any[] = [];
    
    // Create and store AbortController
    abortControllerRef.current = new AbortController();

    try {
      // Use streaming endpoint with POST body
      const response = await fetch(`${API_BASE}/admin/scrape-product-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth || ''
        },
        body: JSON.stringify({ urls: urlList }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error('Failed to start scraping');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      let currentEvent = '';

      while (true) {
        const { done, value } = await reader.read();
        
        if (done || cancelScrapingRef.current) {
          if (cancelScrapingRef.current) {
            reader.cancel();
            toast.info('Scraping cancelled');
          }
          break;
        }

        // Add new chunk to buffer
        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));

              if (currentEvent === 'start') {
                toast.info(`Scraping ${data.total} products...`);
              } else if (currentEvent === 'scraping') {
                toast.info(`Scraping ${data.progress.current}/${data.progress.total}...`, {
                  duration: 1000
                });
              } else if (currentEvent === 'success') {
                scrapedProducts.push({
                  ...data.product,
                  confidence: data.confidence,
                  extractionMethod: data.extractionMethod
                });
                toast.success(`Scraped: ${data.product.name}`);
              } else if (currentEvent === 'error' || currentEvent === 'skip') {
                failures.push({
                  url: data.url,
                  error: data.error
                });
                if (currentEvent === 'error') {
                  toast.error(`Failed: ${data.error}`);
                }
              } else if (currentEvent === 'complete') {
                toast.success(`Complete: ${data.successCount} succeeded, ${data.failureCount} failed`);
              }
              
              currentEvent = '';
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      // Only navigate if not cancelled
      if (!cancelScrapingRef.current) {
        navigate('/admin/picks/finalize', {
          state: {
            scrapedProducts,
            selectedSaleId: selectedSale?.id,
            saleName: selectedSale?.saleName,
            salePercentOff: selectedSale?.percentOff,
            failures
          }
        });
      }

    } catch (error: any) {
      if (!cancelScrapingRef.current) {
        console.error('Scraping error:', error);
        toast.error('An error occurred while scraping. Please try again.');
      }
    } finally {
      setIsLoading(false);
      cancelScrapingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  const handleCancelScraping = () => {
    cancelScrapingRef.current = true;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
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

  const handleCancelProtectionWarning = () => {
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
              <Button
                variant="outline"
                onClick={() => setCurrentView('drafts')}
                style={{ fontFamily: 'DM Sans, sans-serif' }}
              >
                View Drafts {drafts.length > 0 && `(${drafts.length})`}
              </Button>
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
              
              <button
                onClick={() => setCurrentView('drafts')}
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  padding: '8px 16px',
                  backgroundColor: '#fff',
                  color: '#000',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 400,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#999';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#ddd';
                }}
              >
                Manual Entry Needed
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
                  className="border bg-white cursor-pointer transition-all hover:shadow-md"
                  style={{ 
                    padding: '20px', 
                    paddingRight: '60px',
                    borderRadius: '4px',
                    borderColor: '#e5e7eb',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#9ca3af';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e5e7eb';
                  }}
                >
                  <div className="mb-3">
                    <h3 
                      style={{ 
                        fontFamily: 'DM Sans, sans-serif', 
                        fontWeight: 600, 
                        fontSize: '16px'
                      }}
                    >
                      {sale.saleName}
                    </h3>
                  </div>
                  
                  <div 
                    style={{ 
                      position: 'absolute', 
                      top: '20px', 
                      right: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      alignItems: 'center'
                    }}
                  >
                    {sale.saleUrl && (
                      <ExternalLink className="h-4 w-4 text-muted-foreground" style={{ color: '#6b7280' }} />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditDialog(sale, e);
                      }}
                      style={{ 
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: '#6b7280'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#374151'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (sale.live === 'YES') {
                          setDeactivateSale(sale);
                        } else {
                          handleToggleActive(sale, e);
                        }
                      }}
                      style={{ 
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '4px',
                        color: '#6b7280'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#374151'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#6b7280'}
                    >
                      {sale.live === 'YES' ? <X className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    </button>
                  </div>
                  
                  <div className="space-y-2">
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
                    
                    {sale.promoCode && (
                      <p className="text-xs text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                        Code: <span className="font-mono">{sale.promoCode}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : currentView === 'url-entry' ? (
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
            
            {selectedSale?.saleUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(selectedSale.saleUrl, '_blank')}
                className="mt-3"
                style={{ fontFamily: 'DM Sans, sans-serif' }}
              >
                <ExternalLink className="mr-2 h-3 w-3" />
                Launch sale page
              </Button>
            )}
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

            <div className="flex gap-3">
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
              
              {isLoading && (
                <Button 
                  type="button"
                  onClick={handleCancelScraping}
                  variant="outline"
                  style={{ 
                    fontFamily: 'DM Sans, sans-serif',
                    height: '44px',
                    paddingLeft: '24px',
                    paddingRight: '24px',
                    borderColor: '#e5e5e5',
                    color: '#666'
                  }}
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              )}
              
              <Button
                type="button"
                variant="outline"
                onClick={() => handleManualEntry(selectedSale!)}
                style={{ 
                  fontFamily: 'DM Sans, sans-serif',
                  height: '44px',
                  paddingLeft: '24px',
                  paddingRight: '24px'
                }}
                disabled={isLoading || !urls.trim()}
              >
                <FileEdit className="mr-2 h-4 w-4" />
                Manual Entry
              </Button>
            </div>
          </form>
        </div>
      ) : currentView === 'drafts' ? (
        <div className="border border-border bg-white" style={{ padding: '32px', borderRadius: '4px' }}>
          <div className="mb-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentView('sales-list')}
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
              Saved Drafts
            </h2>
            <p className="text-sm text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Resume editing incomplete manual pick entries.
            </p>
          </div>

          {loadingDrafts ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground" style={{ padding: '60px' }}>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Loading drafts...</span>
            </div>
          ) : drafts.length === 0 ? (
            <div className="border border-dashed border-border bg-muted/20" style={{ padding: '60px', textAlign: 'center', borderRadius: '8px' }}>
              <p className="text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                No saved drafts found.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  className="border bg-white"
                  style={{ 
                    padding: '20px', 
                    borderRadius: '4px',
                    borderColor: '#e5e7eb'
                  }}
                >
                  <div className="mb-3">
                    <h3 
                      style={{ 
                        fontFamily: 'DM Sans, sans-serif', 
                        fontWeight: 600, 
                        fontSize: '16px',
                        marginBottom: '4px'
                      }}
                    >
                      {draft.saleName}
                    </h3>
                    <p className="text-xs text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                      {draft.salePercentOff}% Off
                      {draft.picks.length > 0 && ` • ${draft.picks.length} pick${draft.picks.length !== 1 ? 's' : ''}`}
                      {draft.type === 'finalize' && draft.manualEntries && draft.manualEntries.length > 0 && ` • ${draft.manualEntries.length} manual entr${draft.manualEntries.length !== 1 ? 'ies' : 'y'}`}
                    </p>
                  </div>
                  
                  <div className="text-xs text-muted-foreground mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    Last updated: {new Date(draft.updatedAt).toLocaleDateString()} at {new Date(draft.updatedAt).toLocaleTimeString()}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleResumeDraft(draft)}
                      style={{ 
                        fontFamily: 'DM Sans, sans-serif',
                        backgroundColor: '#000',
                        color: '#fff',
                        flex: 1
                      }}
                    >
                      Resume Editing
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteDraft(draft.id, draft.type || 'manual')}
                      style={{ 
                        fontFamily: 'DM Sans, sans-serif',
                        color: '#ef4444',
                        borderColor: '#ef4444'
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Edit Sale Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent style={{ fontFamily: 'DM Sans, sans-serif' }}>
          <DialogHeader>
            <DialogTitle>Edit Sale</DialogTitle>
            <DialogDescription>
              Update the details for {editingSale?.saleName}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="percentOff">Discount Percentage</Label>
              <Input
                id="percentOff"
                type="number"
                min="0"
                max="100"
                value={editForm.percentOff}
                onChange={(e) => setEditForm({ ...editForm, percentOff: e.target.value })}
                placeholder="e.g. 20"
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="promoCode">Promo Code (Optional)</Label>
              <Input
                id="promoCode"
                value={editForm.promoCode}
                onChange={(e) => setEditForm({ ...editForm, promoCode: e.target.value })}
                placeholder="e.g. SALE20"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date (Optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={editForm.endDate}
                onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} style={{ backgroundColor: '#000', color: '#fff' }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={!!deactivateSale} onOpenChange={(open) => {
        if (!open) setDeactivateSale(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Deactivate Sale
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Are you sure you want to deactivate <strong>{deactivateSale?.saleName}</strong>? 
              This will remove it from the public website.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeactivateSale(null)} style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (deactivateSale) {
                  handleToggleActive(deactivateSale, { stopPropagation: () => {} } as any);
                  setDeactivateSale(null);
                }
              }} 
              style={{ fontFamily: 'DM Sans, sans-serif', backgroundColor: '#dc2626', color: '#fff' }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Protection Warning Modal */}
      <AlertDialog open={protectionWarning.show} onOpenChange={(open) => {
        if (!open) handleCancelProtectionWarning();
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
            <AlertDialogCancel onClick={handleCancelProtectionWarning} style={{ fontFamily: 'DM Sans, sans-serif' }}>
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
