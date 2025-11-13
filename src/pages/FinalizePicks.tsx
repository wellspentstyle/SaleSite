import { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';

interface Product {
  url: string;
  name: string;
  imageUrl: string;
  originalPrice: number | null;
  salePrice: number;
  percentOff: number;
}

interface FinalizePicksProps {
  onSignOut: () => void;
  onBack: () => void;
  scrapedProducts: Product[];
  selectedSaleId: string;
}

const API_BASE = '/api';

export function FinalizePicks({ onSignOut, onBack, scrapedProducts, selectedSaleId }: FinalizePicksProps) {
  const [picks, setPicks] = useState<Product[]>(scrapedProducts);
  const [isSaving, setIsSaving] = useState(false);

  const handleDelete = (index: number) => {
    setPicks(picks.filter((_, i) => i !== index));
  };

  const handleLaunch = async () => {
    if (picks.length === 0) {
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
          picks: picks
        })
      });

      const data = await response.json();

      if (data.success) {
        alert(`Successfully saved ${picks.length} picks!`);
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
            {picks.length} out of {scrapedProducts.length} picks uploaded.
          </p>
        </div>

        {picks.length === 0 ? (
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
                      {pick.percentOff !== null && pick.percentOff !== undefined && (
                        <div 
                          style={{ 
                            fontFamily: 'DM Sans, sans-serif',
                            fontSize: '12px',
                            marginTop: '4px',
                            color: '#999'
                          }}
                        >
                          {pick.percentOff}% OFF
                        </div>
                      )}
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
