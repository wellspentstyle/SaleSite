import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Check, X, Edit2, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface PendingBrand {
  id: string;
  name: string;
  airtableRecordId: string;
  type: string;
  priceRange: string;
  category: string;
  values: string;
  maxWomensSize: string;
  sizingSource: string;
  description: string;
  notes: string;
  url: string;
  qualityScore: number;
}

interface PendingBrandCardProps {
  brand: PendingBrand;
  onApprove: () => void;
  onReject: () => void;
}

export function PendingBrandCard({ brand, onApprove, onReject }: PendingBrandCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [editedData, setEditedData] = useState(brand);

  const handleSaveEdit = async () => {
    setIsProcessing(true);
    try {
      const auth = sessionStorage.getItem('adminAuth') || '';
      const response = await fetch(`/api/admin/pending-brands/${brand.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify(editedData)
      });

      if (response.ok) {
        toast.success('Changes saved');
        setIsEditing(false);
        onApprove();
      } else {
        toast.error('Failed to save changes');
      }
    } catch (error) {
      toast.error('Error saving changes');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleApprove = async () => {
    setIsProcessing(true);
    try {
      const auth = sessionStorage.getItem('adminAuth') || '';
      const response = await fetch(`/api/admin/pending-brands/${brand.id}/approve`, {
        method: 'POST',
        headers: {
          'auth': auth
        }
      });

      if (response.ok) {
        toast.success(`${brand.name} approved and updated in Airtable`);
        onApprove();
      } else {
        toast.error('Failed to approve brand');
      }
    } catch (error) {
      toast.error('Error approving brand');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    setIsProcessing(true);
    try {
      const auth = sessionStorage.getItem('adminAuth') || '';
      const response = await fetch(`/api/admin/pending-brands/${brand.id}/reject`, {
        method: 'POST',
        headers: {
          'auth': auth
        }
      });

      if (response.ok) {
        toast.success(`${brand.name} rejected`);
        onReject();
      } else {
        toast.error('Failed to reject brand');
      }
    } catch (error) {
      toast.error('Error rejecting brand');
    } finally {
      setIsProcessing(false);
    }
  };

  const CATEGORY_OPTIONS = ['Clothing', 'Shoes', 'Bags', 'Accessories', 'Jewelry', 'Swimwear', 'Homewares', 'Outerwear'];
  const VALUES_OPTIONS = ['Independent label', 'Sustainable', 'Women-Owned', 'BIPOC-Owned', 'Secondhand'];
  const TYPE_OPTIONS = ['Brand', 'Shop'];
  const MAX_SIZE_OPTIONS = ['Up to 0', 'Up to 2', 'Up to 4', 'Up to 6', 'Up to 8', 'Up to 10', 'Up to 12', 'Up to 14', 'Up to 16', 'Up to 18', 'Up to 18+', 'Not found'];

  // Helper to normalize category/value strings by stripping quotes
  const normalizeValue = (val: string) => val.replace(/^"|"$/g, '').trim();

  const handleCategoryToggle = (category: string) => {
    // Normalize existing categories to strip any quotes
    const currentCategories = editedData.category
      .split(', ')
      .map(normalizeValue)
      .filter(c => c);
    const newCategories = currentCategories.includes(category)
      ? currentCategories.filter(c => c !== category)
      : [...currentCategories, category];
    setEditedData({ ...editedData, category: newCategories.join(', ') });
  };

  const handleValueToggle = (value: string) => {
    // Normalize existing values to strip any quotes
    const currentValues = editedData.values
      .split(', ')
      .map(normalizeValue)
      .filter(v => v);
    const newValues = currentValues.includes(value)
      ? currentValues.filter(v => v !== value)
      : [...currentValues, value];
    setEditedData({ ...editedData, values: newValues.join(', ') });
  };

  return (
    <div className="border border-gray-300 bg-white rounded-lg p-4 md:p-6 space-y-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg md:text-xl font-bold" style={{ fontFamily: 'DM Sans, sans-serif' }}>{brand.name}</h3>
            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full whitespace-nowrap" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              Auto-researched
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Quality Score: {brand.qualityScore}%
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isEditing ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
                disabled={isProcessing}
                className="flex-1 md:flex-none"
              >
                <Edit2 className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-700 flex-1 md:flex-none"
              >
                {isProcessing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Upload
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                disabled={isProcessing}
                className="flex-1 md:flex-none"
              >
                <X className="h-4 w-4 mr-1" />
                Reject
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleSaveEdit}
              disabled={isProcessing}
              className="flex-1 md:flex-none"
            >
              {isProcessing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1" />
              )}
              Save
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label className="text-sm font-medium" style={{ fontFamily: 'DM Sans, sans-serif' }}>Type</Label>
          {isEditing ? (
            <Select value={editedData.type} onValueChange={(value: string) => setEditedData({ ...editedData, type: value })}>
              <SelectTrigger className="mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent style={{ fontFamily: 'DM Sans, sans-serif' }}>
                {TYPE_OPTIONS.map(option => (
                  <SelectItem key={option} value={option} style={{ fontFamily: 'DM Sans, sans-serif' }}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-gray-700 mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>{brand.type}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium" style={{ fontFamily: 'DM Sans, sans-serif' }}>Price Range</Label>
          {isEditing ? (
            <Input
              value={editedData.priceRange}
              onChange={(e) => setEditedData({ ...editedData, priceRange: e.target.value })}
              className="mt-1"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            />
          ) : (
            <p className="text-sm text-gray-700 mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>{brand.priceRange}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <Label className="text-sm font-medium" style={{ fontFamily: 'DM Sans, sans-serif' }}>Categories (multi-select)</Label>
          {isEditing ? (
            <div className="mt-2 space-y-2 p-3 border rounded-md" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {CATEGORY_OPTIONS.map(category => {
                const currentCategories = editedData.category.split(', ').map(normalizeValue).filter(c => c);
                return (
                  <div key={category} className="flex items-center gap-2">
                    <Checkbox
                      id={`category-${category}`}
                      checked={currentCategories.includes(category)}
                      onCheckedChange={() => handleCategoryToggle(category)}
                    />
                    <label htmlFor={`category-${category}`} className="text-sm cursor-pointer" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                      {category}
                    </label>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-700 mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>{brand.category}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <Label className="text-sm font-medium" style={{ fontFamily: 'DM Sans, sans-serif' }}>Values (multi-select)</Label>
          {isEditing ? (
            <div className="mt-2 space-y-2 p-3 border rounded-md" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {VALUES_OPTIONS.map(value => {
                const currentValues = editedData.values.split(', ').map(normalizeValue).filter(v => v);
                return (
                  <div key={value} className="flex items-center gap-2">
                    <Checkbox
                      id={`value-${value}`}
                      checked={currentValues.includes(value)}
                      onCheckedChange={() => handleValueToggle(value)}
                    />
                    <label htmlFor={`value-${value}`} className="text-sm cursor-pointer" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                      {value}
                    </label>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-700 mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>{brand.values || 'None'}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium" style={{ fontFamily: 'DM Sans, sans-serif' }}>Max Size</Label>
          {isEditing ? (
            <Select value={editedData.maxWomensSize} onValueChange={(value: string) => setEditedData({ ...editedData, maxWomensSize: value })}>
              <SelectTrigger className="mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                <SelectValue placeholder="Select max size" />
              </SelectTrigger>
              <SelectContent style={{ fontFamily: 'DM Sans, sans-serif' }}>
                {MAX_SIZE_OPTIONS.map(option => (
                  <SelectItem key={option} value={option} style={{ fontFamily: 'DM Sans, sans-serif' }}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-gray-700 mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>{brand.maxWomensSize || 'Not found'}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium" style={{ fontFamily: 'DM Sans, sans-serif' }}>URL</Label>
          {isEditing ? (
            <Input
              value={editedData.url}
              onChange={(e) => setEditedData({ ...editedData, url: e.target.value })}
              className="mt-1"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            />
          ) : (
            <p className="text-sm text-gray-700 mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              <a href={brand.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {brand.url}
              </a>
            </p>
          )}
        </div>
      </div>

      <div>
        <Label className="text-sm font-medium">Description</Label>
        {isEditing ? (
          <Textarea
            value={editedData.description}
            onChange={(e) => setEditedData({ ...editedData, description: e.target.value })}
            className="mt-1"
            rows={3}
          />
        ) : (
          <p className="text-sm text-gray-700 mt-1">{brand.description}</p>
        )}
      </div>

      <div className="text-xs text-gray-500 border-t pt-3">
        <p><strong>Sizing Source:</strong> {brand.sizingSource || 'None'}</p>
        <p className="mt-1"><strong>Notes:</strong> {brand.notes}</p>
      </div>
    </div>
  );
}
