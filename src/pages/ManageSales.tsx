import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Loader2, ExternalLink, Check, X, Edit2, Save } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

interface Sale {
  id: string;
  saleName: string;
  percentOff: number;
  extraDiscount?: number;
  live: string;
  saleUrl?: string;
  picksCount: number;
  startDate?: string;
  endDate?: string;
  promoCode?: string;
}

interface EditingState {
  percentOff: string;
  extraDiscount: string;
  promoCode: string;
  endDate: string;
}

export function ManageSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<EditingState>({
    percentOff: '',
    extraDiscount: '',
    promoCode: '',
    endDate: ''
  });
  const [saving, setSaving] = useState(false);

  const getAuth = () => localStorage.getItem('adminAuth') || 'dev-mode';

  useEffect(() => {
    fetchSales();
  }, []);

  const fetchSales = async () => {
    try {
      const response = await fetch(`${API_BASE}/admin/sales`, {
        headers: { 'auth': getAuth() }
      });
      const data = await response.json();
      if (data.success) {
        setSales(data.sales || []);
      }
    } catch (error) {
      console.error('Failed to fetch sales:', error);
      toast.error('Failed to load sales');
    } finally {
      setLoading(false);
    }
  };

  const activeSales = sales.filter(s => s.live === 'YES');
  const completeSales = sales.filter(s => s.live !== 'YES');

  const handleToggleLive = async (sale: Sale) => {
    const newLiveStatus = sale.live === 'YES' ? 'NO' : 'YES';

    setSales(prevSales =>
      prevSales.map(s =>
        s.id === sale.id ? { ...s, live: newLiveStatus } : s
      )
    );

    try {
      const response = await fetch(`${API_BASE}/admin/sales/${sale.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'auth': getAuth()
        },
        body: JSON.stringify({ live: newLiveStatus })
      });

      const data = await response.json();
      if (!data.success) {
        setSales(prevSales =>
          prevSales.map(s =>
            s.id === sale.id ? { ...s, live: sale.live } : s
          )
        );
        toast.error('Failed to update sale status');
      } else {
        toast.success(newLiveStatus === 'YES' ? 'Sale activated' : 'Sale deactivated');
      }
    } catch (error) {
      setSales(prevSales =>
        prevSales.map(s =>
          s.id === sale.id ? { ...s, live: sale.live } : s
        )
      );
      toast.error('Failed to update sale status');
    }
  };

  const startEditing = (sale: Sale) => {
    setEditingId(sale.id);
    setEditingState({
      percentOff: sale.percentOff?.toString() || '',
      extraDiscount: sale.extraDiscount?.toString() || '',
      promoCode: sale.promoCode || '',
      endDate: sale.endDate || ''
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingState({
      percentOff: '',
      extraDiscount: '',
      promoCode: '',
      endDate: ''
    });
  };

  const saveEditing = async (saleId: string) => {
    setSaving(true);

    const updates: Record<string, any> = {};
    if (editingState.percentOff) {
      updates.percent_off = parseInt(editingState.percentOff);
    }
    if (editingState.extraDiscount) {
      updates.extra_discount = parseInt(editingState.extraDiscount);
    } else {
      updates.extra_discount = null;
    }
    updates.promo_code = editingState.promoCode || null;
    updates.end_date = editingState.endDate || null;

    try {
      const response = await fetch(`${API_BASE}/admin/sales/${saleId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'auth': getAuth()
        },
        body: JSON.stringify(updates)
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Sale updated');
        setEditingId(null);
        fetchSales();
      } else {
        toast.error(data.message || 'Failed to update sale');
      }
    } catch (error) {
      toast.error('Failed to update sale');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const renderSaleRow = (sale: Sale) => {
    const isEditing = editingId === sale.id;

    return (
      <div
        key={sale.id}
        className="border border-border bg-white p-4 mb-3"
        style={{ borderRadius: '4px' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 
                className="font-semibold text-lg truncate"
                style={{ fontFamily: 'DM Sans, sans-serif' }}
              >
                {sale.saleName}
              </h3>
              {sale.saleUrl && (
                <a
                  href={sale.saleUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-gray-600"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={16} />
                </a>
              )}
            </div>

            {isEditing ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">% Off</label>
                  <Input
                    type="number"
                    min="1"
                    max="100"
                    value={editingState.percentOff}
                    onChange={(e) => setEditingState({ ...editingState, percentOff: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Extra % Off</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={editingState.extraDiscount}
                    onChange={(e) => setEditingState({ ...editingState, extraDiscount: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="optional"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Promo Code</label>
                  <Input
                    value={editingState.promoCode}
                    onChange={(e) => setEditingState({ ...editingState, promoCode: e.target.value })}
                    className="h-8 text-sm font-mono"
                    placeholder="optional"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">End Date</label>
                  <Input
                    type="date"
                    value={editingState.endDate}
                    onChange={(e) => setEditingState({ ...editingState, endDate: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <span>
                  <strong>{sale.percentOff}% off</strong>
                  {sale.extraDiscount && sale.extraDiscount > 0 && (
                    <span className="text-green-600 ml-1">+ {sale.extraDiscount}% extra</span>
                  )}
                </span>
                {sale.promoCode && (
                  <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs">
                    {sale.promoCode}
                  </span>
                )}
                <span className="text-gray-400">
                  {sale.picksCount} {sale.picksCount === 1 ? 'pick' : 'picks'}
                </span>
                {sale.endDate && (
                  <span className="text-gray-400">
                    ends {formatDate(sale.endDate)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {isEditing ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={cancelEditing}
                  disabled={saving}
                >
                  <X size={16} />
                </Button>
                <Button
                  size="sm"
                  onClick={() => saveEditing(sale.id)}
                  disabled={saving}
                  style={{ backgroundColor: '#000', color: '#fff' }}
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => startEditing(sale)}
                  title="Edit sale"
                >
                  <Edit2 size={16} />
                </Button>
                <Switch
                  checked={sale.live === 'YES'}
                  onCheckedChange={() => handleToggleLive(sale)}
                />
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  return (
    <div style={{ fontFamily: 'DM Sans, sans-serif' }} className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Manage Sales</h1>
        <p className="text-gray-600">Edit sales and toggle them on or off.</p>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="active" className="px-6">
            Active ({activeSales.length})
          </TabsTrigger>
          <TabsTrigger value="complete" className="px-6">
            Complete ({completeSales.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {activeSales.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No active sales
            </div>
          ) : (
            <div>
              {activeSales.map(renderSaleRow)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="complete">
          {completeSales.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No completed sales
            </div>
          ) : (
            <div>
              {completeSales.map(renderSaleRow)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
