import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Progress } from '../components/ui/progress';
import { Loader2, Image, ImagePlus, ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
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

interface GenerationProgress {
  current: number;
  total: number;
  message: string;
  completedSteps: { type: string; success: boolean }[];
}

export function ConfigureAssets() {
  const { saleId } = useParams<{ saleId: string }>();
  const navigate = useNavigate();
  
  const [sale, setSale] = useState<Sale | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  
  const [generateMainAsset, setGenerateMainAsset] = useState(true);
  const [mainAssetNote, setMainAssetNote] = useState('');
  
  const [selectedStoryPicks, setSelectedStoryPicks] = useState<Set<string>>(new Set());
  const [pickConfigs, setPickConfigs] = useState<Record<string, PickConfig>>({});

  useEffect(() => {
    if (saleId) {
      fetchSaleAndPicks(saleId);
    }
  }, [saleId]);

  const fetchSaleAndPicks = async (id: string) => {
    setLoading(true);
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

    try {
      const [salesResponse, picksResponse] = await Promise.all([
        fetch(`${API_BASE}/admin/sales`, { headers: { 'auth': auth } }),
        fetch(`${API_BASE}/admin/sale/${id}/picks`, { headers: { 'auth': auth } })
      ]);
      
      const salesData = await salesResponse.json();
      const picksData = await picksResponse.json();
      
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
        
        const configs: Record<string, PickConfig> = {};
        (picksData.picks || []).forEach((pick: Pick) => {
          configs[pick.id] = { pickId: pick.id, customCopy: '' };
        });
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

  const handleGenerate = async () => {
    if (!sale) return;

    const hasMainAsset = generateMainAsset;
    const hasStoryPicks = selectedStoryPicks.size > 0;

    if (!hasMainAsset && !hasStoryPicks) {
      toast.error('Please select at least one asset to generate');
      return;
    }

    setGenerating(true);
    setProgress({ current: 0, total: (hasMainAsset ? 1 : 0) + selectedStoryPicks.size, message: 'Starting...', completedSteps: [] });
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

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

      const response = await fetch(`${API_BASE}/admin/generate-custom-assets-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify(requestBody)
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      const completedSteps: { type: string; success: boolean }[] = [];

      if (!reader) {
        throw new Error('Stream not available');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            
            if (data.type === 'start' || data.type === 'progress') {
              setProgress(prev => ({
                ...prev!,
                current: data.current,
                total: data.total,
                message: data.message
              }));
            } else if (data.type === 'step_complete') {
              completedSteps.push({ type: data.stepType, success: data.success });
              setProgress(prev => ({
                ...prev!,
                completedSteps: [...completedSteps]
              }));
            } else if (data.type === 'complete') {
              sessionStorage.setItem('assetResults', JSON.stringify({
                saleName: data.saleName,
                saleId: data.saleId,
                results: data.results,
                generatedAt: new Date().toISOString()
              }));
              setGenerating(false);
              setProgress(null);
              navigate('/admin/assets/results');
              return;
            } else if (data.type === 'error') {
              toast.error(data.message || 'Failed to generate assets');
              setGenerating(false);
              setProgress(null);
              return;
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Failed to generate assets');
      setGenerating(false);
      setProgress(null);
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

  return (
    <div className="p-8 admin-page">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/assets')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
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
                />
                <p className="text-xs text-gray-500">
                  Appears in a black bar at the bottom-left of the image
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
                      onClick={() => toggleStoryPick(pick.id)}
                      className="cursor-pointer relative"
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
          {generating && progress ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{progress.message}</span>
                <span className="text-sm text-gray-500">{progress.current}/{progress.total}</span>
              </div>
              <Progress value={(progress.current / progress.total) * 100} className="h-2" />
              {progress.completedSteps.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {progress.completedSteps.map((step, idx) => (
                    <div 
                      key={idx}
                      className={`flex items-center gap-1 text-xs px-2 py-1 rounded ${
                        step.success 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {step.success ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      <span>{step.type === 'main' ? 'Main Story' : 'Pick Story'}</span>
                    </div>
                  ))}
                </div>
              )}
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
                  disabled={generating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generating || (!generateMainAsset && selectedStoryPicks.size === 0)}
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
