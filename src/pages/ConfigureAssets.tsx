import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Progress } from '../components/ui/progress';
import { Loader2, Image, ImagePlus, ArrowLeft, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

interface Pick {
  id: string;
  productName: string;
  imageUrl: string;
  originalPrice: number;
  salePrice: number;
  percentOff: number;
  brand?: string;
}

interface Sale {
  id: string;
  saleName: string;
  percentOff: number;
  company?: string;
}

interface PickConfig {
  pickId: string;
  customCopy: string;
}

interface JobStatus {
  id: number;
  saleId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  total: number;
  currentStep: string;
  results?: any;
  error?: string;
}

export function ConfigureAssets() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  
  const [sale, setSale] = useState<Sale | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeJob, setActiveJob] = useState<JobStatus | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  
  const [generateMainAsset, setGenerateMainAsset] = useState(true);
  const [mainAssetNote, setMainAssetNote] = useState('');
  
  const [selectedStoryPicks, setSelectedStoryPicks] = useState<Set<string>>(new Set());
  const [pickConfigs, setPickConfigs] = useState<Record<string, PickConfig>>({});

  const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

  // Save config to server whenever it changes
  const saveConfig = useCallback(async () => {
    if (!saleId) return;
    
    const config = {
      generateMainAsset,
      mainAssetNote,
      selectedStoryPicks: Array.from(selectedStoryPicks),
      pickConfigs
    };
    
    try {
      await fetch(`${API_BASE}/admin/asset-config/${saleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'auth': auth },
        body: JSON.stringify(config)
      });
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }, [saleId, generateMainAsset, mainAssetNote, selectedStoryPicks, pickConfigs, auth]);

  // Debounced save
  useEffect(() => {
    if (!loading && saleId) {
      const timer = setTimeout(saveConfig, 500);
      return () => clearTimeout(timer);
    }
  }, [generateMainAsset, mainAssetNote, selectedStoryPicks, pickConfigs, loading, saleId, saveConfig]);

  // Poll for job status
  const pollJobStatus = useCallback(async (jobId: number) => {
    try {
      const response = await fetch(`${API_BASE}/admin/asset-jobs/${jobId}`, {
        headers: { 'auth': auth }
      });
      const data = await response.json();
      
      if (data.success && data.job) {
        setActiveJob(data.job);
        
        if (data.job.status === 'completed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          toast.success('Assets generated successfully!');
          navigate('/admin/assets/results');
        } else if (data.job.status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          toast.error(data.job.error || 'Asset generation failed');
          setActiveJob(null);
        }
      }
    } catch (e) {
      console.error('Failed to poll job:', e);
    }
  }, [auth, navigate]);

  // Check for active job on mount
  useEffect(() => {
    if (saleId) {
      const checkActiveJob = async () => {
        try {
          const response = await fetch(`${API_BASE}/admin/asset-jobs/active/${saleId}`, {
            headers: { 'auth': auth }
          });
          const data = await response.json();
          
          if (data.success && data.hasActiveJob) {
            setActiveJob(data.job);
            // Start polling
            pollingRef.current = setInterval(() => pollJobStatus(data.job.id), 1000);
          }
        } catch (e) {
          console.error('Failed to check active job:', e);
        }
      };
      
      checkActiveJob();
    }
    
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [saleId, auth, pollJobStatus]);

  useEffect(() => {
    if (saleId) {
      fetchSaleAndPicks(saleId);
    }
  }, [saleId]);

  const fetchSaleAndPicks = async (id: string) => {
    setLoading(true);

    try {
      const [salesResponse, picksResponse, configResponse] = await Promise.all([
        fetch(`${API_BASE}/admin/sales`, { headers: { 'auth': auth } }),
        fetch(`${API_BASE}/admin/sale/${id}/picks`, { headers: { 'auth': auth } }),
        fetch(`${API_BASE}/admin/asset-config/${id}`, { headers: { 'auth': auth } })
      ]);
      
      const salesData = await salesResponse.json();
      const picksData = await picksResponse.json();
      const configData = await configResponse.json();
      
      if (salesData.success) {
        const foundSale = salesData.sales.find((s: any) => s.id === id);
        if (foundSale) {
          setSale({
            id: foundSale.id,
            saleName: foundSale.saleName,
            percentOff: foundSale.percentOff,
            company: foundSale.company
          });
        }
      }
      
      if (picksData.success) {
        setPicks(picksData.picks || []);
        
        // Initialize pick configs
        const configs: Record<string, PickConfig> = {};
        (picksData.picks || []).forEach((pick: Pick) => {
          configs[pick.id] = { pickId: pick.id, customCopy: '' };
        });
        
        // Restore saved config if exists
        if (configData.success && configData.hasConfig) {
          const saved = configData.config;
          if (saved.generateMainAsset !== undefined) setGenerateMainAsset(saved.generateMainAsset);
          if (saved.mainAssetNote) setMainAssetNote(saved.mainAssetNote);
          if (saved.selectedStoryPicks) setSelectedStoryPicks(new Set(saved.selectedStoryPicks));
          if (saved.pickConfigs) {
            // Merge saved configs with defaults
            Object.keys(saved.pickConfigs).forEach(pickId => {
              if (configs[pickId]) {
                configs[pickId] = saved.pickConfigs[pickId];
              }
            });
          }
        }
        
        setPickConfigs(configs);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Failed to load sale data');
    } finally {
      setLoading(false);
    }
  };

  const toggleStoryPick = (pickId: string) => {
    const newSet = new Set(selectedStoryPicks);
    if (newSet.has(pickId)) {
      newSet.delete(pickId);
    } else {
      newSet.add(pickId);
    }
    setSelectedStoryPicks(newSet);
  };

  const updatePickCopy = (pickId: string, copy: string) => {
    setPickConfigs(prev => ({
      ...prev,
      [pickId]: { ...prev[pickId], customCopy: copy }
    }));
  };

  const handleClear = () => {
    setGenerateMainAsset(true);
    setMainAssetNote('');
    setSelectedStoryPicks(new Set());
    const clearedConfigs: Record<string, PickConfig> = {};
    picks.forEach(pick => {
      clearedConfigs[pick.id] = { pickId: pick.id, customCopy: '' };
    });
    setPickConfigs(clearedConfigs);
    toast.success('Configuration cleared');
  };

  const handleGenerate = async () => {
    console.log('handleGenerate called');
    console.log('sale:', sale);
    if (!sale) {
      console.log('No sale, returning');
      return;
    }

    const hasMainAsset = generateMainAsset;
    const hasStoryPicks = selectedStoryPicks.size > 0;
    console.log('hasMainAsset:', hasMainAsset, 'hasStoryPicks:', hasStoryPicks);

    if (!hasMainAsset && !hasStoryPicks) {
      toast.error('Please select at least one asset to generate');
      return;
    }

    try {
      const requestBody = {
        saleId: sale.id,
        mainAsset: generateMainAsset ? {
          customNote: mainAssetNote || ''
        } : null,
        storyPicks: Array.from(selectedStoryPicks).map(pickId => ({
          pickId,
          customCopy: pickConfigs[pickId]?.customCopy || ''
        }))
      };

      console.log('Making POST request to:', `${API_BASE}/admin/asset-jobs`);
      console.log('Request body:', requestBody);

      const response = await fetch(`${API_BASE}/admin/asset-jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify(requestBody)
      });

      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Response data:', data);

      if (data.success) {
        toast.success('Asset generation started!');
        setActiveJob({
          id: data.jobId,
          saleId: sale.id,
          status: 'pending',
          progress: 0,
          total: (hasMainAsset ? 1 : 0) + selectedStoryPicks.size,
          currentStep: 'Starting...'
        });
        
        // Start polling
        pollingRef.current = setInterval(() => pollJobStatus(data.jobId), 1000);
      } else {
        console.log('Generation failed:', data.message);
        toast.error(data.message || 'Failed to start generation');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Failed to start asset generation');
    }
  };

  if (loading) {
    return (
      <div className="p-8 admin-page">
        <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading sale...</span>
        </div>
      </div>
    );
  }

  if (!sale) {
    return (
      <div className="p-8 admin-page">
        <div className="max-w-4xl mx-auto text-center py-20">
          <p className="text-gray-600">Sale not found</p>
          <Button variant="outline" onClick={() => navigate('/admin/assets')} className="mt-4">
            Back to Assets
          </Button>
        </div>
      </div>
    );
  }

  const isGenerating = activeJob && (activeJob.status === 'pending' || activeJob.status === 'processing');

  return (
    <div className="p-8 admin-page">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/assets')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleClear}
            disabled={isGenerating}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-bold">Configure Assets</h1>
          <p className="text-gray-600 mt-1">
            {sale.saleName} - {sale.percentOff}% Off
          </p>
        </div>

        <section className="space-y-4 bg-white border border-gray-200 p-6 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Image className="h-5 w-5" />
                Main Sale Story (1080x1920)
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Story with brand name and discount percentage
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox 
                checked={generateMainAsset}
                onCheckedChange={(checked) => setGenerateMainAsset(checked === true)}
                disabled={isGenerating}
              />
              <span className="text-sm">Generate</span>
            </label>
          </div>

          {generateMainAsset && (
            <div className="space-y-4 pl-4 border-l-2 border-gray-200">
              <div className="space-y-2">
                <label className="block text-sm font-medium">
                  Custom Note (optional)
                </label>
                <textarea
                  value={mainAssetNote}
                  onChange={(e) => setMainAssetNote(e.target.value)}
                  placeholder="Add a note (e.g. 'Free shipping over $100')"
                  className="w-full p-3 text-sm border border-gray-200 rounded-lg resize-none focus:ring-2 focus:ring-black focus:border-transparent"
                  rows={2}
                  disabled={isGenerating}
                />
                <p className="text-xs text-gray-500">
                  Appears in a black bar near the top of the image
                </p>
              </div>
            </div>
          )}
        </section>

        {picks.length > 0 && (
          <section className="space-y-4 bg-white border border-gray-200 p-6 rounded-lg">
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <ImagePlus className="h-5 w-5" />
                Individual Pick Stories (1080x1920)
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Select picks to generate story images with optional custom copy
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {picks.map((pick) => {
                const isSelected = selectedStoryPicks.has(pick.id);
                return (
                  <div
                    key={pick.id}
                    className={`border-2 rounded-lg overflow-hidden transition-all ${
                      isSelected ? 'border-black' : 'border-gray-200'
                    }`}
                  >
                    <div
                      onClick={() => !isGenerating && toggleStoryPick(pick.id)}
                      className={`cursor-pointer relative ${isGenerating ? 'opacity-50' : ''}`}
                    >
                      <div className="aspect-[9/16] bg-gray-100 relative">
                        <img
                          src={pick.imageUrl}
                          alt={pick.productName}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <div className="absolute bottom-2 left-2 right-2">
                          <p className="text-white text-xs font-medium truncate">{pick.productName}</p>
                          <p className="text-white/80 text-xs">${pick.salePrice} vs. ${pick.originalPrice}</p>
                        </div>
                      </div>
                      <div className="absolute top-2 left-2">
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'bg-black border-black text-white' : 'bg-white border-gray-300'
                        }`}>
                          {isSelected && '✓'}
                        </div>
                      </div>
                    </div>
                    
                    {isSelected && (
                      <div className="p-3 bg-gray-50 border-t">
                        <label className="block">
                          <span className="text-xs font-medium text-gray-700">Custom Copy (optional)</span>
                          <textarea
                            value={pickConfigs[pick.id]?.customCopy || ''}
                            onChange={(e) => updatePickCopy(pick.id, e.target.value)}
                            placeholder="e.g. 'My favorite find!' or 'Perfect for summer'"
                            className="mt-1 w-full text-sm p-2 border border-gray-200 rounded resize-none"
                            rows={2}
                            disabled={isGenerating}
                          />
                          <span className="text-xs text-gray-400">
                            Appears in top-right corner
                          </span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="bg-gray-50 border border-gray-200 p-6 rounded-lg sticky bottom-4 space-y-4">
          {isGenerating && activeJob ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {activeJob.currentStep}
                </span>
                <span className="text-sm text-gray-500">{activeJob.progress}/{activeJob.total}</span>
              </div>
              <Progress value={(activeJob.progress / activeJob.total) * 100} className="h-2" />
              <p className="text-xs text-gray-500">
                Generation continues in the background - you can navigate away and come back
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {generateMainAsset && '1 main asset'}
                {generateMainAsset && selectedStoryPicks.size > 0 && ' + '}
                {selectedStoryPicks.size > 0 && `${selectedStoryPicks.size} story${selectedStoryPicks.size > 1 ? ' images' : ' image'}`}
                {!generateMainAsset && selectedStoryPicks.size === 0 && 'No assets selected'}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => navigate('/admin/assets')}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={!generateMainAsset && selectedStoryPicks.size === 0}
                >
                  Generate Assets
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
