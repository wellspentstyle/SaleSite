import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Loader2, Image, ImagePlus, Instagram, Send } from 'lucide-react';
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
}

interface PickConfig {
  pickId: string;
  customCopy: string;
}

interface AssetConfiguratorProps {
  sale: Sale | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssetsGenerated: () => void;
}

export function AssetConfigurator({ sale, open, onOpenChange, onAssetsGenerated }: AssetConfiguratorProps) {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  
  const [mainAssetType, setMainAssetType] = useState<'without-picks' | 'with-picks'>('without-picks');
  const [selectedMainPicks, setSelectedMainPicks] = useState<Set<string>>(new Set());
  const [generateMainAsset, setGenerateMainAsset] = useState(true);
  
  const [selectedStoryPicks, setSelectedStoryPicks] = useState<Set<string>>(new Set());
  const [pickConfigs, setPickConfigs] = useState<Record<string, PickConfig>>({});
  
  const [postToInstagram, setPostToInstagram] = useState(false);
  const [postMainToFeed, setPostMainToFeed] = useState(true);
  const [postStoriesToIG, setPostStoriesToIG] = useState(true);
  const [caption, setCaption] = useState('');

  useEffect(() => {
    if (sale && open) {
      fetchPicks(sale.id);
    }
  }, [sale, open]);

  useEffect(() => {
    if (picks.length > 0 && selectedMainPicks.size === 0) {
      const firstThree = picks.slice(0, 3).map(p => p.id);
      setSelectedMainPicks(new Set(firstThree));
    }
  }, [picks]);

  const fetchPicks = async (saleId: string) => {
    setLoading(true);
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

    try {
      const response = await fetch(`${API_BASE}/admin/sale/${saleId}/picks`, {
        headers: { 'auth': auth }
      });
      const data = await response.json();
      if (data.success) {
        setPicks(data.picks || []);
        
        const configs: Record<string, PickConfig> = {};
        (data.picks || []).forEach((pick: Pick) => {
          configs[pick.id] = { pickId: pick.id, customCopy: '' };
        });
        setPickConfigs(configs);
      }
    } catch (error) {
      console.error('Failed to fetch picks:', error);
      toast.error('Failed to load picks');
    } finally {
      setLoading(false);
    }
  };

  const toggleMainPick = (pickId: string) => {
    const newSet = new Set(selectedMainPicks);
    if (newSet.has(pickId)) {
      newSet.delete(pickId);
    } else {
      if (newSet.size < 3) {
        newSet.add(pickId);
      } else {
        toast.error('Maximum 3 picks for main asset');
      }
    }
    setSelectedMainPicks(newSet);
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
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

    try {
      const requestBody: any = {
        saleId: sale.id,
        mainAsset: generateMainAsset ? {
          type: mainAssetType,
          pickIds: mainAssetType === 'with-picks' ? Array.from(selectedMainPicks) : []
        } : null,
        storyPicks: Array.from(selectedStoryPicks).map(pickId => ({
          pickId,
          customCopy: pickConfigs[pickId]?.customCopy || ''
        }))
      };

      let endpoint = `${API_BASE}/admin/generate-custom-assets`;
      
      if (postToInstagram) {
        endpoint = `${API_BASE}/admin/generate-and-post`;
        requestBody.caption = caption;
        requestBody.postMainAsset = postMainToFeed && generateMainAsset;
        requestBody.postStories = postStoriesToIG && selectedStoryPicks.size > 0;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      if (data.success) {
        if (postToInstagram) {
          const postedCount = data.results?.filter((r: any) => r.posted).length || 0;
          toast.success(`${data.message} - Posted ${postedCount} to Instagram!`);
        } else {
          toast.success(data.message || 'Assets generated successfully!');
        }
        onAssetsGenerated();
        onOpenChange(false);
      } else {
        toast.error(data.message || 'Failed to generate assets');
      }
    } catch (error) {
      console.error('Generation error:', error);
      toast.error('Failed to generate assets');
    } finally {
      setGenerating(false);
    }
  };

  const resetState = () => {
    setPicks([]);
    setSelectedMainPicks(new Set());
    setSelectedStoryPicks(new Set());
    setPickConfigs({});
    setMainAssetType('without-picks');
    setGenerateMainAsset(true);
    setPostToInstagram(false);
    setPostMainToFeed(true);
    setPostStoriesToIG(true);
    setCaption('');
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      resetState();
    }
    onOpenChange(open);
  };

  if (!sale) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Configure Assets: {sale.saleName}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading picks...</span>
          </div>
        ) : (
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Image className="h-5 w-5" />
                    Main Sale Image (1080x1350)
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Feed post with brand name and discount
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
                  <div className="flex gap-3">
                    <button
                      onClick={() => setMainAssetType('without-picks')}
                      className={`flex-1 p-4 border-2 rounded-lg transition-all ${
                        mainAssetType === 'without-picks'
                          ? 'border-black bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">Without Picks</div>
                      <div className="text-sm text-gray-500 mt-1">
                        Header only with brand name
                      </div>
                    </button>
                    <button
                      onClick={() => picks.length > 0 && setMainAssetType('with-picks')}
                      disabled={picks.length === 0}
                      className={`flex-1 p-4 border-2 rounded-lg transition-all ${
                        picks.length === 0 
                          ? 'opacity-50 cursor-not-allowed border-gray-200'
                          : mainAssetType === 'with-picks'
                            ? 'border-black bg-gray-50'
                            : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="font-medium">With Picks</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {picks.length === 0 ? 'No picks available' : 'Header + product images below'}
                      </div>
                    </button>
                  </div>

                  {mainAssetType === 'with-picks' && picks.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        Select up to 3 picks to feature ({selectedMainPicks.size}/3):
                      </p>
                      <div className="grid grid-cols-3 gap-3">
                        {picks.map((pick) => (
                          <div
                            key={pick.id}
                            onClick={() => toggleMainPick(pick.id)}
                            className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                              selectedMainPicks.has(pick.id)
                                ? 'border-black ring-2 ring-black ring-offset-1'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <div className="aspect-square bg-gray-100">
                              <img
                                src={pick.imageUrl}
                                alt={pick.productName}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="p-2">
                              <p className="text-xs font-medium truncate">{pick.productName}</p>
                              <p className="text-xs text-gray-500">${pick.salePrice}</p>
                            </div>
                            {selectedMainPicks.has(pick.id) && (
                              <div className="absolute top-2 right-2 bg-black text-white w-5 h-5 rounded-full flex items-center justify-center text-xs">
                                ✓
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {picks.length > 0 && (
              <>
                <div className="border-t border-gray-200" />

                <section className="space-y-4">
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
              </>
            )}

            <div className="border-t border-gray-200" />

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg flex items-center gap-2">
                    <Instagram className="h-5 w-5" />
                    Post to Instagram
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Automatically post generated assets to Instagram
                  </p>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox 
                    checked={postToInstagram}
                    onCheckedChange={(checked) => setPostToInstagram(checked === true)}
                  />
                  <span className="text-sm">Enable</span>
                </label>
              </div>

              {postToInstagram && (
                <div className="space-y-4 pl-4 border-l-2 border-pink-200 bg-pink-50/30 p-4 rounded-r-lg">
                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox 
                        checked={postMainToFeed}
                        onCheckedChange={(checked) => setPostMainToFeed(checked === true)}
                        disabled={!generateMainAsset}
                      />
                      <span className={`text-sm ${!generateMainAsset ? 'text-gray-400' : ''}`}>
                        Post main image to feed
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox 
                        checked={postStoriesToIG}
                        onCheckedChange={(checked) => setPostStoriesToIG(checked === true)}
                        disabled={selectedStoryPicks.size === 0}
                      />
                      <span className={`text-sm ${selectedStoryPicks.size === 0 ? 'text-gray-400' : ''}`}>
                        Post stories
                      </span>
                    </label>
                  </div>
                  
                  {postMainToFeed && generateMainAsset && (
                    <div>
                      <label className="block">
                        <span className="text-sm font-medium text-gray-700">Caption for Feed Post</span>
                        <textarea
                          value={caption}
                          onChange={(e) => setCaption(e.target.value)}
                          placeholder={`${sale?.saleName} - ${sale?.percentOff}% off!\n\n#designersale #fashion #sale`}
                          className="mt-1 w-full text-sm p-3 border border-gray-200 rounded-lg resize-none"
                          rows={4}
                        />
                        <span className="text-xs text-gray-400">
                          Include hashtags for better reach
                        </span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </section>

            <div className="border-t pt-4 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {generateMainAsset && '1 main asset'}
                {generateMainAsset && selectedStoryPicks.size > 0 && ' + '}
                {selectedStoryPicks.size > 0 && `${selectedStoryPicks.size} story${selectedStoryPicks.size > 1 ? ' images' : ' image'}`}
                {postToInstagram && (
                  <span className="ml-2 text-pink-600">
                    → posting to Instagram
                  </span>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleClose(false)}
                  disabled={generating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={generating || (!generateMainAsset && selectedStoryPicks.size === 0)}
                  className={postToInstagram ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600' : ''}
                >
                  {generating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {postToInstagram ? 'Generating & Posting...' : 'Generating...'}
                    </>
                  ) : (
                    <>
                      {postToInstagram && <Send className="mr-2 h-4 w-4" />}
                      {postToInstagram ? 'Generate & Post' : 'Generate Assets'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
