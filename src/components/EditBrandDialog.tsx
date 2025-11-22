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
  const [newCategoryItem, setNewCategoryItem] = useState('');
  const [newValueItem, setNewValueItem] = useState('');

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

  const handleAddCategory = () => {
    if (newCategoryItem.trim()) {
      setCategoryArray(prev => [...prev, newCategoryItem.trim()]);
      setNewCategoryItem('');
    }
  };

  const handleRemoveValue = (index: number) => {
    setValuesArray(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddValue = () => {
    if (newValueItem.trim()) {
      setValuesArray(prev => [...prev, newValueItem.trim()]);
      setNewValueItem('');
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

        <div className="space-y-6" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          {/* Type */}
          <div className="space-y-2">
            <Label htmlFor="type" style={{ fontWeight: 600 }}>Type</Label>
            <Input
              id="type"
              value={editedData.type}
              onChange={(e) => setEditedData({ ...editedData, type: e.target.value })}
              placeholder="e.g., Brand, Shop"
            />
          </div>

          {/* Price Range */}
          <div className="space-y-2">
            <Label htmlFor="priceRange" style={{ fontWeight: 600 }}>Price Range</Label>
            <Input
              id="priceRange"
              value={editedData.priceRange}
              onChange={(e) => setEditedData({ ...editedData, priceRange: e.target.value })}
              placeholder="e.g., $, $$, $$$, $$$$"
            />
          </div>

          {/* Categories (Array Editor) */}
          <div className="space-y-2">
            <Label style={{ fontWeight: 600 }}>Categories</Label>
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
            <div className="flex gap-2">
              <Input
                value={newCategoryItem}
                onChange={(e) => setNewCategoryItem(e.target.value)}
                placeholder="Add category (e.g., Shoes, Dresses)"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCategory())}
              />
              <Button onClick={handleAddCategory} type="button">Add</Button>
            </div>
          </div>

          {/* Values (Array Editor) */}
          <div className="space-y-2">
            <Label style={{ fontWeight: 600 }}>Values</Label>
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
            <div className="flex gap-2">
              <Input
                value={newValueItem}
                onChange={(e) => setNewValueItem(e.target.value)}
                placeholder="Add value (e.g., Sustainable, Women-Owned)"
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddValue())}
              />
              <Button onClick={handleAddValue} type="button">Add</Button>
            </div>
          </div>

          {/* Max Women's Size */}
          <div className="space-y-2">
            <Label htmlFor="maxWomensSize" style={{ fontWeight: 600 }}>Max Women's Size</Label>
            <Input
              id="maxWomensSize"
              value={editedData.maxWomensSize}
              onChange={(e) => setEditedData({ ...editedData, maxWomensSize: e.target.value })}
              placeholder="e.g., Up to 14, Up to 18"
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description" style={{ fontWeight: 600 }}>Description</Label>
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
            <Label htmlFor="url" style={{ fontWeight: 600 }}>URL</Label>
            <Input
              id="url"
              value={editedData.url}
              onChange={(e) => setEditedData({ ...editedData, url: e.target.value })}
              placeholder="https://..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} style={{ backgroundColor: '#000', color: '#fff' }}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
