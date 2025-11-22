import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Loader2, RefreshCw, XCircle, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

interface Pick {
  id: string;
  name: string;
  url: string;
  imageUrl: string;
  originalPrice: number;
  salePrice: number;
  percentOff: number;
  saleIds: string[];
  company: string[];
  availabilityStatus: 'In Stock' | 'Low' | 'Sold Out' | 'Unknown';
  lastValidatedAt?: string;
  nextCheckDue?: string;
  hiddenUntilFresh: boolean;
  isActivelyDisplayed: boolean;
}

export function Freshness() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [filteredPicks, setFilteredPicks] = useState<Pick[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedPicks, setSelectedPicks] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [displayFilter, setDisplayFilter] = useState<string>('all');
  const [freshnessFilter, setFreshnessFilter] = useState<string>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    fetchPicks();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [picks, statusFilter, displayFilter, freshnessFilter]);

  const fetchPicks = async () => {
    setIsLoading(true);
    try {
      const auth = sessionStorage.getItem('adminAuth') || '';
      const response = await fetch(`${API_BASE}/admin/picks`, {
        headers: { 'auth': auth }
      });

      const data = await response.json();
      if (data.success) {
        setPicks(data.picks);
      } else {
        toast.error('Failed to fetch picks');
      }
    } catch (error) {
      toast.error('Error fetching picks');
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...picks];

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.availabilityStatus === statusFilter);
    }

    // Display filter
    if (displayFilter === 'active') {
      filtered = filtered.filter(p => p.isActivelyDisplayed);
    } else if (displayFilter === 'inactive') {
      filtered = filtered.filter(p => !p.isActivelyDisplayed);
    }

    // Freshness filter
    if (freshnessFilter === 'stale') {
      filtered = filtered.filter(p => {
        if (!p.lastValidatedAt) return true;
        const lastValidated = new Date(p.lastValidatedAt);
        const daysSince = (new Date().getTime() - lastValidated.getTime()) / (1000 * 60 * 60 * 24);
        return daysSince > 14;
      });
    } else if (freshnessFilter === 'overdue') {
      filtered = filtered.filter(p => {
        if (!p.nextCheckDue) return false;
        return new Date(p.nextCheckDue) < new Date();
      });
    }

    setFilteredPicks(filtered);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPicks(new Set(filteredPicks.map(p => p.id)));
    } else {
      setSelectedPicks(new Set());
    }
  };

  const handleSelectPick = (pickId: string, checked: boolean) => {
    const newSelected = new Set(selectedPicks);
    if (checked) {
      newSelected.add(pickId);
    } else {
      newSelected.delete(pickId);
    }
    setSelectedPicks(newSelected);
  };

  const handleRefreshSelected = async () => {
    if (selectedPicks.size === 0) {
      toast.error('Please select picks to refresh');
      return;
    }

    setIsRefreshing(true);
    try {
      const auth = sessionStorage.getItem('adminAuth') || '';
      const response = await fetch(`${API_BASE}/admin/picks/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify({ pickIds: Array.from(selectedPicks) })
      });

      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        await fetchPicks();
        setSelectedPicks(new Set());
      } else {
        toast.error('Failed to refresh picks');
      }
    } catch (error) {
      toast.error('Error refreshing picks');
      console.error(error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleMarkSoldOut = async () => {
    if (selectedPicks.size === 0) {
      toast.error('Please select picks to mark as sold out');
      return;
    }

    setIsRefreshing(true);
    try {
      const auth = sessionStorage.getItem('adminAuth') || '';
      const response = await fetch(`${API_BASE}/admin/picks/mark-sold-out`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify({ pickIds: Array.from(selectedPicks) })
      });

      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        await fetchPicks();
        setSelectedPicks(new Set());
      } else {
        toast.error('Failed to mark picks as sold out');
      }
    } catch (error) {
      toast.error('Error marking picks as sold out');
      console.error(error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleNightlyCheck = async () => {
    setIsRefreshing(true);
    toast.info('Running nightly freshness check...');
    try {
      const auth = sessionStorage.getItem('adminAuth') || '';
      const response = await fetch(`${API_BASE}/admin/picks/nightly-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        }
      });

      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        await fetchPicks();
      } else {
        toast.error('Nightly check failed');
      }
    } catch (error) {
      toast.error('Error running nightly check');
      console.error(error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStatusBadge = (status: 'In Stock' | 'Low' | 'Sold Out' | 'Unknown') => {
    const styles: Record<string, string> = {
      'In Stock': 'bg-green-100 text-green-800 border-green-200',
      'Low': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'Sold Out': 'bg-red-100 text-red-800 border-red-200',
      'Unknown': 'bg-gray-100 text-gray-800 border-gray-200'
    };
    const icons: Record<string, JSX.Element> = {
      'In Stock': <CheckCircle2 className="w-3 h-3" />,
      'Low': <AlertCircle className="w-3 h-3" />,
      'Sold Out': <XCircle className="w-3 h-3" />,
      'Unknown': <AlertCircle className="w-3 h-3" />
    };
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${styles[status]}`}>
        {icons[status]}
        {status}
      </span>
    );
  };

  const getDaysSinceValidation = (lastValidatedAt?: string) => {
    if (!lastValidatedAt) return null;
    const days = Math.floor((new Date().getTime() - new Date(lastValidatedAt).getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const isOverdue = (nextCheckDue?: string) => {
    if (!nextCheckDue) return false;
    return new Date(nextCheckDue) < new Date();
  };

  // Calculate stats
  const stats = {
    total: picks.length,
    inStock: picks.filter(p => p.availabilityStatus === 'In Stock').length,
    low: picks.filter(p => p.availabilityStatus === 'Low').length,
    soldOut: picks.filter(p => p.availabilityStatus === 'Sold Out').length,
    unknown: picks.filter(p => p.availabilityStatus === 'Unknown').length,
    active: picks.filter(p => p.isActivelyDisplayed).length,
    stale: picks.filter(p => {
      if (!p.lastValidatedAt) return true;
      const days = getDaysSinceValidation(p.lastValidatedAt);
      return days !== null && days > 14;
    }).length,
    overdue: picks.filter(p => isOverdue(p.nextCheckDue)).length
  };

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Freshness Tracking</h1>
            <p className="text-gray-600 mt-1">Manage product availability and freshness</p>
          </div>
          <Button onClick={handleNightlyCheck} disabled={isRefreshing}>
            {isRefreshing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Calendar className="w-4 h-4 mr-2" />
            )}
            Run Nightly Check
          </Button>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <div className="bg-white p-4 rounded-lg border">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-gray-600">Total Picks</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <div className="text-2xl font-bold text-green-700">{stats.inStock}</div>
            <div className="text-xs text-green-600">In Stock</div>
          </div>
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <div className="text-2xl font-bold text-yellow-700">{stats.low}</div>
            <div className="text-xs text-yellow-600">Low Stock</div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="text-2xl font-bold text-red-700">{stats.soldOut}</div>
            <div className="text-xs text-red-600">Sold Out</div>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="text-2xl font-bold text-gray-700">{stats.unknown}</div>
            <div className="text-xs text-gray-600">Unknown</div>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="text-2xl font-bold text-blue-700">{stats.active}</div>
            <div className="text-xs text-blue-600">Active Sales</div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
            <div className="text-2xl font-bold text-orange-700">{stats.stale}</div>
            <div className="text-xs text-orange-600">Stale (&gt;14d)</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
            <div className="text-2xl font-bold text-purple-700">{stats.overdue}</div>
            <div className="text-xs text-purple-600">Overdue</div>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="bg-white p-6 rounded-lg border space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="In Stock">In Stock</SelectItem>
                  <SelectItem value="Low">Low Stock</SelectItem>
                  <SelectItem value="Sold Out">Sold Out</SelectItem>
                  <SelectItem value="Unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Display Status</Label>
              <Select value={displayFilter} onValueChange={setDisplayFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Picks</SelectItem>
                  <SelectItem value="active">Active Sales Only</SelectItem>
                  <SelectItem value="inactive">Inactive Sales Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Freshness</Label>
              <Select value={freshnessFilter} onValueChange={setFreshnessFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="stale">Stale (&gt;14 days)</SelectItem>
                  <SelectItem value="overdue">Overdue for Check</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-4 border-t">
            <Button 
              onClick={handleRefreshSelected} 
              disabled={selectedPicks.size === 0 || isRefreshing}
              variant="outline"
            >
              {isRefreshing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh Selected ({selectedPicks.size})
            </Button>
            <Button 
              onClick={handleMarkSoldOut} 
              disabled={selectedPicks.size === 0 || isRefreshing}
              variant="outline"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Mark Sold Out ({selectedPicks.size})
            </Button>
            <div className="ml-auto text-sm text-gray-600">
              Showing {filteredPicks.length} of {picks.length} picks
            </div>
          </div>
        </div>

        {/* Picks Table */}
        <div className="bg-white rounded-lg border">
          {isLoading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-gray-400" />
              <p className="text-gray-600 mt-2">Loading picks...</p>
            </div>
          ) : filteredPicks.length === 0 ? (
            <div className="p-12 text-center text-gray-600">
              No picks match the current filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <Checkbox
                        checked={selectedPicks.size === filteredPicks.length && filteredPicks.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Last Checked</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Next Check</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Display</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPicks.map((pick) => {
                    const daysSince = getDaysSinceValidation(pick.lastValidatedAt);
                    const overdue = isOverdue(pick.nextCheckDue);
                    
                    return (
                      <tr key={pick.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={selectedPicks.has(pick.id)}
                            onCheckedChange={(checked) => handleSelectPick(pick.id, checked as boolean)}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {pick.imageUrl && (
                              <img 
                                src={pick.imageUrl} 
                                alt={pick.name} 
                                className="w-12 h-12 object-cover rounded"
                              />
                            )}
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{pick.name}</div>
                              <div className="text-xs text-gray-500 truncate">{pick.company.join(', ')}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(pick.availabilityStatus)}
                        </td>
                        <td className="px-4 py-3">
                          {pick.lastValidatedAt ? (
                            <div>
                              <div className="text-sm">{pick.lastValidatedAt}</div>
                              <div className={`text-xs ${daysSince && daysSince > 14 ? 'text-orange-600 font-medium' : 'text-gray-500'}`}>
                                {daysSince !== null ? `${daysSince} days ago` : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">Never</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {pick.nextCheckDue ? (
                            <div className={overdue ? 'text-red-600 font-medium' : ''}>
                              <div className="text-sm">{pick.nextCheckDue}</div>
                              {overdue && <div className="text-xs">Overdue!</div>}
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">Not set</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {pick.isActivelyDisplayed ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                              Inactive
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
