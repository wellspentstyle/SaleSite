import { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { X } from 'lucide-react';

interface ManualEntryFormProps {
  url: string;
  onDataChange: (data: ManualProductData) => void;
  onRemove: () => void;
}

export interface ManualProductData {
  url: string;
  name: string;
  imageUrl: string;
  originalPrice: number;
  salePrice: number;
  percentOff: number;
}

export function ManualEntryForm({ url, onDataChange, onRemove }: ManualEntryFormProps) {
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [percentOff, setPercentOff] = useState(0);

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

  useEffect(() => {
    onDataChange({
      url,
      name,
      imageUrl,
      originalPrice: parseFloat(originalPrice) || 0,
      salePrice: parseFloat(salePrice) || 0,
      percentOff
    });
  }, [url, name, imageUrl, originalPrice, salePrice, percentOff, onDataChange]);

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
          <div className="space-y-2 md:col-span-2">
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
            <Input
              id={`sale-${url}`}
              type="number"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder="0.00"
              className="h-10"
              required
            />
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
