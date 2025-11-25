import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
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
import { Loader2, ArrowLeft, Download, Instagram, ExternalLink, Check, X, AlertTriangle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = '/api';

interface AssetResult {
  type: 'main' | 'story';
  success: boolean;
  pickId?: string;
  filename?: string;
  driveFileId?: string;
  driveUrl?: string;
  error?: string;
  posted?: boolean;
  postId?: string;
}

interface ResultsData {
  saleName: string;
  saleId: string;
  results: AssetResult[];
  generatedAt: string;
}

const isDevelopment = window.location.hostname.includes('replit.dev') || 
                       window.location.hostname === 'localhost' ||
                       window.location.hostname.includes('.dev.');

export function AssetResults() {
  const navigate = useNavigate();
  const [resultsData, setResultsData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Set<number>>(new Set());
  const [caption, setCaption] = useState('');
  const [postToFeed, setPostToFeed] = useState(true);
  const [postStories, setPostStories] = useState(true);
  const [showDevWarning, setShowDevWarning] = useState(false);

  useEffect(() => {
    const loadAssets = async () => {
      const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';
      
      // Always load from database - assets are persisted there
      try {
        const response = await fetch(`${API_BASE}/admin/generated-assets`, {
          headers: { 'auth': auth }
        });
        const data = await response.json();
        
        if (data.success && data.hasAssets) {
          const resultsWithType = data.results.map((r: AssetResult) => ({
            ...r,
            type: r.type === 'main' ? 'main' : 'story'
          }));
          
          const formattedData: ResultsData = {
            saleName: data.saleName,
            saleId: data.saleId,
            results: resultsWithType,
            generatedAt: data.generatedAt
          };
          
          setResultsData(formattedData);
          
          const successfulIndices = new Set<number>();
          formattedData.results.forEach((r, i) => {
            if (r.success) successfulIndices.add(i);
          });
          setSelectedAssets(successfulIndices);
          setCaption(`${data.saleName} - check out these deals!\n\n#designersale #fashion #sale`);
        } else {
          // No assets found, redirect
          navigate('/admin/assets');
        }
      } catch (error) {
        console.error('Failed to load assets:', error);
        navigate('/admin/assets');
      }
      
      setLoading(false);
    };
    
    loadAssets();
  }, [navigate]);

  const toggleAsset = (index: number) => {
    const newSet = new Set(selectedAssets);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedAssets(newSet);
  };

  const getThumbnailUrl = (driveUrl: string) => {
    const fileId = driveUrl.match(/\/d\/([^\/]+)/)?.[1];
    // Use Google Drive's thumbnail API for better CORS compatibility
    return fileId ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w500` : driveUrl;
  };

  const getDirectDownloadUrl = (driveUrl: string) => {
    const fileId = driveUrl.match(/\/d\/([^\/]+)/)?.[1];
    return fileId ? `https://drive.google.com/uc?export=download&id=${fileId}` : driveUrl;
  };

  const initiatePostToInstagram = () => {
    if (!resultsData) return;
    
    const selectedResults = resultsData.results.filter((_, i) => selectedAssets.has(i) && resultsData.results[i].success);
    
    if (selectedResults.length === 0) {
      toast.error('No assets selected for posting');
      return;
    }

    if (isDevelopment) {
      setShowDevWarning(true);
      return;
    }

    handlePostToInstagram();
  };

  const handlePostToInstagram = async () => {
    if (!resultsData) return;
    setShowDevWarning(false);
    
    const selectedResults = resultsData.results.filter((_, i) => selectedAssets.has(i) && resultsData.results[i].success);
    
    if (selectedResults.length === 0) {
      toast.error('No assets selected for posting');
      return;
    }

    setPosting(true);
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';

    try {
      const mainAsset = selectedResults.find(r => r.type === 'main');
      const storyAssets = selectedResults.filter(r => r.type === 'story');

      let postedCount = 0;
      const errors: string[] = [];

      if (mainAsset && postToFeed && mainAsset.driveUrl) {
        try {
          const response = await fetch(`${API_BASE}/admin/instagram/post`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'auth': auth
            },
            body: JSON.stringify({
              imageUrl: getDirectDownloadUrl(mainAsset.driveUrl),
              caption,
              isStory: false
            })
          });
          const data = await response.json();
          if (data.success) {
            postedCount++;
          } else {
            errors.push(`Feed post: ${data.error || 'Failed'}`);
          }
        } catch (error) {
          errors.push('Feed post failed');
        }
      }

      if (postStories && storyAssets.length > 0) {
        for (const story of storyAssets) {
          if (story.driveUrl) {
            try {
              const response = await fetch(`${API_BASE}/admin/instagram/post`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'auth': auth
                },
                body: JSON.stringify({
                  imageUrl: getDirectDownloadUrl(story.driveUrl),
                  isStory: true
                })
              });
              const data = await response.json();
              if (data.success) {
                postedCount++;
              } else {
                errors.push(`Story: ${data.error || 'Failed'}`);
              }
            } catch (error) {
              errors.push('Story post failed');
            }
          }
        }
      }

      if (postedCount > 0) {
        toast.success(`Posted ${postedCount} asset${postedCount > 1 ? 's' : ''} to Instagram!`);
      }
      if (errors.length > 0) {
        toast.error(errors.join(', '));
      }
    } catch (error) {
      console.error('Instagram posting error:', error);
      toast.error('Failed to post to Instagram');
    } finally {
      setPosting(false);
    }
  };

  const handleClearAssets = async () => {
    if (!resultsData) return;
    
    const auth = sessionStorage.getItem('adminAuth') || 'dev-mode';
    try {
      await fetch(`${API_BASE}/admin/generated-assets/${resultsData.saleId}`, {
        method: 'DELETE',
        headers: { 'auth': auth }
      });
      toast.success('Assets cleared');
      navigate('/admin/assets');
    } catch (error) {
      toast.error('Failed to clear assets');
    }
  };

  if (loading || !resultsData) {
    return (
      <div className="p-8 admin-page">
        <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading assets...</span>
        </div>
      </div>
    );
  }

  const successfulAssets = resultsData.results.filter(r => r.success);
  const failedAssets = resultsData.results.filter(r => !r.success);
  const mainAsset = resultsData.results.find(r => r.type === 'main' && r.success);
  const storyAssets = resultsData.results.filter(r => r.type === 'story' && r.success);
  
  const selectedMain = mainAsset && selectedAssets.has(resultsData.results.indexOf(mainAsset));
  const selectedStoryCount = storyAssets.filter(s => selectedAssets.has(resultsData.results.indexOf(s))).length;

  return (
    <div className="p-8 admin-page">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/assets')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Assets
          </Button>
        </div>

        <div>
          <h1 className="text-3xl font-bold">Generated Assets</h1>
          <p className="text-gray-600 mt-1">
            {resultsData.saleName} - {successfulAssets.length} asset{successfulAssets.length !== 1 ? 's' : ''} generated
          </p>
        </div>

        {failedAssets.length > 0 && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
            <h3 className="font-medium text-red-800 flex items-center gap-2">
              <X className="h-4 w-4" />
              {failedAssets.length} asset{failedAssets.length !== 1 ? 's' : ''} failed to generate
            </h3>
            <ul className="mt-2 text-sm text-red-700 space-y-1">
              {failedAssets.map((asset, i) => (
                <li key={i}>{asset.type === 'main' ? 'Main image' : `Story (${asset.pickId})`}: {asset.error}</li>
              ))}
            </ul>
          </div>
        )}

        {successfulAssets.length > 0 && (
          <>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Select assets to post or download</h2>
              
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {resultsData.results.map((asset, index) => {
                  if (!asset.success) return null;
                  const isSelected = selectedAssets.has(index);
                  
                  return (
                    <div
                      key={index}
                      onClick={() => toggleAsset(index)}
                      className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                        isSelected
                          ? 'border-black ring-2 ring-black ring-offset-1'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="bg-gray-100 aspect-[9/16]">
                        {asset.driveUrl && (
                          <img
                            src={getThumbnailUrl(asset.driveUrl)}
                            alt={asset.filename || 'Generated asset'}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23f3f4f6" width="100" height="100"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12">Preview unavailable</text></svg>';
                            }}
                          />
                        )}
                      </div>
                      
                      <div className="absolute top-2 left-2">
                        <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'bg-black border-black text-white' : 'bg-white border-gray-300'
                        }`}>
                          {isSelected && <Check className="h-4 w-4" />}
                        </div>
                      </div>
                      
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                        <span className="text-white text-xs font-medium">
                          {asset.type === 'main' ? 'Main Image (1080x1350)' : 'Story (1080x1920)'}
                        </span>
                      </div>
                      
                      <a
                        href={asset.driveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-2 right-2 bg-white/90 hover:bg-white p-1.5 rounded-full transition-colors"
                      >
                        <ExternalLink className="h-4 w-4 text-gray-700" />
                      </a>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="bg-white border border-gray-200 p-6 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg flex items-center gap-2">
                  <Instagram className="h-5 w-5" />
                  Post to Instagram
                  {isDevelopment && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      DEV MODE
                    </span>
                  )}
                </h3>
                <span className="text-sm text-gray-500">
                  {selectedAssets.size} selected
                </span>
              </div>

              <div className="flex gap-6">
                {mainAsset && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox 
                      checked={postToFeed}
                      onCheckedChange={(checked) => setPostToFeed(checked === true)}
                      disabled={!selectedMain}
                    />
                    <span className={`text-sm ${!selectedMain ? 'text-gray-400' : ''}`}>
                      Post main image to feed
                    </span>
                  </label>
                )}
                {storyAssets.length > 0 && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox 
                      checked={postStories}
                      onCheckedChange={(checked) => setPostStories(checked === true)}
                      disabled={selectedStoryCount === 0}
                    />
                    <span className={`text-sm ${selectedStoryCount === 0 ? 'text-gray-400' : ''}`}>
                      Post {selectedStoryCount} story{selectedStoryCount !== 1 ? ' images' : ''} to stories
                    </span>
                  </label>
                )}
              </div>

              {postToFeed && selectedMain && (
                <div>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Caption for Feed Post</span>
                    <textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      placeholder="Enter your caption with hashtags..."
                      className="mt-1 w-full text-sm p-3 border border-gray-200 rounded-lg resize-none"
                      rows={4}
                    />
                  </label>
                </div>
              )}

              <Button
                onClick={initiatePostToInstagram}
                disabled={posting || selectedAssets.size === 0 || (!postToFeed && !postStories)}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                {posting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <Instagram className="mr-2 h-4 w-4" />
                    Post to Instagram
                  </>
                )}
              </Button>
            </section>

            <section className="bg-gray-50 border border-gray-200 p-6 rounded-lg space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Download className="h-5 w-5" />
                Download Assets
              </h3>
              <p className="text-sm text-gray-600">
                All assets are saved to Google Drive. Click on any asset to open it in Drive, or use the links below:
              </p>
              <div className="flex flex-wrap gap-2">
                {successfulAssets.map((asset, i) => (
                  <a
                    key={i}
                    href={asset.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {asset.type === 'main' ? 'Main Image' : `Story ${i}`}
                  </a>
                ))}
              </div>
            </section>
          </>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/admin/assets')}>
            Back to Assets
          </Button>
          <Button variant="outline" onClick={() => navigate(`/admin/assets/configure/${resultsData.saleId}`)}>
            Generate More
          </Button>
          <Button variant="outline" onClick={handleClearAssets} className="text-red-600 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4 mr-1" />
            Clear Assets
          </Button>
        </div>
      </div>

      <AlertDialog open={showDevWarning} onOpenChange={setShowDevWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Development Environment Warning
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>
                You're about to post to your <strong>real Instagram account</strong> from the development environment.
              </p>
              <p className="text-amber-600 font-medium">
                This will publish content to your live Instagram profile, visible to all your followers.
              </p>
              <p>
                Are you sure you want to continue?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePostToInstagram}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              Yes, Post to Instagram
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
