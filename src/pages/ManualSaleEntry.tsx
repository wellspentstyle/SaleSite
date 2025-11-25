import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import { Loader2, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

interface SaleFormData {
  company: string;
  percentOff: number | '';
  saleUrl: string;
  discountCode: string;
  startDate: string;
  endDate: string;
}

export function ManualSaleEntry() {
  const navigate = useNavigate();
  const [isSavingToSite, setIsSavingToSite] = useState(false);
  const [isSavingToPending, setIsSavingToPending] = useState(false);
  const [formData, setFormData] = useState<SaleFormData>({
    company: '',
    percentOff: '',
    saleUrl: '',
    discountCode: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: ''
  });

  const validateForm = () => {
    if (!formData.company || !formData.percentOff) {
      toast.error('Brand name and discount percentage are required');
      return false;
    }
    return true;
  };

  const handleAddToSite = async () => {
    if (!validateForm()) return;
    
    const auth = sessionStorage.getItem('adminAuth') || '';
    
    try {
      setIsSavingToSite(true);
      
      const response = await fetch(`${API_BASE}/sales/add-direct`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify({
          company: formData.company,
          percentOff: Number(formData.percentOff),
          saleUrl: formData.saleUrl || null,
          discountCode: formData.discountCode || null,
          startDate: formData.startDate,
          endDate: formData.endDate || null
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Sale added to site');
        navigate('/admin/sales-approvals');
      } else {
        toast.error(data.error || 'Failed to add sale');
      }
    } catch (error) {
      console.error('Error adding sale:', error);
      toast.error('Failed to add sale');
    } finally {
      setIsSavingToSite(false);
    }
  };

  const handleAddToPending = async () => {
    if (!validateForm()) return;

    const auth = sessionStorage.getItem('adminAuth') || '';
    
    try {
      setIsSavingToPending(true);
      
      const response = await fetch(`${API_BASE}/pending-sales/manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify({
          company: formData.company,
          percentOff: Number(formData.percentOff),
          saleUrl: formData.saleUrl || null,
          discountCode: formData.discountCode || null,
          startDate: formData.startDate,
          endDate: formData.endDate || null
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Sale added to pending approvals');
        navigate('/admin/sales-approvals');
      } else {
        toast.error(data.error || 'Failed to add sale');
      }
    } catch (error) {
      console.error('Error adding sale:', error);
      toast.error('Failed to add sale');
    } finally {
      setIsSavingToPending(false);
    }
  };

  return (
    <div className="p-8 admin-page">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/admin/sales-approvals')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-bold">Add Sale Manually</h1>
          <p className="text-gray-600 mt-1">
            Add a sale that wasn't captured from email
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="company">Brand/Company Name *</Label>
                <Input
                  id="company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="e.g., Everlane, Madewell"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="percentOff">Discount Percentage *</Label>
                <Input
                  id="percentOff"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.percentOff}
                  onChange={(e) => setFormData({ ...formData, percentOff: e.target.value ? Number(e.target.value) : '' })}
                  placeholder="e.g., 25"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="saleUrl">Sale URL</Label>
                <Input
                  id="saleUrl"
                  type="url"
                  value={formData.saleUrl}
                  onChange={(e) => setFormData({ ...formData, saleUrl: e.target.value })}
                  placeholder="https://..."
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty if you don't have the URL yet
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountCode">Promo Code</Label>
                <Input
                  id="discountCode"
                  value={formData.discountCode}
                  onChange={(e) => setFormData({ ...formData, discountCode: e.target.value })}
                  placeholder="e.g., SAVE25"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate('/admin/sales-approvals')}
                >
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  variant="outline"
                  disabled={isSavingToSite || isSavingToPending}
                  onClick={handleAddToPending}
                >
                  {isSavingToPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Adding...
                    </>
                  ) : (
                    'Add to Pending Sales'
                  )}
                </Button>
                <Button 
                  type="button" 
                  disabled={isSavingToSite || isSavingToPending}
                  onClick={handleAddToSite}
                >
                  {isSavingToSite ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Adding...
                    </>
                  ) : (
                    'Add to Site'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
