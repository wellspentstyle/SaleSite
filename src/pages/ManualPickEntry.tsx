import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Loader2, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

interface Product {
  url: string;
  name: string;
  brand: string;
  imageUrl: string;
  originalPrice: number | null;
  salePrice: number | null;
  percentOff: number | null;
}

interface LocationState {
  selectedSaleId: string;
  saleName: string;
  salePercentOff: number;
  urls?: string[];
}

export function ManualPickEntry() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LocationState;

  const [picks, setPicks] = useState<Product[]>(() => {
    if (state?.urls && state.urls.length > 0) {
      return state.urls.map(url => ({
        url: url.trim(),
        name: '',
        brand: '',
        imageUrl: '',
        originalPrice: null,
        salePrice: null,
        percentOff: state.salePercentOff ?? null
      }));
    }
    return [
      {
        url: '',
        name: '',
        brand: '',
        imageUrl: '',
        originalPrice: null,
        salePrice: null,
        percentOff: state.salePercentOff ?? null
      }
    ];
  });
  const [isSaving, setIsSaving] = useState(false);

  if (!state?.selectedSaleId) {
    return <Navigate to="/admin/picks" replace />;
  }

  const handleAddPick = () => {
    setPicks([
      ...picks,
      {
        url: '',
        name: '',
        brand: '',
        imageUrl: '',
        originalPrice: null,
        salePrice: null,
        percentOff: null
      }
    ]);
  };

  const handleRemovePick = (index: number) => {
    if (picks.length === 1) {
      toast.error('You must have at least one pick');
      return;
    }
    setPicks(picks.filter((_, i) => i !== index));
  };

  const handleFieldChange = (
    index: number,
    field: keyof Product,
    value: string
  ) => {
    const updatedPicks = [...picks];
    
    if (field === 'originalPrice' || field === 'salePrice') {
      const numValue = value === '' ? null : parseFloat(value);
      updatedPicks[index] = {
        ...updatedPicks[index],
        [field]: isNaN(numValue as number) ? null : numValue
      };
      
      // Auto-calculate percentOff if both prices exist
      const original = field === 'originalPrice' ? numValue : updatedPicks[index].originalPrice;
      const sale = field === 'salePrice' ? numValue : updatedPicks[index].salePrice;
      
      if (original && sale && original > 0) {
        const percent = Math.round(((original - sale) / original) * 100);
        updatedPicks[index].percentOff = percent;
      }
    } else if (field === 'percentOff') {
      const numValue = value === '' ? null : parseFloat(value);
      updatedPicks[index] = {
        ...updatedPicks[index],
        [field]: isNaN(numValue as number) ? null : numValue
      };
    } else {
      updatedPicks[index] = {
        ...updatedPicks[index],
        [field]: value
      };
    }
    
    setPicks(updatedPicks);
  };

  const validatePick = (pick: Product): string | null => {
    if (!pick.url.trim()) return 'URL is required';
    if (!pick.name.trim()) return 'Product name is required';
    if (!pick.imageUrl.trim()) return 'Image URL is required';
    if (pick.percentOff === null || pick.percentOff < 0 || pick.percentOff > 100) {
      return 'Valid discount percentage (0-100) is required';
    }
    return null;
  };

  const handleSave = async () => {
    // Validate all picks
    for (let i = 0; i < picks.length; i++) {
      const error = validatePick(picks[i]);
      if (error) {
        toast.error(`Pick ${i + 1}: ${error}`);
        return;
      }
    }

    setIsSaving(true);
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

    try {
      const response = await fetch(`${API_BASE}/admin/manual-picks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify({
          saleId: state.selectedSaleId,
          picks: picks.map(p => ({
            ...p,
            entryType: 'manual'
          }))
        })
      });

      const data = await response.json();
      if (data.success) {
        toast.success(`Successfully added ${picks.length} pick(s)`);
        navigate('/admin/picks');
      } else {
        toast.error(data.message || 'Failed to save picks');
      }
    } catch (error) {
      toast.error('An error occurred while saving picks');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1200px', margin: '0 auto' }}>
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/picks')}
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
            fontSize: '24px',
            marginBottom: '4px'
          }}
        >
          Manual Entry: {state.saleName}
        </h2>
        <p className="text-sm text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          Manually enter product details for picks that couldn't be scraped.
        </p>
      </div>

      <div className="space-y-6">
        {picks.map((pick, index) => (
          <div
            key={index}
            className="border bg-white"
            style={{ padding: '24px', borderRadius: '8px' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                style={{
                  fontFamily: 'DM Sans, sans-serif',
                  fontWeight: 600,
                  fontSize: '16px'
                }}
              >
                Pick {index + 1}
              </h3>
              {picks.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemovePick(index)}
                  style={{ color: '#ef4444' }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`url-${index}`}>Product URL *</Label>
                <Input
                  id={`url-${index}`}
                  type="url"
                  value={pick.url}
                  onChange={(e) => handleFieldChange(index, 'url', e.target.value)}
                  placeholder="https://example.com/product"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`name-${index}`}>Product Name *</Label>
                <Input
                  id={`name-${index}`}
                  value={pick.name}
                  onChange={(e) => handleFieldChange(index, 'name', e.target.value)}
                  placeholder="e.g. Cashmere Sweater"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`brand-${index}`}>Brand</Label>
                <Input
                  id={`brand-${index}`}
                  value={pick.brand}
                  onChange={(e) => handleFieldChange(index, 'brand', e.target.value)}
                  placeholder="e.g. Everlane"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`imageUrl-${index}`}>Image URL *</Label>
                <Input
                  id={`imageUrl-${index}`}
                  type="url"
                  value={pick.imageUrl}
                  onChange={(e) => handleFieldChange(index, 'imageUrl', e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`originalPrice-${index}`}>Original Price</Label>
                <Input
                  id={`originalPrice-${index}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={pick.originalPrice?.toString() || ''}
                  onChange={(e) => handleFieldChange(index, 'originalPrice', e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`salePrice-${index}`}>Sale Price</Label>
                <Input
                  id={`salePrice-${index}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={pick.salePrice?.toString() || ''}
                  onChange={(e) => handleFieldChange(index, 'salePrice', e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`percentOff-${index}`}>
                  Discount % * {pick.percentOff !== null && `(${pick.percentOff}%)`}
                </Label>
                <Input
                  id={`percentOff-${index}`}
                  type="number"
                  min="0"
                  max="100"
                  value={pick.percentOff?.toString() || ''}
                  onChange={(e) => handleFieldChange(index, 'percentOff', e.target.value)}
                  placeholder={state.salePercentOff?.toString() || '0'}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-6">
        <Button
          variant="outline"
          onClick={handleAddPick}
          style={{ fontFamily: 'DM Sans, sans-serif' }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Another Pick
        </Button>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          style={{
            fontFamily: 'DM Sans, sans-serif',
            backgroundColor: '#000',
            color: '#fff',
            marginLeft: 'auto'
          }}
        >
          {isSaving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            `Save ${picks.length} Pick(s)`
          )}
        </Button>
      </div>
    </div>
  );
}
