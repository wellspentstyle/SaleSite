import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
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
import { Loader2, Check, X, ExternalLink, AlertCircle, Edit2, Plus, Sparkles, ClipboardList } from 'lucide-react';
import { EditSaleDialog } from '../components/EditSaleDialog';
import ExtractSale from './admin/ExtractSale';

interface RejectedEmail {
  brand: string;
  subject: string;
  reason: string;
  from: string;
  rejectedAt: string;
}

interface PendingSale {
  id: string;
  company: string;
  percentOff: number;
  saleUrl: string;
  cleanUrl: string;
  discountCode?: string;
  startDate: string;
  endDate?: string;
  confidence: number;
  reasoning: string;
  emailFrom: string;
  emailSubject: string;
  receivedAt: string;
  missingUrl?: boolean;
  urlSource?: string;
}

interface DuplicateSale {
  id: string;
  company: string;
  percentOff: number;
  startDate: string;
  endDate?: string;
  saleUrl: string;
}

const API_BASE = '/api';

export function SalesApprovals() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [rejectedEmails, setRejectedEmails] = useState<RejectedEmail[]>([]);
  const [approvalsEnabled, setApprovalsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Record<string, DuplicateSale[]>>({});
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);
  const [editingSale, setEditingSale] = useState<PendingSale | null>(null);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<string>(searchParams.get('tab') || 'pending');
  
  // Confirmation dialog state
  const [showApprovalConfirm, setShowApprovalConfirm] = useState(false);
  const [pendingApprovalValue, setPendingApprovalValue] = useState<boolean | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const auth = sessionStorage.getItem('adminAuth') || '';
    
    try {
      setLoading(true);
      
      const [salesRes, settingsRes, rejectedRes] = await Promise.all([
        fetch(`${API_BASE}/pending-sales`, {
          headers: { 'auth': auth }
        }),
        fetch(`${API_BASE}/approval-settings`, {
          headers: { 'auth': auth }
        }),
        fetch(`${API_BASE}/rejected-emails?limit=50`, {
          headers: { 'auth': auth }
        })
      ]);
      
      const salesData = await salesRes.json();
      const settingsData = await settingsRes.json();
      const rejectedData = await rejectedRes.json();
      
      if (salesData.success) {
        setPendingSales(salesData.sales);
      }
      
      if (settingsData.success) {
        setApprovalsEnabled(settingsData.settings.approvalsEnabled);
      }
      
      if (rejectedData.success) {
        setRejectedEmails(rejectedData.emails);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprovalToggleRequest = (enabled: boolean) => {
    setPendingApprovalValue(enabled);
    setShowApprovalConfirm(true);
  };

  const handleConfirmApprovalToggle = async () => {
    if (pendingApprovalValue === null) return;
    
    const auth = sessionStorage.getItem('adminAuth') || '';
    
    try {
      setSettingsLoading(true);
      setShowApprovalConfirm(false);
      
      const response = await fetch(`${API_BASE}/approval-settings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify({ approvalsEnabled: pendingApprovalValue })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setApprovalsEnabled(pendingApprovalValue);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
    } finally {
      setSettingsLoading(false);
      setPendingApprovalValue(null);
    }
  };

  const handleCheckDuplicates = async (saleId: string) => {
    const auth = sessionStorage.getItem('adminAuth') || '';
    
    try {
      const response = await fetch(`${API_BASE}/check-duplicates/${saleId}`, {
        method: 'POST',
        headers: { 'auth': auth }
      });
      
      const data = await response.json();
      
      if (data.success) {
        // Filter out any entries that match the pending sale's ID
        // Only show true Airtable duplicates
        const filteredDuplicates = data.duplicates.filter(
          (dup: DuplicateSale) => dup.id !== saleId
        );
        
        setDuplicates(prev => ({
          ...prev,
          [saleId]: filteredDuplicates
        }));
      }
    } catch (error) {
      console.error('Error checking duplicates:', error);
    }
  };

  const handleApproveSale = async (id: string, replaceSaleId?: string) => {
    const auth = sessionStorage.getItem('adminAuth') || '';
    
    try {
      setActionLoading(id);
      
      const response = await fetch(`${API_BASE}/approve-sale/${id}`, {
        method: 'POST',
        headers: { 
          'auth': auth,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ replaceSaleId })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setPendingSales(pendingSales.filter(s => s.id !== id));
        setDuplicates(prev => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
      } else {
        alert(`Error approving sale: ${data.error}`);
      }
    } catch (error) {
      console.error('Error approving sale:', error);
      alert('Error approving sale');
    } finally {
      setActionLoading(null);
    }
  };
  
  const handleToggleExpand = (saleId: string) => {
    if (expandedSaleId === saleId) {
      setExpandedSaleId(null);
    } else {
      setExpandedSaleId(saleId);
      if (!duplicates[saleId]) {
        handleCheckDuplicates(saleId);
      }
    }
  };

  const handleRejectSale = async (id: string) => {
    const auth = sessionStorage.getItem('adminAuth') || '';
    
    try {
      setActionLoading(id);
      
      const response = await fetch(`${API_BASE}/reject-sale/${id}`, {
        method: 'POST',
        headers: { 'auth': auth }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setPendingSales(pendingSales.filter(s => s.id !== id));
      } else {
        alert(`Error rejecting sale: ${data.error}`);
      }
    } catch (error) {
      console.error('Error rejecting sale:', error);
      alert('Error rejecting sale');
    } finally {
      setActionLoading(null);
    }
  };

  const handleEditSale = (updatedData: { company: string; percentOff: number; saleUrl: string; discountCode?: string; startDate: string; endDate?: string }) => {
    if (!editingSale) return;
    
    setPendingSales(prev => prev.map(sale => {
      if (sale.id === editingSale.id) {
        return {
          ...sale,
          company: updatedData.company,
          percentOff: updatedData.percentOff,
          saleUrl: updatedData.saleUrl,
          cleanUrl: updatedData.saleUrl,
          discountCode: updatedData.discountCode,
          startDate: updatedData.startDate,
          endDate: updatedData.endDate
        };
      }
      return sale;
    }));
    
    setEditingSale(null);
  };

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  };

  return (
    <div className="p-4 md:p-8 admin-page">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Add Sales</h1>
            <p className="text-gray-600 mt-1 text-sm md:text-base">Add new sales or review pending approvals</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Pending ({pendingSales.length})
            </TabsTrigger>
            <TabsTrigger value="extract" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Extract
            </TabsTrigger>
          </TabsList>

          <TabsContent value="extract" className="mt-6">
            <ExtractSale />
          </TabsContent>

          <TabsContent value="pending" className="mt-6 space-y-4">
            {/* Manual Add Button */}
            <div className="flex justify-end">
              <Button onClick={() => navigate('/admin/sales-approvals/manual')} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Manual Entry
              </Button>
            </div>

      {/* Pending Sales */}
      <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">
              Pending Sales ({pendingSales.length})
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pendingSales.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground">
                  No pending sales to review
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {pendingSales.map(sale => (
                <Card key={sale.id} className="cursor-pointer" onClick={() => handleToggleExpand(sale.id)}>
                  <CardContent className="pt-6">
                    <div className="space-y-4">
                      {/* Sale Header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold">
                            {sale.company} - {sale.percentOff}% Off
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Received {new Date(sale.receivedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {sale.missingUrl && (
                            <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800 flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              URL {sale.urlSource === 'brand_homepage' ? 'from homepage' : 'missing'}
                            </span>
                          )}
                          <span className={`px-2 py-1 rounded text-xs ${
                            sale.confidence >= 85
                              ? 'bg-green-100 text-green-800'
                              : sale.confidence >= 70
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-orange-100 text-orange-800'
                          }`}>
                            {sale.confidence}% confidence
                          </span>
                        </div>
                      </div>

                      {/* Sale Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm overflow-hidden" style={{ fontFamily: 'system-ui, sans-serif' }}>
                        <div className="min-w-0">
                          <span className="text-muted-foreground">Email From:</span>
                          <p className="font-medium truncate" title={sale.emailFrom}>{sale.emailFrom}</p>
                        </div>
                        <div className="min-w-0">
                          <span className="text-muted-foreground">Subject:</span>
                          <p className="font-medium truncate" title={sale.emailSubject}>{sale.emailSubject}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sale URL:</span>
                          {(sale.cleanUrl || sale.saleUrl) ? (
                            <div className="flex items-center gap-2">
                              <a 
                                href={sale.cleanUrl || sale.saleUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {sale.missingUrl && sale.urlSource === 'brand_homepage' ? 'Visit Brand Homepage' : 'Visit Sale Page'}
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              {sale.missingUrl && sale.urlSource === 'brand_homepage' && (
                                <span className="text-xs text-orange-600">(auto-filled)</span>
                              )}
                            </div>
                          ) : (
                            <p className="text-red-600 font-medium flex items-center gap-1">
                              <AlertCircle className="h-3 w-3" />
                              No URL found - please add manually
                            </p>
                          )}
                        </div>
                        {sale.discountCode && (
                          <div>
                            <span className="text-muted-foreground">Promo Code:</span>
                            <p className="font-medium font-mono">{sale.discountCode}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-muted-foreground">Start Date:</span>
                          <p className="font-medium">{sale.startDate}</p>
                        </div>
                        {sale.endDate && (
                          <div>
                            <span className="text-muted-foreground">End Date:</span>
                            <p className="font-medium">{sale.endDate}</p>
                          </div>
                        )}
                      </div>

                      {/* AI Reasoning */}
                      {sale.reasoning && (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground mb-1">AI Reasoning:</p>
                          <p className="text-sm">{sale.reasoning}</p>
                        </div>
                      )}

                      {/* Duplicate Warning */}
                      {duplicates[sale.id] && duplicates[sale.id].length > 0 && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3" onClick={(e) => e.stopPropagation()}>
                          <p className="text-sm font-semibold text-yellow-800 mb-2">
                            ⚠️ Potential Duplicates Found ({duplicates[sale.id].length})
                          </p>
                          <div className="space-y-2">
                            {duplicates[sale.id].map(dup => (
                              <div key={dup.id} className="bg-white rounded p-2 text-xs">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-medium">{dup.company} - {dup.percentOff}%</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleApproveSale(sale.id, dup.id)}
                                    disabled={actionLoading === sale.id}
                                    style={{ height: '28px', fontSize: '11px' }}
                                  >
                                    Replace This
                                  </Button>
                                </div>
                                <p className="text-muted-foreground">
                                  Starts: {dup.startDate} {dup.endDate ? `| Ends: ${dup.endDate}` : ''}
                                </p>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Click "Replace This" to delete the old sale and add this new one, or use "Approve Anyway" to add both.
                          </p>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="outline"
                          onClick={() => setEditingSale(sale)}
                          disabled={actionLoading === sale.id}
                          style={{ fontFamily: 'system-ui, sans-serif' }}
                        >
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </Button>
                        <Button
                          onClick={() => handleApproveSale(sale.id)}
                          disabled={actionLoading === sale.id}
                          className="flex-1"
                          style={{ fontFamily: 'system-ui, sans-serif' }}
                        >
                          {actionLoading === sale.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Check className="h-4 w-4 mr-2" />
                          )}
                          {duplicates[sale.id]?.length > 0 ? 'Approve Anyway' : 'Approve & Add to Airtable'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleRejectSale(sale.id)}
                          disabled={actionLoading === sale.id}
                          style={{ fontFamily: 'system-ui, sans-serif' }}
                        >
                          {actionLoading === sale.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <X className="h-4 w-4 mr-2" />
                          )}
                          Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Rejected Emails */}
        <div className="space-y-4 mt-8">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-bold">
              Recently Rejected ({rejectedEmails.length})
            </h2>
          </div>
          
          {rejectedEmails.length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-muted-foreground">
                  No rejected emails yet
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-auto max-h-[400px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50">
                      <tr className="border-b">
                        <th className="text-left p-3 font-medium">Brand</th>
                        <th className="text-left p-3 font-medium">Subject</th>
                        <th className="text-left p-3 font-medium">Reason</th>
                        <th className="text-left p-3 font-medium">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rejectedEmails.map((email, index) => (
                        <tr key={index} className="border-b last:border-0 hover:bg-muted/25">
                          <td className="p-3 font-medium">{email.brand}</td>
                          <td className="p-3 text-muted-foreground max-w-[200px] truncate" title={email.subject}>
                            {email.subject}
                          </td>
                          <td className="p-3">
                            <span className="inline-block px-2 py-1 bg-red-50 text-red-700 rounded text-xs">
                              {email.reason}
                            </span>
                          </td>
                          <td className="p-3 text-muted-foreground whitespace-nowrap">
                            {new Date(email.rejectedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-muted-foreground">
            Shows recent emails that were rejected from the approval queue
          </p>
        </div>

            {/* Settings Card - at bottom */}
            <Card className="mt-8 border-dashed">
              <CardContent className="pt-4 md:pt-6">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <Label htmlFor="approvals-toggle" className="text-base" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                      Require Manual Approval
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      When enabled, new sales will wait for your approval before being added to Airtable.
                    </p>
                  </div>
                  <Switch
                    id="approvals-toggle"
                    checked={approvalsEnabled}
                    onCheckedChange={handleApprovalToggleRequest}
                    disabled={settingsLoading}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirmation Dialog for Approval Toggle */}
      <AlertDialog open={showApprovalConfirm} onOpenChange={setShowApprovalConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingApprovalValue ? 'Enable Manual Approval?' : 'Disable Manual Approval?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingApprovalValue 
                ? 'New sales from emails will require your manual approval before being added to Airtable. You can review and approve them from this page.'
                : 'New sales from emails will be automatically added to Airtable without requiring your approval. Make sure your email parsing is reliable before disabling this.'
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingApprovalValue(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmApprovalToggle}>
              {pendingApprovalValue ? 'Enable' : 'Disable'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Sale Dialog */}
      {editingSale && (
        <EditSaleDialog
          open={!!editingSale}
          onOpenChange={(open) => !open && setEditingSale(null)}
          saleData={{
            company: editingSale.company,
            percentOff: editingSale.percentOff,
            saleUrl: editingSale.saleUrl,
            discountCode: editingSale.discountCode,
            startDate: editingSale.startDate,
            endDate: editingSale.endDate
          }}
          onSave={handleEditSale}
        />
      )}
    </div>
  );
}
