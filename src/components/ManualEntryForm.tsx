import { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { X, Calculator } from 'lucide-react';

interface ManualEntryFormProps {
  url: string;
  onDataChange: (data: ManualProductData) => void;
  onRemove: () => void;
  initialData?: ManualProductData;
  salePercentOff?: number;
}

export interface ManualProductData {
  url: string;
  name: string;
  brand?: string;
  imageUrl: string;
  originalPrice: number;
  salePrice: number;
  percentOff: number;
}

export function ManualEntryForm({ url, onDataChange, onRemove, initialData, salePercentOff }: ManualEntryFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [brand, setBrand] = useState(initialData?.brand || '');
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
  const [originalPrice, setOriginalPrice] = useState(initialData?.originalPrice?.toString() || '');
  const [salePrice, setSalePrice] = useState(initialData?.salePrice?.toString() || '');
  const [percentOff, setPercentOff] = useState(initialData?.percentOff || 0);
  const [showCustomPercentDialog, setShowCustomPercentDialog] = useState(false);
  const [customPercent, setCustomPercent] = useState('');

  // Hydrate state from initialData when it becomes available
  useEffect(() => {
    if (initialData) {
      setName(initialData.name || '');
      setBrand(initialData.brand || '');
      setImageUrl(initialData.imageUrl || '');
      setOriginalPrice(initialData.originalPrice?.toString() || '');
      setSalePrice(initialData.salePrice?.toString() || '');
      setPercentOff(initialData.percentOff || 0);
    }
  }, [initialData]);

  useEffect(() => {
    const orig = parseFloat(originalPrice) || 0;
    const sale = parseFloat(salePrice) || 0;
    
    if (orig > 0 && sale > 0) {
      const discount = Math.round(((orig - sale) / orig) * 100);
      setPercentOff(discount);
    } else {
      setPercentOff(0);
    }
  }, [originalPrice, salePrice]);

  const handleUseSalePercent = () => {
    if (!salePercentOff || !originalPrice) {
      return;
    }
    const orig = parseFloat(originalPrice);
    const calculatedSalePrice = orig * (1 - salePercentOff / 100);
    setSalePrice(calculatedSalePrice.toFixed(2));
  };

  const handleUseCustomPercent = () => {
    const custom = parseFloat(customPercent);
    if (!custom || custom < 0 || custom > 100 || !originalPrice) {
      return;
    }
    const orig = parseFloat(originalPrice);
    const calculatedSalePrice = orig * (1 - custom / 100);
    setSalePrice(calculatedSalePrice.toFixed(2));
    setShowCustomPercentDialog(false);
    setCustomPercent('');
  };

  // Debounced data change to prevent glitching while typing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      onDataChange({
        url,
        name,
        brand: brand || undefined,
        imageUrl,
        originalPrice: parseFloat(originalPrice) || 0,
        salePrice: parseFloat(salePrice) || 0,
        percentOff
      });
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timeoutId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, name, brand, imageUrl, originalPrice, salePrice, percentOff]);

  return (
    <div className="border border-border bg-white p-6 mb-4 relative">
      <button
        onClick={onRemove}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
        title="Remove this entry"
      >
        <X className="h-5 w-5" />
      </button>
      
      <div className="space-y-4">
        <div className="mb-4 pb-4 border-b border-border">
          <p 
            className="text-xs font-mono text-muted-foreground truncate pr-8" 
            title={url}
          >
            {url}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label 
              htmlFor={`name-${url}`}
              style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '14px' }}
            >
              Product Name
            </Label>
            <Input
              id={`name-${url}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Wool Blend Coat"
              className="h-10"
              required
            />
          </div>

          <div className="space-y-2">
            <Label 
              htmlFor={`brand-${url}`}
              style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '14px' }}
            >
              Brand (Optional)
            </Label>
            <Input
              id={`brand-${url}`}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="e.g., Proenza Schouler"
              className="h-10"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label 
              htmlFor={`image-${url}`}
              style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '14px' }}
            >
              Image URL
            </Label>
            <Input
              id={`image-${url}`}
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="h-10 font-mono text-sm"
              required
            />
          </div>

          <div className="space-y-2">
            <Label 
              htmlFor={`original-${url}`}
              style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '14px' }}
            >
              Original Price ($)
            </Label>
            <Input
              id={`original-${url}`}
              type="number"
              step="0.01"
              min="0"
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              placeholder="0.00"
              className="h-10"
              required
            />
          </div>

          <div className="space-y-2">
            <Label 
              htmlFor={`sale-${url}`}
              style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '14px' }}
            >
              Sale Price ($)
            </Label>
            <div className="flex gap-2">
              <Input
                id={`sale-${url}`}
                type="number"
                step="0.01"
                min="0"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="0.00"
                className="h-10 flex-1"
                required
              />
              {salePercentOff && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleUseSalePercent}
                  disabled={!originalPrice}
                  title={`Apply ${salePercentOff}% off`}
                  style={{ fontFamily: 'system-ui, sans-serif', whiteSpace: 'nowrap' }}
                >
                  <Calculator className="h-3 w-3 mr-1" />
                  {salePercentOff}% off
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowCustomPercentDialog(true)}
                disabled={!originalPrice}
                title="Apply custom % off"
                style={{ fontFamily: 'system-ui, sans-serif', whiteSpace: 'nowrap' }}
              >
                <Calculator className="h-3 w-3 mr-1" />
                Custom %
              </Button>
            </div>
            {showCustomPercentDialog && (
              <div className="mt-2 p-3 border rounded bg-muted/20">
                <Label 
                  htmlFor={`custom-percent-${url}`}
                  style={{ fontFamily: 'system-ui, sans-serif', fontSize: '12px' }}
                >
                  Enter discount percentage:
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    id={`custom-percent-${url}`}
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={customPercent}
                    onChange={(e) => setCustomPercent(e.target.value)}
                    placeholder="e.g., 25"
                    className="h-8 flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleUseCustomPercent}
                    disabled={!customPercent}
                    style={{ fontFamily: 'system-ui, sans-serif' }}
                  >
                    Apply
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowCustomPercentDialog(false);
                      setCustomPercent('');
                    }}
                    style={{ fontFamily: 'system-ui, sans-serif' }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {percentOff > 0 && (
            <div className="md:col-span-2">
              <div className="bg-green-50 border border-green-200 rounded px-4 py-2 text-center">
                <p 
                  className="text-green-800 font-bold"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {percentOff}% Off
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
