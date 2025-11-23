import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Switch } from '../components/ui/switch';
import { Label } from '../components/ui/label';
import { Loader2, Check, X, ExternalLink } from 'lucide-react';

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
}

const API_BASE = '/api';

export function SalesApprovals() {
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);
  const [approvalsEnabled, setApprovalsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const auth = sessionStorage.getItem('adminAuth') || '';
    
    try {
      setLoading(true);
      
      const [salesRes, settingsRes] = await Promise.all([
        fetch(`${API_BASE}/pending-sales`, {
          headers: { 'auth': auth }
        }),
        fetch(`${API_BASE}/approval-settings`, {
          headers: { 'auth': auth }
        })
      ]);
      
      const salesData = await salesRes.json();
      const settingsData = await settingsRes.json();
      
      if (salesData.success) {
        setPendingSales(salesData.sales);
      }
      
      if (settingsData.success) {
        setApprovalsEnabled(settingsData.settings.approvalsEnabled);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleApprovals = async (enabled: boolean) => {
    const auth = sessionStorage.getItem('adminAuth') || '';
    
    try {
      setSettingsLoading(true);
      
      const response = await fetch(`${API_BASE}/approval-settings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify({ approvalsEnabled: enabled })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setApprovalsEnabled(enabled);
      }
    } catch (error) {
      console.error('Error updating settings:', error);
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleApproveSale = async (id: string) => {
    const auth = sessionStorage.getItem('adminAuth') || '';
    
    try {
      setActionLoading(id);
      
      const response = await fetch(`${API_BASE}/approve-sale/${id}`, {
        method: 'POST',
        headers: { 'auth': auth }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setPendingSales(pendingSales.filter(s => s.id !== id));
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

  const handleRejectSale = async (id: string) => {
    if (!confirm('Are you sure you want to reject this sale?')) {
      return;
    }
    
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

  return (
    <div className="p-8">
      <h1 className="text-2xl mb-6" style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}>
        Sales Approvals
      </h1>
        {/* Settings Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Approval Settings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label htmlFor="approvals-toggle" className="text-base">
                  Require Manual Approval
                </Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, new sales will wait for your approval before being added to Airtable.
                </p>
              </div>
              <Switch
                id="approvals-toggle"
                checked={approvalsEnabled}
                onCheckedChange={handleToggleApprovals}
                disabled={settingsLoading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Pending Sales */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-normal">
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
                <Card key={sale.id}>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Email From:</span>
                          <p className="font-medium">{sale.emailFrom}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Subject:</span>
                          <p className="font-medium">{sale.emailSubject}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Sale URL:</span>
                          <a 
                            href={sale.cleanUrl || sale.saleUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            Visit Sale Page
                            <ExternalLink className="h-3 w-3" />
                          </a>
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

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={() => handleApproveSale(sale.id)}
                          disabled={actionLoading === sale.id}
                          className="flex-1"
                        >
                          {actionLoading === sale.id ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <Check className="h-4 w-4 mr-2" />
                          )}
                          Approve & Add to Airtable
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => handleRejectSale(sale.id)}
                          disabled={actionLoading === sale.id}
                          className="flex-1"
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
      </div>
    </div>
  );
}
