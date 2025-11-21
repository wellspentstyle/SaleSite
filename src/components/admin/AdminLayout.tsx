import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';

const API_BASE = '/api';

export function AdminLayout() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return !!sessionStorage.getItem('adminAuth');
  });
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState('');

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
  };

  const handleBackToSite = () => {
    window.location.href = '/';
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
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

        <main style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 16px' }}>
          <div style={{ width: '100%', maxWidth: '448px' }}>
            <div className="border border-border bg-white" style={{ padding: '48px' }}>
              <h1 
                className="mb-2 tracking-tight" 
                style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '31px' }}
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

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <img 
              src="/logo.png" 
              alt="Well Spent Style" 
              className="h-16 cursor-pointer"
              onClick={handleBackToSite}
            />
            <Button 
              variant="outline" 
              onClick={handleSignOut}
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <AdminSidebar />
        <main className="flex-1" style={{ backgroundColor: '#f9fafb' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
