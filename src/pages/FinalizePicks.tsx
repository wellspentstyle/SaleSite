import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Trash2, ExternalLink, Edit2, Calculator } from 'lucide-react';
import { ManualEntryForm, ManualProductData } from '../components/ManualEntryForm';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';

interface Product {
  url: string;
  name: string;
  brand?: string;
  imageUrl: string;
  originalPrice: number | null;
  salePrice: number | null;
  percentOff: number | null;
  confidence?: number;
  entryType?: string;
}

interface Failure {
  url: string;
  error: string;
}

interface LocationState {
  scrapedProducts: Product[];
  selectedSaleId: string;
  saleName?: string;
  salePercentOff?: number;
  failures?: Failure[];
  urlsToScrape?: string[];  // NEW
  startScraping?: boolean;   // NEW
}

const API_BASE = '/api';

export function FinalizePicks() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;
  
  const [picks, setPicks] = useState<Product[]>([]);
  const [manualEntries, setManualEntries] = useState<Map<string, ManualProductData>>(new Map());
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [saleName, setSaleName] = useState<string>('');
  const [salePercentOff, setSalePercentOff] = useState<number>(0);
  const [customPercentOff, setCustomPercentOff] = useState<string>('');
  const [individualCustomPercent, setIndividualCustomPercent] = useState<Map<number, string>>(new Map());
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [isEditingSale, setIsEditingSale] = useState(false);
  const [editedPercentOff, setEditedPercentOff] = useState<string>('');
  
  // Price calculator state
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcSalePrice, setCalcSalePrice] = useState<string>('');
  const [calcPercentOff, setCalcPercentOff] = useState<string>('');
  const [calcOriginalPrice, setCalcOriginalPrice] = useState<number | null>(null);
  
  // Progressive scraping state
  const [scrapingProgress, setScrapingProgress] = useState<{
    current: number;
    total: number;
    isScrapingNow: boolean;
  }>({
    current: 0,
    total: 0,
    isScrapingNow: false
  });

  useEffect(() => {
    if (!state?.scrapedProducts || !state?.selectedSaleId) {
      navigate('/admin/picks');
      return;
    }
    
    setPicks(state.scrapedProducts);
    setSelectedSaleId(state.selectedSaleId);
    setSaleName(state.saleName || '');
    setSalePercentOff(state.salePercentOff || 0);
    setFailedUrls((state.failures || []).map(f => f.url));
    
    // Try to load existing draft
    const loadDraft = async () => {
      const auth = sessionStorage.getItem('adminAuth');
      try {
        const response = await fetch(`${API_BASE}/admin/finalize-drafts`, {
          headers: { 'auth': auth || '' }
        });
        const data = await response.json();
        if (data.success && data.drafts.length > 0) {
          const existingDraft = data.drafts.find((d: any) => d.saleId === state.selectedSaleId);
          if (existingDraft) {
            // Resume from draft
            setDraftId(existingDraft.id);
            setPicks(existingDraft.picks || []);
            setManualEntries(new Map(existingDraft.manualEntries?.map((e: any) => [e.url, e]) || []));
            setFailedUrls(existingDraft.failedUrls || []);
            setCustomPercentOff(existingDraft.customPercentOff || '');
            setSaleName(existingDraft.saleName || '');
            setSalePercentOff(existingDraft.salePercentOff || 0);
            // Convert keys to numbers when rehydrating individualCustomPercent
            setIndividualCustomPercent(new Map(
              Object.entries(existingDraft.individualCustomPercent || {}).map(([k, v]) => [Number(k), v as string])
            ));
            toast.success('Resumed from saved draft');
          }
        }
      } catch (error) {
        // Silently fail - draft load is optional
      }
    };
    loadDraft();
  }, [state, navigate]);

  // Progressive scraping useEffect
  useEffect(() => {
    // Progressive scraping logic
    if (state?.startScraping && state?.urlsToScrape && state.urlsToScrape.length > 0) {
      scrapeProgressively(state.urlsToScrape);
    }
  }, [state?.startScraping, state?.urlsToScrape]);

  // Helper function to extract domain from URL
  const extractDomain = (url: string): string => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  // Progressive scraping function
  const scrapeProgressively = async (urls: string[]) => {
    const auth = sessionStorage.getItem('adminAuth');
    const failedDomains = new Set<string>();
    const toastedBlockedDomains = new Set<string>(); // Track domains we've already toasted about
    let successCount = 0;
    let failureCount = 0;
    
    setScrapingProgress({
      current: 0,
      total: urls.length,
      isScrapingNow: true
    });
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      
      // Extract domain to check if it's already blocked
      const domain = extractDomain(url);
      
      // Update progress first
      setScrapingProgress({
        current: i + 1,
        total: urls.length,
        isScrapingNow: true
      });
      
      // Skip if domain is blocked
      if (failedDomains.has(domain)) {
        setFailedUrls(prev => [...prev, url]);
        failureCount++;
        // Only toast once per domain to avoid spam
        if (!toastedBlockedDomains.has(domain)) {
          toast.error(`Skipping ${domain} URLs - domain is blocked`);
          toastedBlockedDomains.add(domain);
        }
        continue;
      }
      
      try {
        const response = await fetch(`${API_BASE}/admin/scrape-product`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'auth': auth || ''
          },
          body: JSON.stringify({ url }) // Single URL
        });
        
        const data = await response.json();
        
        if (data.success && data.successes && data.successes.length > 0) {
          const scrapedProduct = {
            ...data.successes[0].product,
            confidence: data.successes[0].confidence,
            extractionMethod: data.successes[0].extractionMethod
          };
          
          // Add to picks immediately - UI updates progressively!
          setPicks(prev => [...prev, scrapedProduct]);
          successCount++;
          
          toast.success(`✓ Scraped ${i + 1}/${urls.length}: ${scrapedProduct.name.substring(0, 40)}...`);
          
        } else if (data.failures && data.failures.length > 0) {
          const failure = data.failures[0];
          
          // Check if it's a blocking error - if so, skip remaining URLs from this domain
          if (failure.errorType === 'BLOCKING') {
            failedDomains.add(domain);
            toast.error(`Domain ${domain} is blocking us - skipping remaining URLs from this store`);
          }
          
          setFailedUrls(prev => [...prev, url]);
          failureCount++;
          toast.error(`✗ Failed ${i + 1}/${urls.length}: ${failure.error}`);
        } else {
          // Unknown error
          setFailedUrls(prev => [...prev, url]);
          failureCount++;
          toast.error(`✗ Failed ${i + 1}/${urls.length}`);
        }
        
      } catch (error) {
        console.error('Scraping error:', error);
        setFailedUrls(prev => [...prev, url]);
        failureCount++;
        toast.error(`✗ Error ${i + 1}/${urls.length}: Network error`);
      }
    }
    
    // Done scraping
    setScrapingProgress({
      current: urls.length,
      total: urls.length,
      isScrapingNow: false
    });
    
    // Show completion notification (stays visible longer)
    if (successCount > 0) {
      toast.success(`🎉 Scraping complete! ${successCount} successful, ${failureCount} failed`, {
        duration: 6000, // Show for 6 seconds
      });
    } else {
      toast.error(`All ${failureCount} products failed to scrape`, {
        duration: 6000,
      });
    }
  };

  const handleDelete = (index: number) => {
    setPicks(picks.filter((_, i) => i !== index));
    setDeleteConfirmIndex(null);
  };

  const handleBrandChange = (index: number, newBrand: string) => {
    const updatedPicks = [...picks];
    updatedPicks[index] = { ...updatedPicks[index], brand: newBrand || undefined };
    setPicks(updatedPicks);
  };

  const handleImageUrlChange = (index: number, newImageUrl: string) => {
    const updatedPicks = [...picks];
    updatedPicks[index] = { ...updatedPicks[index], imageUrl: newImageUrl };
    setPicks(updatedPicks);
  };

  const handlePriceChange = (index: number, field: 'salePrice' | 'originalPrice', value: string) => {
    const updatedPicks = [...picks];
    // Properly handle empty string vs 0 vs valid number
    const numValue = value === '' ? null : parseFloat(value);
    const finalValue = isNaN(numValue as number) ? null : numValue;
    updatedPicks[index] = { ...updatedPicks[index], [field]: finalValue };
    
    // Only recalculate percent off if BOTH prices are present and valid
    // Preserve existing percentOff if prices are incomplete
    const sale = updatedPicks[index].salePrice;
    const original = updatedPicks[index].originalPrice;
    if (sale !== null && original !== null && original > 0) {
      const percentOff = Math.round(((original - sale) / original) * 100);
      updatedPicks[index].percentOff = percentOff;
    }
    // Don't reset percentOff when prices are incomplete - preserve it
    
    setPicks(updatedPicks);
  };

  const handleManualDataChange = (url: string, data: ManualProductData) => {
    setManualEntries(new Map(manualEntries.set(url, data)));
  };

  const handleRemoveManualEntry = (url: string) => {
    const newEntries = new Map(manualEntries);
    newEntries.delete(url);
    setManualEntries(newEntries);
    setFailedUrls(failedUrls.filter(u => u !== url));
  };

  // Pricing override functions
  const swapPrices = (pick: Product): Product => {
    // Case 1: No original price - move sale to original, set sale to null
    // Admin must then manually enter the correct sale price
    // Prevent toggling back if sale is already null
    if ((pick.originalPrice === null || pick.originalPrice === undefined) && pick.salePrice !== null) {
      return {
        ...pick,
        originalPrice: pick.salePrice,
        salePrice: null,
        // Preserve existing percentOff, don't fabricate a value
        percentOff: pick.percentOff
      };
    }
    
    // If both are null or sale is null, do nothing (prevents oscillation)
    if (pick.salePrice === null || pick.salePrice === undefined) {
      return pick;
    }
    
    // Case 2: Both prices exist - swap them directly
    const newSalePrice = pick.originalPrice;
    const newOriginalPrice = pick.salePrice;
    
    // Calculate percent off using the swapped values if both are valid
    let newPercentOff: number | null = null;
    if (newOriginalPrice !== null && newSalePrice !== null && newOriginalPrice > 0) {
      newPercentOff = Math.round(((newOriginalPrice - newSalePrice) / newOriginalPrice) * 100);
    }
    
    return {
      ...pick,
      salePrice: newSalePrice,
      originalPrice: newOriginalPrice,
      percentOff: newPercentOff
    };
  };

  const applyPercentOff = (pick: Product, percentOff: number): Product => {
    // If no original price, cannot apply percent off - need MSRP first
    if (pick.originalPrice === null || pick.originalPrice === undefined) {
      toast.error(`Cannot apply percent off to "${pick.name}" - missing original price. Please enter original price first.`);
      return pick;
    }
    
    const original = pick.originalPrice;
    const sale = original * (1 - percentOff / 100);
    return {
      ...pick,
      salePrice: Math.round(sale * 100) / 100,
      percentOff: percentOff
    };
  };

  // Bulk pricing operations
  const handleBulkSwapPrices = () => {
    setPicks(picks.map(pick => swapPrices(pick)));
  };

  const handleBulkApplySalePercentOff = () => {
    if (!salePercentOff) {
      toast.error('No sale percent off available');
      return;
    }
    setPicks(picks.map(pick => applyPercentOff(pick, salePercentOff)));
  };

  const handleBulkApplyCustomPercentOff = () => {
    const percentOff = parseFloat(customPercentOff);
    if (isNaN(percentOff) || percentOff < 0 || percentOff > 100) {
      toast.error('Please enter a valid percent off between 0 and 100');
      return;
    }
    setPicks(picks.map(pick => applyPercentOff(pick, percentOff)));
  };

  // Individual pricing operations
  const handleIndividualSwapPrices = (index: number) => {
    const updatedPicks = [...picks];
    const beforeSwap = updatedPicks[index];
    updatedPicks[index] = swapPrices(updatedPicks[index]);
    setPicks(updatedPicks);
    
    // If swap resulted in null salePrice, auto-focus the sale price input
    if (updatedPicks[index].salePrice === null && beforeSwap.salePrice !== null) {
      setTimeout(() => {
        const input = document.getElementById(`sale-price-${index}`) as HTMLInputElement;
        if (input) {
          input.focus();
        }
      }, 50);
    }
  };

  const handleIndividualApplySalePercentOff = (index: number) => {
    if (!salePercentOff) {
      toast.error('No sale percent off available');
      return;
    }
    const updatedPicks = [...picks];
    updatedPicks[index] = applyPercentOff(updatedPicks[index], salePercentOff);
    setPicks(updatedPicks);
  };

  const handleIndividualApplyCustomPercentOff = (index: number) => {
    const percentOffStr = individualCustomPercent.get(index) || '';
    const percentOff = parseFloat(percentOffStr);
    if (isNaN(percentOff) || percentOff < 0 || percentOff > 100) {
      toast.error('Please enter a valid percent off between 0 and 100');
      return;
    }
    const updatedPicks = [...picks];
    updatedPicks[index] = applyPercentOff(updatedPicks[index], percentOff);
    setPicks(updatedPicks);
    // Clear the input after applying
    const newMap = new Map(individualCustomPercent);
    newMap.delete(index);
    setIndividualCustomPercent(newMap);
  };

  const handleCalculateOriginal = () => {
    const sale = parseFloat(calcSalePrice);
    const percent = parseFloat(calcPercentOff);
    
    if (isNaN(sale) || isNaN(percent) || percent >= 100 || percent <= 0) {
      setCalcOriginalPrice(null);
      return;
    }
    
    // Formula: original = sale / (1 - percentOff/100)
    const original = sale / (1 - percent / 100);
    setCalcOriginalPrice(Math.round(original * 100) / 100); // Round to 2 decimal places
  };

  const handleUpdateSale = async () => {
    const percentOff = parseFloat(editedPercentOff);
    if (isNaN(percentOff) || percentOff < 0 || percentOff > 100) {
      toast.error('Please enter a valid percent off between 0 and 100');
      return;
    }

    const auth = sessionStorage.getItem('adminAuth');

    try {
      const response = await fetch(`${API_BASE}/admin/sales/${selectedSaleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth || ''
        },
        body: JSON.stringify({
          percentOff: percentOff
        })
      });

      const data = await response.json();

      if (data.success) {
        setSalePercentOff(percentOff);
        setIsEditingSale(false);
        setEditedPercentOff('');
      } else {
        toast.error(`Failed to update sale: ${data.message}`);
      }
    } catch (error) {
      console.error('Update error:', error);
      toast.error('An error occurred while updating the sale');
    }
  };

  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    const auth = sessionStorage.getItem('adminAuth');
    
    try {
      const response = await fetch(`${API_BASE}/admin/finalize-drafts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth || ''
        },
        body: JSON.stringify({
          id: draftId, // Include existing draft ID to update instead of create
          saleId: selectedSaleId,
          saleName: saleName || 'Sale',
          salePercentOff,
          picks,
          manualEntries: Array.from(manualEntries.values()),
          failedUrls,
          customPercentOff,
          individualCustomPercent: Object.fromEntries(individualCustomPercent)
        })
      });

      const data = await response.json();
      if (data.success) {
        setDraftId(data.draft.id); // Save the draft ID for future updates
        toast.success('Draft saved successfully!');
      } else {
        toast.error('Failed to save draft');
      }
    } catch (error) {
      toast.error('An error occurred while saving draft');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleLaunch = async () => {
    const manualPicks = Array.from(manualEntries.values()).map(data => ({
      url: data.url,
      name: data.name,
      brand: data.brand,
      imageUrl: data.imageUrl,
      originalPrice: data.originalPrice,
      salePrice: data.salePrice,
      percentOff: data.percentOff,
      confidence: 100,
      entryType: 'manual'
    }));

    const autoPicks = picks.map(pick => ({
      ...pick,
      entryType: 'automatic'
    }));

    const allPicks = [...manualPicks, ...autoPicks];

    if (allPicks.length === 0) {
      toast.error('No picks to save');
      return;
    }

    setIsSaving(true);
    const auth = sessionStorage.getItem('adminAuth');

    try {
      const response = await fetch(`${API_BASE}/admin/picks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth || ''
        },
        body: JSON.stringify({
          saleId: selectedSaleId,
          picks: allPicks
        })
      });

      const data = await response.json();

      if (data.success) {
        // Delete the draft after successful publish
        if (draftId) {
          try {
            await fetch(`${API_BASE}/admin/finalize-drafts/${draftId}`, {
              method: 'DELETE',
              headers: { 'auth': auth || '' }
            });
          } catch (error) {
            // Silently fail - draft deletion is not critical
          }
        }
        toast.success(`Successfully saved ${allPicks.length} picks!`);
        navigate('/admin/picks');
      } else {
        toast.error(`Failed to save picks: ${data.message}`);
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('An error occurred while saving picks');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 34px' }}>
      {/* Page Title */}
      <div style={{ marginBottom: '40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <h1 
              style={{ 
                fontFamily: 'DM Sans, sans-serif', 
                fontSize: '34px',
                fontWeight: 700,
                color: '#000'
              }}
            >
              Finalize Picks
            </h1>
            <button
              onClick={() => setShowCalculator(true)}
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
                fontWeight: 400,
                padding: '8px 16px',
                backgroundColor: '#fff',
                border: '1px solid #ddd',
                borderRadius: '4px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'border-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = '#000'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = '#ddd'}
            >
              <Calculator style={{ width: '16px', height: '16px' }} />
              Price Calculator
            </button>
          </div>
          <p 
            style={{ 
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '14px',
              fontWeight: 400,
              color: '#666',
              marginBottom: '4px'
            }}
          >
            Review and edit your curated picks before launching.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '12px' }}>
            <p 
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
                fontStyle: 'italic',
                color: '#999'
              }}
            >
              {picks.length} auto-scraped, {failedUrls.length} manual {failedUrls.length === 1 ? 'entry' : 'entries'}
            </p>
            {!isEditingSale ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', color: '#666' }}>
                  Sale: {salePercentOff}% Off
                </span>
                <button
                  onClick={() => {
                    setIsEditingSale(true);
                    setEditedPercentOff(salePercentOff.toString());
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '12px',
                    fontFamily: 'DM Sans, sans-serif',
                    fontWeight: 400,
                    backgroundColor: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#000'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#ddd'}
                >
                  <Edit2 style={{ width: '12px', height: '12px' }} />
                  Edit
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={editedPercentOff}
                  onChange={(e) => setEditedPercentOff(e.target.value)}
                  placeholder="% Off"
                  style={{
                    width: '80px',
                    height: '32px',
                    fontSize: '13px',
                    fontFamily: 'DM Sans, sans-serif'
                  }}
                />
                <button
                  onClick={handleUpdateSale}
                  style={{
                    padding: '4px 12px',
                    height: '32px',
                    fontSize: '12px',
                    fontFamily: 'DM Sans, sans-serif',
                    fontWeight: 400,
                    backgroundColor: '#000',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setIsEditingSale(false);
                    setEditedPercentOff('');
                  }}
                  style={{
                    padding: '4px 12px',
                    height: '32px',
                    fontSize: '12px',
                    fontFamily: 'DM Sans, sans-serif',
                    fontWeight: 400,
                    backgroundColor: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Progressive Scraping Progress Indicator */}
        {scrapingProgress.isScrapingNow && (
          <div 
            style={{ 
              padding: '16px',
              backgroundColor: '#f0f9ff',
              border: '1px solid #0284c7',
              borderRadius: '4px',
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}
          >
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#0284c7' }} />
            <div style={{ flex: 1 }}>
              <p style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                Scraping products... {scrapingProgress.current} of {scrapingProgress.total}
              </p>
              <div style={{ 
                width: '100%', 
                height: '6px', 
                backgroundColor: '#e0f2fe', 
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div 
                  style={{ 
                    width: `${(scrapingProgress.current / scrapingProgress.total) * 100}%`,
                    height: '100%',
                    backgroundColor: '#0284c7',
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Manual Entry Forms (for failed scrapes) */}
        {failedUrls.length > 0 && (
          <div style={{ marginBottom: '60px' }}>
            <h2 
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '20px',
                fontWeight: 700,
                marginBottom: '16px',
                color: '#000'
              }}
            >
              Manual Entries ({failedUrls.length})
            </h2>
            <p 
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
                color: '#666',
                marginBottom: '24px'
              }}
            >
              These URLs couldn't be scraped automatically. Fill in the product details manually:
            </p>
            {failedUrls.map(url => (
              <ManualEntryForm
                key={url}
                url={url}
                initialData={manualEntries.get(url)}
                onDataChange={(data) => handleManualDataChange(url, data)}
                onRemove={() => handleRemoveManualEntry(url)}
              />
            ))}
          </div>
        )}

        {/* Bulk Pricing Override Controls */}
        {picks.length > 0 && (
          <div style={{ marginBottom: '40px', padding: '24px', border: '1px solid #e5e5e5', backgroundColor: '#fafafa', borderRadius: '4px' }}>
            <h3 
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '16px',
                fontWeight: 700,
                marginBottom: '16px',
                color: '#000'
              }}
            >
              Bulk Pricing Overrides
            </h3>
            <p 
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '13px',
                color: '#666',
                marginBottom: '16px'
              }}
            >
              Apply pricing changes to all products at once:
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <button
                onClick={handleBulkSwapPrices}
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '13px',
                  padding: '8px 16px',
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = '#000'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = '#ddd'}
              >
                Swap Sale ↔ Original
              </button>
              {salePercentOff > 0 && (
                <button
                  onClick={handleBulkApplySalePercentOff}
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: '13px',
                    padding: '8px 16px',
                    backgroundColor: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#000'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#ddd'}
                >
                  Apply {salePercentOff}% Off
                </button>
              )}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={customPercentOff}
                  onChange={(e) => setCustomPercentOff(e.target.value)}
                  placeholder="% off"
                  style={{
                    width: '80px',
                    height: '32px',
                    fontSize: '13px',
                    fontFamily: 'DM Sans, sans-serif'
                  }}
                />
                <button
                  onClick={handleBulkApplyCustomPercentOff}
                  style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: '13px',
                    padding: '8px 16px',
                    backgroundColor: '#fff',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    transition: 'border-color 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = '#000'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = '#ddd'}
                >
                  Apply Custom %
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Auto-Scraped Products */}
        {picks.length > 0 && (
          <div style={{ marginBottom: '40px' }}>
            <h2 
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '20px',
                fontWeight: 700,
                marginBottom: '24px',
                color: '#000'
              }}
            >
              Auto-Scraped Products ({picks.length})
            </h2>
          </div>
        )}

        {picks.length === 0 && failedUrls.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground mb-4" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '16px' }}>
              We're still scraping away. Feel free to leave the page and come back later.
            </p>
            <button
              onClick={() => navigate('/admin/picks')}
              className="border border-border bg-white px-8 py-3 hover:border-foreground transition-colors"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              Back to Picks Admin
            </button>
          </div>
        ) : (
          <>
            {/* Product Grid */}
            <div 
              style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '24px',
                marginBottom: '80px'
              }}
            >
              {picks.map((pick, index) => (
                <div 
                  key={index}
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    border: '1px solid #e5e5e5',
                    padding: '16px',
                    position: 'relative',
                    backgroundColor: '#fff'
                  }}
                >
                  {/* Action buttons - External Link and Delete */}
                  <div style={{
                    position: 'absolute',
                    top: '24px',
                    right: '24px',
                    zIndex: 10,
                    display: 'flex',
                    gap: '8px'
                  }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(pick.url, '_blank');
                      }}
                      style={{
                        padding: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        border: '1px solid #e5e5e5',
                        cursor: 'pointer',
                        borderRadius: '4px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f0f9ff';
                        e.currentTarget.style.borderColor = '#0284c7';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                        e.currentTarget.style.borderColor = '#e5e5e5';
                      }}
                      aria-label="Open product page"
                      title="View product"
                    >
                      <ExternalLink style={{ width: '16px', height: '16px', color: '#666' }} />
                    </button>
                    <button
                      onClick={() => setDeleteConfirmIndex(index)}
                      style={{
                        padding: '8px',
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        border: '1px solid #e5e5e5',
                        cursor: 'pointer',
                        borderRadius: '4px'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#fee';
                        e.currentTarget.style.borderColor = '#f55';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                        e.currentTarget.style.borderColor = '#e5e5e5';
                      }}
                      aria-label="Delete pick"
                      title="Delete pick"
                    >
                      <Trash2 style={{ width: '16px', height: '16px', color: '#666' }} />
                    </button>
                  </div>

                  {/* Product Image */}
                  <div 
                    style={{ 
                      width: '100%',
                      aspectRatio: '3/4',
                      overflow: 'hidden',
                      backgroundColor: '#f5f5f5',
                      marginBottom: '16px'
                    }}
                  >
                    <img 
                      src={pick.imageUrl} 
                      alt={pick.name}
                      style={{ 
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                    />
                  </div>

                  {/* Product Info */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ marginBottom: '12px' }}>
                      <Label 
                        htmlFor={`brand-${index}`}
                        style={{ 
                          fontFamily: 'DM Sans, sans-serif', 
                          fontWeight: 600, 
                          fontSize: '11px',
                          color: '#666',
                          marginBottom: '4px',
                          display: 'block'
                        }}
                      >
                        Brand (Optional)
                      </Label>
                      <Input
                        id={`brand-${index}`}
                        value={pick.brand || ''}
                        onChange={(e) => handleBrandChange(index, e.target.value)}
                        placeholder="e.g., Proenza Schouler"
                        className="h-8 text-xs"
                        style={{ 
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '12px'
                        }}
                      />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <Label 
                        htmlFor={`image-url-${index}`}
                        style={{ 
                          fontFamily: 'DM Sans, sans-serif', 
                          fontWeight: 600, 
                          fontSize: '11px',
                          color: '#666',
                          marginBottom: '4px',
                          display: 'block'
                        }}
                      >
                        Image URL (Override if Wrong)
                      </Label>
                      <Input
                        id={`image-url-${index}`}
                        value={pick.imageUrl || ''}
                        onChange={(e) => handleImageUrlChange(index, e.target.value)}
                        placeholder="https://example.com/image.jpg"
                        className="h-8 text-xs"
                        style={{ 
                          fontFamily: 'DM Sans, sans-serif',
                          fontSize: '11px'
                        }}
                      />
                    </div>
                    <h3 
                      style={{ 
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        fontWeight: 700,
                        lineHeight: '1.4',
                        marginBottom: '12px',
                        color: '#000'
                      }}
                    >
                      {pick.name}
                    </h3>

                    {/* Pricing - Editable */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                        <div>
                          <Label 
                            htmlFor={`sale-price-${index}`}
                            style={{ 
                              fontFamily: 'DM Sans, sans-serif', 
                              fontWeight: 600, 
                              fontSize: '10px',
                              color: '#666',
                              marginBottom: '4px',
                              display: 'block'
                            }}
                          >
                            Sale Price
                          </Label>
                          <Input
                            id={`sale-price-${index}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={pick.salePrice ?? ''}
                            onChange={(e) => handlePriceChange(index, 'salePrice', e.target.value)}
                            style={{
                              height: '32px',
                              fontSize: '13px',
                              fontFamily: 'DM Sans, sans-serif',
                              fontWeight: 600
                            }}
                          />
                        </div>
                        <div>
                          <Label 
                            htmlFor={`original-price-${index}`}
                            style={{ 
                              fontFamily: 'DM Sans, sans-serif', 
                              fontWeight: 600, 
                              fontSize: '10px',
                              color: '#666',
                              marginBottom: '4px',
                              display: 'block'
                            }}
                          >
                            Original Price
                          </Label>
                          <Input
                            id={`original-price-${index}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={pick.originalPrice ?? ''}
                            onChange={(e) => handlePriceChange(index, 'originalPrice', e.target.value)}
                            style={{
                              height: '32px',
                              fontSize: '13px',
                              fontFamily: 'DM Sans, sans-serif'
                            }}
                          />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {pick.percentOff !== null && pick.percentOff !== undefined && pick.percentOff > 0 && 
                         pick.salePrice !== null && pick.salePrice !== undefined &&
                         pick.originalPrice !== null && pick.originalPrice !== undefined && (
                          <div 
                            style={{ 
                              fontFamily: 'DM Sans, sans-serif',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: '#16a34a'
                            }}
                          >
                            {pick.percentOff}% OFF
                          </div>
                        )}
                        {pick.confidence !== undefined && (
                          <div 
                            style={{ 
                              fontFamily: 'DM Sans, sans-serif',
                              fontSize: '10px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '3px',
                              backgroundColor: pick.confidence >= 80 ? '#dcfce7' : pick.confidence >= 60 ? '#fef3c7' : '#fee2e2',
                              color: pick.confidence >= 80 ? '#166534' : pick.confidence >= 60 ? '#92400e' : '#991b1b'
                            }}
                          >
                            {pick.confidence}% confidence
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Individual Pricing Override Buttons */}
                    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #f0f0f0' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <button
                          onClick={() => handleIndividualSwapPrices(index)}
                          disabled={pick.salePrice === null || pick.salePrice === undefined}
                          style={{
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '11px',
                            padding: '6px 10px',
                            backgroundColor: (pick.salePrice === null || pick.salePrice === undefined) ? '#f5f5f5' : '#fff',
                            border: '1px solid #e0e0e0',
                            borderRadius: '3px',
                            cursor: (pick.salePrice === null || pick.salePrice === undefined) ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            textAlign: 'left',
                            opacity: (pick.salePrice === null || pick.salePrice === undefined) ? 0.5 : 1
                          }}
                          onMouseEnter={(e) => {
                            if (pick.salePrice !== null && pick.salePrice !== undefined) {
                              e.currentTarget.style.backgroundColor = '#f5f5f5';
                              e.currentTarget.style.borderColor = '#999';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (pick.salePrice !== null && pick.salePrice !== undefined) {
                              e.currentTarget.style.backgroundColor = '#fff';
                              e.currentTarget.style.borderColor = '#e0e0e0';
                            }
                          }}
                        >
                          Swap Prices
                        </button>
                        {salePercentOff > 0 && (
                          <button
                            onClick={() => handleIndividualApplySalePercentOff(index)}
                            style={{
                              fontFamily: 'DM Sans, sans-serif',
                              fontSize: '11px',
                              padding: '6px 10px',
                              backgroundColor: '#fff',
                              border: '1px solid #e0e0e0',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              textAlign: 'left'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f5f5f5';
                              e.currentTarget.style.borderColor = '#999';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#fff';
                              e.currentTarget.style.borderColor = '#e0e0e0';
                            }}
                          >
                            Apply {salePercentOff}% Off
                          </button>
                        )}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            placeholder="%"
                            value={individualCustomPercent.get(index) ?? ''}
                            onChange={(e) => {
                              const newMap = new Map(individualCustomPercent);
                              newMap.set(index, e.target.value);
                              setIndividualCustomPercent(newMap);
                            }}
                            style={{
                              flex: 1,
                              height: '28px',
                              fontSize: '11px',
                              fontFamily: 'DM Sans, sans-serif'
                            }}
                          />
                          <button
                            onClick={() => handleIndividualApplyCustomPercentOff(index)}
                            style={{
                              fontFamily: 'DM Sans, sans-serif',
                              fontSize: '11px',
                              padding: '6px 10px',
                              backgroundColor: '#fff',
                              border: '1px solid #e0e0e0',
                              borderRadius: '3px',
                              cursor: 'pointer',
                              transition: 'all 0.2s',
                              whiteSpace: 'nowrap'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#f5f5f5';
                              e.currentTarget.style.borderColor = '#999';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = '#fff';
                              e.currentTarget.style.borderColor = '#e0e0e0';
                            }}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button
                onClick={() => navigate('/admin/picks')}
                disabled={isSaving || isSavingDraft}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  padding: '12px 48px',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  cursor: (isSaving || isSavingDraft) ? 'not-allowed' : 'pointer',
                  opacity: (isSaving || isSavingDraft) ? 0.5 : 1,
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => !(isSaving || isSavingDraft) && (e.currentTarget.style.borderColor = '#000')}
                onMouseLeave={(e) => !(isSaving || isSavingDraft) && (e.currentTarget.style.borderColor = '#ddd')}
              >
                Back
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={isSaving || isSavingDraft}
                style={{
                  backgroundColor: '#fff',
                  color: '#000',
                  border: '1px solid #ddd',
                  padding: '12px 48px',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  cursor: (isSaving || isSavingDraft) ? 'not-allowed' : 'pointer',
                  opacity: (isSaving || isSavingDraft) ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => !(isSaving || isSavingDraft) && (e.currentTarget.style.borderColor = '#000')}
                onMouseLeave={(e) => !(isSaving || isSavingDraft) && (e.currentTarget.style.borderColor = '#ddd')}
              >
                {isSavingDraft ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving Draft...
                  </>
                ) : (
                  'Save Draft'
                )}
              </button>
              <button
                onClick={handleLaunch}
                disabled={isSaving || isSavingDraft}
                style={{
                  backgroundColor: '#000',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 48px',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  cursor: (isSaving || isSavingDraft) ? 'not-allowed' : 'pointer',
                  opacity: (isSaving || isSavingDraft) ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => !(isSaving || isSavingDraft) && (e.currentTarget.style.backgroundColor = '#333')}
                onMouseLeave={(e) => !(isSaving || isSavingDraft) && (e.currentTarget.style.backgroundColor = '#000')}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Publishing...
                  </>
                ) : (
                  'Publish'
                )}
              </button>
            </div>
          </>
        )}

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteConfirmIndex !== null} onOpenChange={() => setDeleteConfirmIndex(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Pick?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this pick? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteConfirmIndex !== null && handleDelete(deleteConfirmIndex)}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Price Calculator Dialog */}
        <Dialog 
          open={showCalculator} 
          onOpenChange={(open) => {
            setShowCalculator(open);
            if (!open) {
              // Reset calculator state when closing
              setCalcSalePrice('');
              setCalcPercentOff('');
              setCalcOriginalPrice(null);
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Price Calculator</DialogTitle>
              <DialogDescription>
                Calculate original price when you only know the sale price and discount percentage.
              </DialogDescription>
            </DialogHeader>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Label 
                  htmlFor="calc-sale-price"
                  style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', fontWeight: 600 }}
                >
                  Sale Price
                </Label>
                <Input
                  id="calc-sale-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={calcSalePrice}
                  onChange={(e) => setCalcSalePrice(e.target.value)}
                  placeholder="80.00"
                  style={{
                    height: '40px',
                    fontSize: '14px',
                    fontFamily: 'DM Sans, sans-serif'
                  }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Label 
                  htmlFor="calc-percent-off"
                  style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', fontWeight: 600 }}
                >
                  Percent Off
                </Label>
                <Input
                  id="calc-percent-off"
                  type="number"
                  min="1"
                  max="99"
                  step="1"
                  value={calcPercentOff}
                  onChange={(e) => setCalcPercentOff(e.target.value)}
                  placeholder="20"
                  style={{
                    height: '40px',
                    fontSize: '14px',
                    fontFamily: 'DM Sans, sans-serif'
                  }}
                />
              </div>
              <button
                onClick={handleCalculateOriginal}
                disabled={!calcSalePrice || !calcPercentOff || parseFloat(calcPercentOff) <= 0 || parseFloat(calcPercentOff) >= 100}
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  fontWeight: 400,
                  height: '40px',
                  padding: '0 16px',
                  backgroundColor: (!calcSalePrice || !calcPercentOff || parseFloat(calcPercentOff) <= 0 || parseFloat(calcPercentOff) >= 100) ? '#ccc' : '#000',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: (!calcSalePrice || !calcPercentOff || parseFloat(calcPercentOff) <= 0 || parseFloat(calcPercentOff) >= 100) ? 'not-allowed' : 'pointer',
                  transition: 'opacity 0.2s',
                  opacity: (!calcSalePrice || !calcPercentOff || parseFloat(calcPercentOff) <= 0 || parseFloat(calcPercentOff) >= 100) ? 0.6 : 1
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.opacity = '0.8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.opacity = '1';
                  }
                }}
              >
                Calculate Original Price
              </button>
              {calcSalePrice && calcPercentOff && (parseFloat(calcPercentOff) <= 0 || parseFloat(calcPercentOff) >= 100) && (
                <p style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: '#dc2626', marginTop: '-8px' }}>
                  Percent off must be between 1 and 99
                </p>
              )}
              {calcOriginalPrice !== null && (
                <div 
                  style={{ 
                    padding: '16px',
                    backgroundColor: '#e8f5e9',
                    border: '1px solid #4caf50',
                    borderRadius: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    alignItems: 'center'
                  }}
                >
                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '14px', fontWeight: 600, color: '#2e7d32' }}>
                    Original Price
                  </span>
                  <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '28px', fontWeight: 700, color: '#1b5e20' }}>
                    ${calcOriginalPrice.toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
    </div>
  );
}
