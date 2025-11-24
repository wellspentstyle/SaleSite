import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
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

  return (
    <div className="border border-yellow-300 bg-yellow-50 rounded-lg p-6 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-bold">{brand.name}</h3>
            <span className="text-xs px-2 py-1 bg-yellow-200 text-yellow-800 rounded-full">
              Auto-researched
            </span>
          </div>
          <p className="text-sm text-gray-600 mt-1">
            Quality Score: {brand.qualityScore}%
          </p>
        </div>
        <div className="flex gap-2">
          {!isEditing ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsEditing(true)}
                disabled={isProcessing}
              >
                <Edit2 className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-700"
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
          <Label className="text-sm font-medium">Type</Label>
          {isEditing ? (
            <Input
              value={editedData.type}
              onChange={(e) => setEditedData({ ...editedData, type: e.target.value })}
              className="mt-1"
            />
          ) : (
            <p className="text-sm text-gray-700 mt-1">{brand.type}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium">Price Range</Label>
          {isEditing ? (
            <Input
              value={editedData.priceRange}
              onChange={(e) => setEditedData({ ...editedData, priceRange: e.target.value })}
              className="mt-1"
            />
          ) : (
            <p className="text-sm text-gray-700 mt-1">{brand.priceRange}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium">Categories</Label>
          {isEditing ? (
            <Input
              value={editedData.category}
              onChange={(e) => setEditedData({ ...editedData, category: e.target.value })}
              className="mt-1"
            />
          ) : (
            <p className="text-sm text-gray-700 mt-1">{brand.category}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium">Values</Label>
          {isEditing ? (
            <Input
              value={editedData.values}
              onChange={(e) => setEditedData({ ...editedData, values: e.target.value })}
              className="mt-1"
            />
          ) : (
            <p className="text-sm text-gray-700 mt-1">{brand.values || 'None'}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium">Max Size</Label>
          {isEditing ? (
            <Input
              value={editedData.maxWomensSize}
              onChange={(e) => setEditedData({ ...editedData, maxWomensSize: e.target.value })}
              className="mt-1"
            />
          ) : (
            <p className="text-sm text-gray-700 mt-1">{brand.maxWomensSize || 'Not found'}</p>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium">URL</Label>
          {isEditing ? (
            <Input
              value={editedData.url}
              onChange={(e) => setEditedData({ ...editedData, url: e.target.value })}
              className="mt-1"
            />
          ) : (
            <p className="text-sm text-gray-700 mt-1">
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
