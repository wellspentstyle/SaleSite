import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Loader2, ExternalLink, Save, X, Edit2, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
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

const API_BASE = '/api';

interface Company {
  id: string;
  pgId?: number;
  name: string;
  type: string;
  priceRange: string;
  category: string;
  maxWomensSize: string;
  values: string[];
  description: string;
  url: string;
  shopmyUrl: string;
}

interface EditingState {
  name: string;
  type: string;
  priceRange: string;
  category: string;
  maxWomensSize: string;
  description: string;
  url: string;
}

export function ManageBrands() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingState, setEditingState] = useState<EditingState>({
    name: '',
    type: '',
    priceRange: '',
    category: '',
    maxWomensSize: '',
    description: '',
    url: ''
  });
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Company | null>(null);
  const [deleting, setDeleting] = useState(false);

  const getAuth = () => localStorage.getItem('adminAuth') || 'dev-mode';

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const response = await fetch(`${API_BASE}/companies`);
      const data = await response.json();
      if (data.success) {
        setCompanies(data.companies || []);
      }
    } catch (error) {
      console.error('Failed to fetch companies:', error);
      toast.error('Failed to load brands');
    } finally {
      setLoading(false);
    }
  };

  const isBrand = (c: Company) => c.type?.toLowerCase() === 'brand';
  const isShop = (c: Company) => c.type?.toLowerCase() === 'shop';
  const hasResearch = (c: Company) => !!(c.description && c.description.trim().length > 10);

  const filterBySearch = (items: Company[]) => 
    items.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.category?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const allBrands = companies.filter(isBrand);
  const allShops = companies.filter(isShop);
  const researchedBrands = filterBySearch(allBrands.filter(hasResearch));
  const unresearchedBrands = filterBySearch(allBrands.filter(c => !hasResearch(c)));
  const shops = filterBySearch(allShops);

  const startEditing = (company: Company) => {
    setEditingId(company.id);
    setEditingState({
      name: company.name || '',
      type: company.type || '',
      priceRange: company.priceRange || '',
      category: company.category || '',
      maxWomensSize: company.maxWomensSize || '',
      description: company.description || '',
      url: company.url || ''
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEditing = async (companyId: string) => {
    setSaving(true);

    try {
      const response = await fetch(`${API_BASE}/admin/companies/${companyId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'auth': getAuth()
        },
        body: JSON.stringify({
          name: editingState.name,
          type: editingState.type,
          price_range: editingState.priceRange,
          category: editingState.category,
          max_womens_size: editingState.maxWomensSize,
          description: editingState.description,
          website: editingState.url
        })
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Brand updated');
        setEditingId(null);
        fetchCompanies();
      } else {
        toast.error(data.message || 'Failed to update brand');
      }
    } catch (error) {
      toast.error('Failed to update brand');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);

    try {
      const response = await fetch(`${API_BASE}/admin/companies/${deleteConfirm.id}`, {
        method: 'DELETE',
        headers: {
          'auth': getAuth()
        }
      });

      const data = await response.json();
      if (data.success) {
        toast.success('Brand deleted');
        setDeleteConfirm(null);
        fetchCompanies();
      } else {
        toast.error(data.message || 'Failed to delete brand');
      }
    } catch (error) {
      toast.error('Failed to delete brand');
    } finally {
      setDeleting(false);
    }
  };

  const renderCompanyRow = (company: Company) => {
    const isEditing = editingId === company.id;

    return (
      <div
        key={company.id}
        className="border border-border bg-white p-4 mb-3"
        style={{ borderRadius: '4px' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Name</label>
                    <Input
                      value={editingState.name}
                      onChange={(e) => setEditingState({ ...editingState, name: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Type</label>
                    <Input
                      value={editingState.type}
                      onChange={(e) => setEditingState({ ...editingState, type: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="Brand, Shop, etc."
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Price Range</label>
                    <Input
                      value={editingState.priceRange}
                      onChange={(e) => setEditingState({ ...editingState, priceRange: e.target.value })}
                      className="h-8 text-sm"
                      placeholder="$, $$, $$$"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Category</label>
                    <Input
                      value={editingState.category}
                      onChange={(e) => setEditingState({ ...editingState, category: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1">Max Size</label>
                    <Input
                      value={editingState.maxWomensSize}
                      onChange={(e) => setEditingState({ ...editingState, maxWomensSize: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Website</label>
                  <Input
                    value={editingState.url}
                    onChange={(e) => setEditingState({ ...editingState, url: e.target.value })}
                    className="h-8 text-sm"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Description</label>
                  <textarea
                    value={editingState.description}
                    onChange={(e) => setEditingState({ ...editingState, description: e.target.value })}
                    className="w-full text-sm p-2 border rounded min-h-[60px]"
                    placeholder="Brand description..."
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <h3 
                    className="font-semibold text-lg truncate"
                    style={{ fontFamily: 'DM Sans, sans-serif' }}
                  >
                    {company.name}
                  </h3>
                  {company.url && (
                    <a
                      href={company.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                  {company.priceRange && <span>{company.priceRange}</span>}
                  {company.category && <span className="text-gray-400">{company.category}</span>}
                  {company.maxWomensSize && (
                    <span className="text-gray-400">Size: {company.maxWomensSize}</span>
                  )}
                </div>
                {company.description && (
                  <p className="text-sm text-gray-500 mt-2 line-clamp-2">{company.description}</p>
                )}
              </>
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
                  onClick={() => saveEditing(company.id)}
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
                  onClick={() => startEditing(company)}
                  title="Edit brand"
                >
                  <Edit2 size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteConfirm(company)}
                  title="Delete brand"
                  className="text-red-500 hover:text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} />
                </Button>
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
        <h1 className="text-2xl font-bold mb-1">Manage Brands</h1>
        <p className="text-gray-600">Edit or delete brands and shops from your directory.</p>
      </div>

      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="researched" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="researched" className="px-4">
            Researched ({researchedBrands.length})
          </TabsTrigger>
          <TabsTrigger value="unresearched" className="px-4">
            Unresearched ({unresearchedBrands.length})
          </TabsTrigger>
          <TabsTrigger value="shops" className="px-4">
            Shops ({shops.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="researched">
          {researchedBrands.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No researched brands found
            </div>
          ) : (
            <div>
              {researchedBrands.map(renderCompanyRow)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="unresearched">
          {unresearchedBrands.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No unresearched brands found
            </div>
          ) : (
            <div>
              {unresearchedBrands.map(renderCompanyRow)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="shops">
          {shops.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No shops found
            </div>
          ) : (
            <div>
              {shops.map(renderCompanyRow)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.type === 'Shop' ? 'Shop' : 'Brand'}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
