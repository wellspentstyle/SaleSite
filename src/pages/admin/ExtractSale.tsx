import { useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Upload, FileText, Loader2, Check, AlertCircle, Sparkles, ArrowRight, Plus } from 'lucide-react';

interface ExtractedSale {
  company: string;
  percentOff: number | null;
  saleUrl: string | null;
  cleanUrl: string | null;
  discountCode: string | null;
  startDate: string | null;
  endDate: string | null;
  saleType: string | null;
  notes: string | null;
  confidence: number;
  reasoning: string;
  missingUrl: boolean;
  companyRecordId?: string;
  matchedCompany?: string;
}

export default function ExtractSale() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'image' | 'text'>('image');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [textContent, setTextContent] = useState('');
  const [sourceHint, setSourceHint] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedSale | null>(null);
  const [editedData, setEditedData] = useState<ExtractedSale | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
      setExtractedData(null);
      setEditedData(null);
      setError(null);
    };
    reader.readAsDataURL(file);
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setImagePreview(reader.result as string);
            setActiveTab('image');
            setExtractedData(null);
            setEditedData(null);
            setError(null);
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          return;
        }
      }
    }
  }, []);

  const handleExtract = async () => {
    if (activeTab === 'image' && !imagePreview) {
      setError('Please upload or paste an image first');
      return;
    }
    if (activeTab === 'text' && !textContent.trim()) {
      setError('Please paste some text first');
      return;
    }

    setIsExtracting(true);
    setError(null);
    setExtractedData(null);
    setEditedData(null);

    try {
      const response = await fetch('/api/admin/extract-sale', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': localStorage.getItem('adminAuth') || ''
        },
        body: JSON.stringify({
          image: activeTab === 'image' ? imagePreview : undefined,
          text: activeTab === 'text' ? textContent : undefined,
          sourceHint: sourceHint || undefined
        })
      });

      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(`Server error: ${text.slice(0, 200) || 'Empty response'}`);
      }

      if (!result.success) {
        throw new Error(result.message || 'Extraction failed');
      }

      setExtractedData(result.data);
      setEditedData(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract sale information');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!editedData) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/pending-sales/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': localStorage.getItem('adminAuth') || ''
        },
        body: JSON.stringify({
          company: editedData.company,
          percentOff: editedData.percentOff,
          saleUrl: editedData.saleUrl,
          cleanUrl: editedData.cleanUrl,
          discountCode: editedData.discountCode,
          startDate: editedData.startDate,
          endDate: editedData.endDate,
          confidence: editedData.confidence,
          reasoning: `Extracted from ${activeTab}. ${editedData.reasoning}`,
          companyRecordId: editedData.companyRecordId,
          emailFrom: 'manual-extraction',
          emailSubject: `${editedData.company} Sale - ${editedData.saleType || 'Extracted'}`,
          urlSource: 'extraction-tool',
          missingUrl: editedData.missingUrl
        })
      });

      const text = await response.text();
      let result;
      try {
        result = JSON.parse(text);
      } catch {
        throw new Error(`Server error: ${text.slice(0, 200) || 'Empty response'}`);
      }

      if (!result.success) {
        throw new Error(result.message || 'Failed to save sale');
      }

      setSaveSuccess(true);
      setTimeout(() => {
        navigate('/admin/sales-approvals?tab=pending');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sale');
    } finally {
      setIsSaving(false);
    }
  };

  const updateField = (field: keyof ExtractedSale, value: string | number | null) => {
    if (!editedData) return;
    setEditedData({ ...editedData, [field]: value });
  };

  return (
    <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-1">AI Extraction</h2>
            <p className="text-gray-600 text-sm">
              Upload a screenshot or paste text to automatically extract sale details.
            </p>
          </div>
          <Link to="/admin/sales-approvals/manual">
            <Button variant="outline" className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Manual Entry
            </Button>
          </Link>
        </div>

        {!extractedData ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Input Source</CardTitle>
              <CardDescription>
                Choose how to provide the sale information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(v: string) => setActiveTab(v as 'image' | 'text')}>
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="image" className="flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    Screenshot
                  </TabsTrigger>
                  <TabsTrigger value="text" className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Text
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="image" className="space-y-4">
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
                    onPaste={handlePaste}
                    onClick={() => document.getElementById('image-upload')?.click()}
                  >
                    {imagePreview ? (
                      <div className="space-y-4">
                        <img
                          src={imagePreview}
                          alt="Uploaded screenshot"
                          className="max-h-64 mx-auto rounded-lg shadow-sm"
                        />
                        <p className="text-sm text-gray-500">Click or paste to replace</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload className="w-10 h-10 text-gray-400 mx-auto" />
                        <p className="text-gray-600">
                          Click to upload or paste (Cmd/Ctrl+V) a screenshot
                        </p>
                        <p className="text-sm text-gray-400">
                          PNG, JPG up to 10MB
                        </p>
                      </div>
                    )}
                    <input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </div>
                </TabsContent>

                <TabsContent value="text" className="space-y-4">
                  <Textarea
                    placeholder="Paste the sale announcement text here...

Example:
FLASH SALE! Get 30% off everything at Example Brand this weekend only. Use code FLASH30 at checkout. Valid through Sunday."
                    value={textContent}
                    onChange={(e) => {
                      setTextContent(e.target.value);
                      setExtractedData(null);
                      setEditedData(null);
                      setError(null);
                    }}
                    className="min-h-[200px] font-mono text-sm"
                    onPaste={handlePaste}
                  />
                </TabsContent>
              </Tabs>

              <div className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="source-hint" className="text-sm text-gray-600">
                    Additional Context (optional)
                  </Label>
                  <Input
                    id="source-hint"
                    placeholder="e.g., 'Sale URL is shopbop.com/sale' or 'Email from brand@example.com'"
                    value={sourceHint}
                    onChange={(e) => setSourceHint(e.target.value)}
                    className="mt-1"
                  />
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <Button
                  onClick={handleExtract}
                  disabled={isExtracting || (activeTab === 'image' && !imagePreview) || (activeTab === 'text' && !textContent.trim())}
                  className="w-full"
                  size="lg"
                >
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Extract Sale Information
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Check className="w-5 h-5 text-green-600" />
                      Extracted Sale
                    </CardTitle>
                    <CardDescription>
                      Review and edit the extracted information before saving
                    </CardDescription>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Confidence</div>
                    <div className={`text-lg font-semibold ${
                      (editedData?.confidence || 0) >= 80 ? 'text-green-600' :
                      (editedData?.confidence || 0) >= 60 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {editedData?.confidence}%
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label>Company / Brand</Label>
                    <Input
                      value={editedData?.company || ''}
                      onChange={(e) => updateField('company', e.target.value)}
                      className="mt-1"
                    />
                    {editedData?.matchedCompany && (
                      <p className="text-xs text-green-600 mt-1">
                        Matched to existing brand: {editedData.matchedCompany}
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Discount %</Label>
                    <Input
                      type="number"
                      value={editedData?.percentOff || ''}
                      onChange={(e) => updateField('percentOff', e.target.value ? parseInt(e.target.value) : null)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Sale Type</Label>
                    <Input
                      value={editedData?.saleType || ''}
                      onChange={(e) => updateField('saleType', e.target.value)}
                      placeholder="e.g., Up to 50% off"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={editedData?.startDate || ''}
                      onChange={(e) => updateField('startDate', e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={editedData?.endDate || ''}
                      onChange={(e) => updateField('endDate', e.target.value)}
                      className="mt-1"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label>Sale URL</Label>
                    <Input
                      value={editedData?.saleUrl || ''}
                      onChange={(e) => updateField('saleUrl', e.target.value)}
                      placeholder="https://"
                      className="mt-1"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label>Discount Code</Label>
                    <Input
                      value={editedData?.discountCode || ''}
                      onChange={(e) => updateField('discountCode', e.target.value)}
                      placeholder="Optional promo code"
                      className="mt-1"
                    />
                  </div>

                  <div className="col-span-2">
                    <Label>Notes</Label>
                    <Textarea
                      value={editedData?.notes || ''}
                      onChange={(e) => updateField('notes', e.target.value)}
                      placeholder="Additional details about the sale"
                      className="mt-1"
                    />
                  </div>
                </div>

                {extractedData?.reasoning && (
                  <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
                    <strong>AI Reasoning:</strong> {extractedData.reasoning}
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}

                {saveSuccess && (
                  <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 p-3 rounded-lg">
                    <Check className="w-4 h-4 flex-shrink-0" />
                    Sale saved! Redirecting to approvals...
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setExtractedData(null);
                      setEditedData(null);
                      setError(null);
                    }}
                    disabled={isSaving || saveSuccess}
                  >
                    Start Over
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving || saveSuccess || !editedData?.company}
                    className="flex-1"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        Save to Pending Sales
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
    </div>
  );
}
