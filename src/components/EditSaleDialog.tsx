import { useState, useEffect } from 'react';
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
import { Label } from './ui/label';

interface SaleData {
  company: string;
  percentOff: number;
  extraDiscount?: number;
  saleUrl: string;
  discountCode?: string;
  startDate: string;
  endDate?: string;
}

interface EditSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleData: SaleData;
  onSave: (updatedData: SaleData) => void;
}

export function EditSaleDialog({ open, onOpenChange, saleData, onSave }: EditSaleDialogProps) {
  const [editedData, setEditedData] = useState<SaleData>(saleData);

  useEffect(() => {
    setEditedData(saleData);
  }, [saleData]);

  const handleSave = () => {
    onSave(editedData);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '24px' }}>
            Edit Sale
          </DialogTitle>
          <DialogDescription style={{ fontFamily: 'DM Sans, sans-serif' }}>
            Modify the sale details before approving.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
          <div className="space-y-2">
            <Label htmlFor="company" style={{ fontWeight: 600 }}>Brand/Company</Label>
            <Input
              id="company"
              value={editedData.company}
              onChange={(e) => setEditedData({ ...editedData, company: e.target.value })}
              placeholder="e.g., Everlane"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="percentOff" style={{ fontWeight: 600 }}>Discount (%)</Label>
            <Input
              id="percentOff"
              type="number"
              min="1"
              max="100"
              value={editedData.percentOff}
              onChange={(e) => setEditedData({ ...editedData, percentOff: parseInt(e.target.value) || 0 })}
              placeholder="e.g., 25"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="extraDiscount" style={{ fontWeight: 600 }}>Extra % Off (optional)</Label>
              <Input
                id="extraDiscount"
                type="number"
                min="0"
                max="100"
                value={editedData.extraDiscount || ''}
                onChange={(e) => setEditedData({ ...editedData, extraDiscount: e.target.value ? parseInt(e.target.value) : undefined })}
                placeholder="e.g., 20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discountCode" style={{ fontWeight: 600 }}>Promo Code (optional)</Label>
              <Input
                id="discountCode"
                value={editedData.discountCode || ''}
                onChange={(e) => setEditedData({ ...editedData, discountCode: e.target.value || undefined })}
                placeholder="e.g., SAVE25"
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="saleUrl" style={{ fontWeight: 600 }}>Sale URL</Label>
            <Input
              id="saleUrl"
              value={editedData.saleUrl}
              onChange={(e) => setEditedData({ ...editedData, saleUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate" style={{ fontWeight: 600 }}>Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={editedData.startDate}
                onChange={(e) => setEditedData({ ...editedData, startDate: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate" style={{ fontWeight: 600 }}>End Date (optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={editedData.endDate || ''}
                onChange={(e) => setEditedData({ ...editedData, endDate: e.target.value || undefined })}
              />
            </div>
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
