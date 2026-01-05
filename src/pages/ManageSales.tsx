import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Switch } from '../components/ui/switch';
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

type FilterType = 'active' | 'complete';

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
  const [filterType, setFilterType] = useState<FilterType>('active');

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
  const filteredSales = filterType === 'active' ? activeSales : completeSales;

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

  const startEditing = (sale: Sale, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(sale.id);
    setEditingState({
      percentOff: sale.percentOff?.toString() || '',
      extraDiscount: sale.extraDiscount?.toString() || '',
      promoCode: sale.promoCode || '',
      endDate: sale.endDate || ''
    });
  };

  const cancelEditing = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditingState({
      percentOff: '',
      extraDiscount: '',
      promoCode: '',
      endDate: ''
    });
  };

  const saveEditing = async (saleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
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

  const renderSaleCard = (sale: Sale) => {
    const isEditing = editingId === sale.id;

    return (
      <div
        key={sale.id}
        className="border bg-white transition-all hover:shadow-md"
        style={{
          padding: '20px',
          paddingRight: '80px',
          borderRadius: '4px',
          borderColor: '#e5e7eb',
          position: 'relative'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#9ca3af';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#e5e7eb';
        }}
      >
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2">
            <h3
              style={{
                fontFamily: 'DM Sans, sans-serif',
                fontWeight: 600,
                fontSize: '16px'
              }}
            >
              {sale.saleName}
            </h3>
          </div>

          {isEditing ? (
            <div className="space-y-2 mt-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">% Off</label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={editingState.percentOff}
                  onChange={(e) => setEditingState({ ...editingState, percentOff: e.target.value })}
                  className="h-8 text-sm"
                  onClick={(e) => e.stopPropagation()}
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
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Promo Code</label>
                <Input
                  value={editingState.promoCode}
                  onChange={(e) => setEditingState({ ...editingState, promoCode: e.target.value })}
                  className="h-8 text-sm font-mono"
                  placeholder="optional"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">End Date</label>
                <Input
                  type="date"
                  value={editingState.endDate}
                  onChange={(e) => setEditingState({ ...editingState, endDate: e.target.value })}
                  className="h-8 text-sm"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1 text-sm text-gray-600">
              <div>
                <strong>{sale.percentOff}% off</strong>
                {sale.extraDiscount && sale.extraDiscount > 0 && (
                  <span className="text-green-600 ml-1">+ {sale.extraDiscount}% extra</span>
                )}
              </div>
              {sale.promoCode && (
                <div className="font-mono bg-gray-100 px-2 py-0.5 rounded text-xs inline-block">
                  {sale.promoCode}
                </div>
              )}
              <div className="text-gray-400">
                {sale.picksCount} {sale.picksCount === 1 ? 'pick' : 'picks'}
              </div>
              {sale.endDate && (
                <div className="text-gray-400">
                  ends {formatDate(sale.endDate)}
                </div>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            alignItems: 'center'
          }}
        >
          {sale.saleUrl && (
            <a
              href={sale.saleUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: '#6b7280' }}
            >
              <ExternalLink size={16} />
            </a>
          )}

          {isEditing ? (
            <>
              <button
                onClick={(e) => cancelEditing(e)}
                disabled={saving}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#6b7280'
                }}
              >
                <X size={16} />
              </button>
              <button
                onClick={(e) => saveEditing(sale.id, e)}
                disabled={saving}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#000'
                }}
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => startEditing(sale, e)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px',
                  color: '#6b7280'
                }}
              >
                <Edit2 size={16} />
              </button>
              <Switch
                checked={sale.live === 'YES'}
                onCheckedChange={() => handleToggleLive(sale)}
                onClick={(e) => e.stopPropagation()}
              />
            </>
          )}
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
    <div style={{ fontFamily: 'DM Sans, sans-serif' }} className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-4 md:space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Manage Sales</h1>
            <p className="text-gray-600 mt-1 text-sm md:text-base">Edit sales and toggle them on or off</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterType('active')}
            className="text-xs md:text-sm px-2 py-1.5 md:px-4 md:py-2"
            style={{
              fontFamily: 'DM Sans, sans-serif',
              backgroundColor: filterType === 'active' ? '#000' : '#fff',
              color: filterType === 'active' ? '#fff' : '#000',
              border: '1px solid',
              borderColor: filterType === 'active' ? '#000' : '#ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: filterType === 'active' ? 600 : 400,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (filterType !== 'active') {
                e.currentTarget.style.borderColor = '#999';
              }
            }}
            onMouseLeave={(e) => {
              if (filterType !== 'active') {
                e.currentTarget.style.borderColor = '#ddd';
              }
            }}
          >
            Active ({activeSales.length})
          </button>

          <button
            onClick={() => setFilterType('complete')}
            className="text-xs md:text-sm px-2 py-1.5 md:px-4 md:py-2"
            style={{
              fontFamily: 'DM Sans, sans-serif',
              backgroundColor: filterType === 'complete' ? '#000' : '#fff',
              color: filterType === 'complete' ? '#fff' : '#000',
              border: '1px solid',
              borderColor: filterType === 'complete' ? '#000' : '#ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: filterType === 'complete' ? 600 : 400,
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (filterType !== 'complete') {
                e.currentTarget.style.borderColor = '#999';
              }
            }}
            onMouseLeave={(e) => {
              if (filterType !== 'complete') {
                e.currentTarget.style.borderColor = '#ddd';
              }
            }}
          >
            Complete ({completeSales.length})
          </button>
        </div>

        {filteredSales.length === 0 ? (
          <div className="border border-dashed border-border bg-muted/20" style={{ padding: '60px', textAlign: 'center', borderRadius: '8px' }}>
            <p className="text-muted-foreground" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              {filterType === 'active' ? 'No active sales found.' : 'No complete sales found.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSales.map((sale) => renderSaleCard(sale))}
          </div>
        )}
      </div>
    </div>
  );
}
