import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Trash2, ExternalLink, Edit2 } from 'lucide-react';
import { ManualEntryForm, ManualProductData } from '../components/ManualEntryForm';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
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
  salePercentOff?: number;
  failures?: Failure[];
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
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [salePercentOff, setSalePercentOff] = useState<number>(0);
  const [customPercentOff, setCustomPercentOff] = useState<string>('');
  const [individualCustomPercent, setIndividualCustomPercent] = useState<Map<number, string>>(new Map());
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [isEditingSale, setIsEditingSale] = useState(false);
  const [editedPercentOff, setEditedPercentOff] = useState<string>('');

  useEffect(() => {
    if (!state?.scrapedProducts || !state?.selectedSaleId) {
      navigate('/admin/picks');
      return;
    }
    
    setPicks(state.scrapedProducts);
    setSelectedSaleId(state.selectedSaleId);
    setSalePercentOff(state.salePercentOff || 0);
    setFailedUrls((state.failures || []).map(f => f.url));
  }, [state, navigate]);

  const handleDelete = (index: number) => {
    setPicks(picks.filter((_, i) => i !== index));
    setDeleteConfirmIndex(null);
  };

  const handleBrandChange = (index: number, newBrand: string) => {
    const updatedPicks = [...picks];
    updatedPicks[index] = { ...updatedPicks[index], brand: newBrand || undefined };
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
      alert(`Cannot apply percent off to "${pick.name}" - missing original price. Please enter original price first.`);
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
      alert('No sale percent off available');
      return;
    }
    setPicks(picks.map(pick => applyPercentOff(pick, salePercentOff)));
  };

  const handleBulkApplyCustomPercentOff = () => {
    const percentOff = parseFloat(customPercentOff);
    if (isNaN(percentOff) || percentOff < 0 || percentOff > 100) {
      alert('Please enter a valid percent off between 0 and 100');
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
      alert('No sale percent off available');
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
      alert('Please enter a valid percent off between 0 and 100');
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

  const handleUpdateSale = async () => {
    const percentOff = parseFloat(editedPercentOff);
    if (isNaN(percentOff) || percentOff < 0 || percentOff > 100) {
      alert('Please enter a valid percent off between 0 and 100');
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
        alert(`Failed to update sale: ${data.message}`);
      }
    } catch (error) {
      console.error('Update error:', error);
      alert('An error occurred while updating the sale');
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
      alert('No picks to save');
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
        alert(`Successfully saved ${allPicks.length} picks!`);
        navigate('/admin/picks');
      } else {
        alert(`Failed to save picks: ${data.message}`);
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('An error occurred while saving picks');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 34px' }}>
      {/* Page Title */}
      <div style={{ marginBottom: '40px' }}>
          <h1 
            style={{ 
              fontFamily: 'DM Sans, sans-serif', 
              fontSize: '34px',
              fontWeight: 700,
              marginBottom: '8px',
              color: '#000'
            }}
          >
            Finalize Picks
          </h1>
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
            <p className="text-muted-foreground mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              No picks to display. Go back and scrape some products.
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
                disabled={isSaving}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  padding: '12px 48px',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.5 : 1,
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => !isSaving && (e.currentTarget.style.borderColor = '#000')}
                onMouseLeave={(e) => !isSaving && (e.currentTarget.style.borderColor = '#ddd')}
              >
                Back
              </button>
              <button
                onClick={handleLaunch}
                disabled={isSaving}
                style={{
                  backgroundColor: '#000',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 48px',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#333')}
                onMouseLeave={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#000')}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Launch'
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
    </div>
  );
}
