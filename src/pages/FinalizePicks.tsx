import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { ManualEntryForm, ManualProductData } from '../components/ManualEntryForm';

interface Product {
  url: string;
  name: string;
  imageUrl: string;
  originalPrice: number | null;
  salePrice: number;
  percentOff: number;
  confidence?: number;
  entryType?: string;
}

interface Failure {
  url: string;
  error: string;
}

interface FinalizePicksProps {
  onSignOut: () => void;
  onBack: () => void;
  scrapedProducts: Product[];
  selectedSaleId: string;
  failures?: Failure[];
}

const API_BASE = '/api';

export function FinalizePicks({ onSignOut, onBack, scrapedProducts, selectedSaleId, failures = [] }: FinalizePicksProps) {
  const [picks, setPicks] = useState<Product[]>(scrapedProducts);
  const [manualEntries, setManualEntries] = useState<Map<string, ManualProductData>>(new Map());
  const [failedUrls, setFailedUrls] = useState<string[]>(failures.map(f => f.url));
  const [isSaving, setIsSaving] = useState(false);

  const handleDelete = (index: number) => {
    setPicks(picks.filter((_, i) => i !== index));
  };

  const handleManualDataChange = (url: string, data: ManualProductData) => {
    setManualEntries(new Map(manualEntries.set(url, data)));
  };

  const handleRemoveManualEntry = (url: string) => {
    const newEntries = new Map(manualEntries);
    newEntries.delete(url);
    setManualEntries(newEntries);
    setFailedUrls(failedUrls.filter(u => u !== url));
  };

  const handleLaunch = async () => {
    const manualPicks = Array.from(manualEntries.values()).map(data => ({
      url: data.url,
      name: data.name,
      imageUrl: data.imageUrl,
      originalPrice: data.originalPrice,
      salePrice: data.salePrice,
      percentOff: data.percentOff,
      confidence: 100,
      entryType: 'manual'
    }));

    const autoPicks = picks.map(pick => ({
      ...pick,
      entryType: 'automatic'
    }));

    const allPicks = [...manualPicks, ...autoPicks];

    if (allPicks.length === 0) {
      alert('No picks to save');
      return;
    }

    setIsSaving(true);
    const auth = sessionStorage.getItem('adminAuth');

    try {
      const response = await fetch(`${API_BASE}/admin/picks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth || ''
        },
        body: JSON.stringify({
          saleId: selectedSaleId,
          picks: allPicks
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(`Successfully saved ${allPicks.length} picks!`);
        onBack();
      } else {
        alert(`Failed to save picks: ${data.message}`);
      }
    } catch (error) {
      console.error('Save error:', error);
      alert('An error occurred while saving picks');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '12px 34px' }}>
          <div className="flex items-center justify-between">
            <img 
              src="/logo.png" 
              alt="Well Spent Style" 
              className="h-16"
            />
            <button
              onClick={onSignOut}
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
                color: '#666',
                background: 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 34px' }}>
        {/* Page Title */}
        <div style={{ marginBottom: '40px' }}>
          <h1 
            style={{ 
              fontFamily: 'DM Sans, sans-serif', 
              fontSize: '34px',
              fontWeight: 700,
              marginBottom: '8px',
              color: '#000'
            }}
          >
            Finalize Picks
          </h1>
          <p 
            style={{ 
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '14px',
              fontWeight: 400,
              color: '#666',
              marginBottom: '4px'
            }}
          >
            Review and edit your curated picks before launching.
          </p>
          <p 
            style={{ 
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '14px',
              fontStyle: 'italic',
              color: '#999'
            }}
          >
            {picks.length} auto-scraped, {failedUrls.length} manual {failedUrls.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>

        {/* Manual Entry Forms (for failed scrapes) */}
        {failedUrls.length > 0 && (
          <div style={{ marginBottom: '60px' }}>
            <h2 
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '20px',
                fontWeight: 700,
                marginBottom: '16px',
                color: '#000'
              }}
            >
              Manual Entries ({failedUrls.length})
            </h2>
            <p 
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '14px',
                color: '#666',
                marginBottom: '24px'
              }}
            >
              These URLs couldn't be scraped automatically. Fill in the product details manually:
            </p>
            {failedUrls.map(url => (
              <ManualEntryForm
                key={url}
                url={url}
                onDataChange={(data) => handleManualDataChange(url, data)}
                onRemove={() => handleRemoveManualEntry(url)}
              />
            ))}
          </div>
        )}

        {/* Auto-Scraped Products */}
        {picks.length > 0 && (
          <div style={{ marginBottom: '40px' }}>
            <h2 
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                fontSize: '20px',
                fontWeight: 700,
                marginBottom: '24px',
                color: '#000'
              }}
            >
              Auto-Scraped Products ({picks.length})
            </h2>
          </div>
        )}

        {picks.length === 0 && failedUrls.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground mb-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
              No picks to display. Go back and scrape some products.
            </p>
            <button
              onClick={onBack}
              className="border border-border bg-white px-8 py-3 hover:border-foreground transition-colors"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              Back to Picks Admin
            </button>
          </div>
        ) : (
          <>
            {/* Product Grid */}
            <div 
              style={{ 
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '24px',
                marginBottom: '80px'
              }}
            >
              {picks.map((pick, index) => (
                <div 
                  key={index}
                  style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    border: '1px solid #e5e5e5',
                    padding: '16px',
                    position: 'relative',
                    backgroundColor: '#fff'
                  }}
                >
                  {/* Delete Button */}
                  <button
                    onClick={() => handleDelete(index)}
                    style={{
                      position: 'absolute',
                      top: '24px',
                      right: '24px',
                      zIndex: 10,
                      padding: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      border: '1px solid #e5e5e5',
                      cursor: 'pointer',
                      borderRadius: '4px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#fee';
                      e.currentTarget.style.borderColor = '#f55';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
                      e.currentTarget.style.borderColor = '#e5e5e5';
                    }}
                    aria-label="Delete pick"
                  >
                    <Trash2 style={{ width: '16px', height: '16px', color: '#666' }} />
                  </button>

                  {/* Product Image */}
                  <div 
                    style={{ 
                      width: '100%',
                      aspectRatio: '3/4',
                      overflow: 'hidden',
                      backgroundColor: '#f5f5f5',
                      marginBottom: '16px'
                    }}
                  >
                    <img 
                      src={pick.imageUrl} 
                      alt={pick.name}
                      style={{ 
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                      }}
                    />
                  </div>

                  {/* Product Info */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <h3 
                      style={{ 
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: '14px',
                        fontWeight: 400,
                        lineHeight: '1.4',
                        marginBottom: '12px',
                        color: '#000'
                      }}
                    >
                      {pick.name}
                    </h3>

                    {/* Pricing */}
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span 
                          style={{ 
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#000'
                          }}
                        >
                          ${pick.salePrice}
                        </span>
                        {pick.originalPrice && (
                          <span 
                            style={{ 
                              fontFamily: 'DM Sans, sans-serif',
                              fontSize: '14px',
                              textDecoration: 'line-through',
                              color: '#999'
                            }}
                          >
                            ${pick.originalPrice}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        {pick.percentOff !== null && pick.percentOff !== undefined && (
                          <div 
                            style={{ 
                              fontFamily: 'DM Sans, sans-serif',
                              fontSize: '12px',
                              color: '#999'
                            }}
                          >
                            {pick.percentOff}% OFF
                          </div>
                        )}
                        {pick.confidence !== undefined && (
                          <div 
                            style={{ 
                              fontFamily: 'DM Sans, sans-serif',
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '3px',
                              backgroundColor: pick.confidence >= 80 ? '#dcfce7' : pick.confidence >= 60 ? '#fef3c7' : '#fee2e2',
                              color: pick.confidence >= 80 ? '#166534' : pick.confidence >= 60 ? '#92400e' : '#991b1b'
                            }}
                          >
                            {pick.confidence}% confidence
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '16px', justifyContent: 'center' }}>
              <button
                onClick={onBack}
                disabled={isSaving}
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #ddd',
                  padding: '12px 48px',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.5 : 1,
                  transition: 'border-color 0.2s'
                }}
                onMouseEnter={(e) => !isSaving && (e.currentTarget.style.borderColor = '#000')}
                onMouseLeave={(e) => !isSaving && (e.currentTarget.style.borderColor = '#ddd')}
              >
                Back
              </button>
              <button
                onClick={handleLaunch}
                disabled={isSaving}
                style={{
                  backgroundColor: '#000',
                  color: '#fff',
                  border: 'none',
                  padding: '12px 48px',
                  fontFamily: 'DM Sans, sans-serif',
                  fontSize: '14px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#333')}
                onMouseLeave={(e) => !isSaving && (e.currentTarget.style.backgroundColor = '#000')}
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Launch'
                )}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
