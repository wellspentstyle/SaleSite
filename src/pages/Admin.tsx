import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { PicksAdmin } from './PicksAdmin';
import { FinalizePicks } from './FinalizePicks';

interface AdminProps {
  onBackToSite?: () => void;
}

type AdminPage = 'picks-admin' | 'finalize-picks';

// API requests go through Vite proxy to webhook server
const API_BASE = '/api';

export function Admin({ onBackToSite }: AdminProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!sessionStorage.getItem('adminAuth');
  });
  const [currentPage, setCurrentPage] = useState<AdminPage>('picks-admin');
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [scrapedProducts, setScrapedProducts] = useState<any[]>([]);
  const [selectedSaleId, setSelectedSaleId] = useState('');
  const [failures, setFailures] = useState<any[]>([]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError('');

    try {
      const response = await fetch(`${API_BASE}/admin/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });

      const data = await response.json();

      if (data.success) {
        // Store the password for subsequent API calls
        sessionStorage.setItem('adminAuth', password);
        setIsAuthenticated(true);
      } else {
        setAuthError('Invalid password');
      }
    } catch (error) {
      setAuthError('Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem('adminAuth');
    setIsAuthenticated(false);
    setPassword('');
    setCurrentPage('picks-admin');
    setScrapedProducts([]);
    setSelectedSaleId('');
  };

  const handleNavigateToFinalize = (products: any[], saleId: string, failuresList: any[] = []) => {
    setScrapedProducts(products);
    setSelectedSaleId(saleId);
    setFailures(failuresList);
    setCurrentPage('finalize-picks');
  };

  const handleBackToPicksAdmin = () => {
    setCurrentPage('picks-admin');
    setFailures([]);
  };

  const handleBackToSite = () => {
    if (onBackToSite) {
      onBackToSite();
    } else {
      window.location.href = '/';
    }
  };

  // Show appropriate admin page if authenticated
  if (isAuthenticated) {
    if (currentPage === 'finalize-picks') {
      return (
        <FinalizePicks 
          onSignOut={handleSignOut} 
          onBack={handleBackToPicksAdmin}
          scrapedProducts={scrapedProducts}
          selectedSaleId={selectedSaleId}
          failures={failures}
        />
      );
    }
    
    return (
      <PicksAdmin 
        onSignOut={handleSignOut} 
        onNavigateToFinalize={handleNavigateToFinalize}
      />
    );
  }

  console.log('🔥 ADMIN COMPONENT RENDERING - FIGMA VERSION V3');
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center">
            <img 
              src="/logo.png" 
              alt="Well Spent Style" 
              className="h-16 cursor-pointer"
              onClick={handleBackToSite}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 16px' }}>
        <div style={{ width: '100%', maxWidth: '448px' }}>
          <div className="border border-border bg-white" style={{ padding: '48px' }}>
            <h1 
              className="mb-2 tracking-tight" 
              style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '31px' }}
              data-version="v2-figma"
            >
              Admin Access
            </h1>
            <p 
              className="text-muted-foreground mb-10" 
              style={{ fontFamily: 'Crimson Pro, serif' }}
            >
              Enter your password to manage sales and content.
            </p>

            <form onSubmit={handleSignIn}>
              <div className="space-y-2" style={{ marginBottom: '32px' }}>
                <Label 
                  htmlFor="password"
                  style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '16px' }}
                >
                  Password
                </Label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-12"
                    style={{ flex: 1 }}
                    required
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    style={{ color: '#9ca3af', flexShrink: 0 }}
                    className="hover:opacity-70"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {authError && (
                <p className="text-sm text-red-600" style={{ fontFamily: 'DM Sans, sans-serif', marginTop: '16px' }}>
                  {authError}
                </p>
              )}

              <div style={{ marginTop: '24px' }}>
                <Button 
                  type="submit" 
                  className="w-full h-12"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Authenticating...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </Button>
              </div>
            </form>
          </div>

          <div className="mt-6 text-center">
            <button 
              onClick={handleBackToSite}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              style={{ fontFamily: 'Crimson Pro, serif' }}
            >
              ← Back to site
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
