import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { X } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

interface BrandData {
  name: string;
  type: string;
  priceRange: string;
  category: string;
  values: string;
  maxWomensSize: string;
  description: string;
  url: string;
}

interface EditBrandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandData: BrandData;
  onSave: (updatedData: BrandData) => void;
}

export function EditBrandDialog({ open, onOpenChange, brandData, onSave }: EditBrandDialogProps) {
  const [editedData, setEditedData] = useState<BrandData>(brandData);

  // Parse comma-separated string into array
  const parseToArray = (value: string): string[] => {
    return value.split(',').map(v => v.trim()).filter(v => v.length > 0);
  };

  // Convert array back to comma-separated string
  const arrayToString = (arr: string[]): string => {
    return arr.join(', ');
  };

  const [categoryArray, setCategoryArray] = useState<string[]>(parseToArray(brandData.category));
  const [valuesArray, setValuesArray] = useState<string[]>(parseToArray(brandData.values));
  const [newSizeItem, setNewSizeItem] = useState('');

  // Predefined options for dropdowns - Categories from Airtable
  const categoryOptions = ['Clothing', 'Shoes', 'Accessories', 'Bags', 'Jewelry', 'Outerwear', 'Swimwear'];
  const valueOptions = ['Sustainable', 'Women-Owned', 'Independent label', 'Secondhand', 'BIPOC-Owned'];
  const sizeOptions = ['Up to 10', 'Up to 12', 'Up to 14', 'Up to 16', 'Up to 18', 'Up to 20', 'Up to 24', 'Up to 28'];

  const handleSave = () => {
    const updatedData = {
      ...editedData,
      category: arrayToString(categoryArray),
      values: arrayToString(valuesArray)
    };
    onSave(updatedData);
    onOpenChange(false);
  };

  const handleRemoveCategory = (index: number) => {
    setCategoryArray(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddCategory = (value: string) => {
    // Auto-add when selecting from dropdown, avoid duplicates
    if (value && !categoryArray.includes(value)) {
      setCategoryArray(prev => [...prev, value]);
    }
  };

  const handleRemoveValue = (index: number) => {
    setValuesArray(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddValue = (value: string) => {
    // Auto-add when selecting from dropdown, avoid duplicates
    if (value && !valuesArray.includes(value)) {
      setValuesArray(prev => [...prev, value]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '24px' }}>
            Edit Brand: {brandData.name}
          </DialogTitle>
          <DialogDescription style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Modify the brand research data before saving to Airtable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-16" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          {/* Type - Always "Brand" (hidden, non-editable) */}
          
          {/* Price Range */}
          <div className="space-y-2">
            <Label htmlFor="priceRange" style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>Price Range</Label>
            <Input
              id="priceRange"
              value={editedData.priceRange}
              onChange={(e) => setEditedData({ ...editedData, priceRange: e.target.value })}
              placeholder="e.g., $, $$, $$$, $$$$"
            />
          </div>

          {/* Categories (Dropdown-only picker) */}
          <div className="space-y-2">
            <Label style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>Categories</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {categoryArray.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-md"
                >
                  <span className="text-sm">{item}</span>
                  <button
                    onClick={() => handleRemoveCategory(index)}
                    className="ml-1 text-gray-500 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <Select onValueChange={handleAddCategory}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a category to add" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions
                  .filter(opt => !categoryArray.includes(opt))
                  .map(opt => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Values (Multi-select with auto-add) */}
          <div className="space-y-2">
            <Label style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>Values</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {valuesArray.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1 bg-gray-100 px-3 py-1 rounded-md"
                >
                  <span className="text-sm">{item}</span>
                  <button
                    onClick={() => handleRemoveValue(index)}
                    className="ml-1 text-gray-500 hover:text-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <Select onValueChange={handleAddValue}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a value to add" />
              </SelectTrigger>
              <SelectContent>
                {valueOptions
                  .filter(opt => !valuesArray.includes(opt))
                  .map(opt => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          {/* Max Women's Size */}
          <div className="space-y-2">
            <Label htmlFor="maxWomensSize" style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>Max Women's Size</Label>
            <div className="flex gap-2">
              <Input
                value={newSizeItem}
                onChange={(e) => setNewSizeItem(e.target.value)}
                placeholder="Type or select from suggestions"
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (newSizeItem.trim()) {
                      setEditedData({ ...editedData, maxWomensSize: newSizeItem.trim() });
                      setNewSizeItem('');
                    }
                  }
                }}
                list="size-options"
              />
              <datalist id="size-options">
                {sizeOptions.map(opt => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
              <Button 
                onClick={() => {
                  if (newSizeItem.trim()) {
                    setEditedData({ ...editedData, maxWomensSize: newSizeItem.trim() });
                    setNewSizeItem('');
                  }
                }}
                type="button"
                variant="outline"
                style={{ fontFamily: 'DM Sans, sans-serif', backgroundColor: '#fff' }}
              >
                Add
              </Button>
            </div>
            {editedData.maxWomensSize && (
              <div className="text-sm text-muted-foreground mt-1">
                Current: <span className="font-medium">{editedData.maxWomensSize}</span>
              </div>
            )}
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>Description</Label>
            <Textarea
              id="description"
              value={editedData.description}
              onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
              placeholder="Brand description"
              rows={4}
            />
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url" style={{ fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }}>URL</Label>
            <Input
              id="url"
              value={editedData.url}
              onChange={(e) => setEditedData({ ...editedData, url: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            style={{ backgroundColor: '#000', color: '#fff', fontFamily: 'DM Sans, sans-serif' }}
          >
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
