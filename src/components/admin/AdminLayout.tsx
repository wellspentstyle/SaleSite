import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Eye, EyeOff, Loader2, Menu } from 'lucide-react';
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
                className="h-12 md:h-16 cursor-pointer"
                onClick={handleBackToSite}
              />
            </div>
          </div>
        </header>

        <main className="flex-1 flex items-center justify-center p-4 md:p-20">
          <div className="w-full max-w-md">
            <div className="border border-border bg-white p-6 md:p-12">
              <h1 
                className="mb-2 tracking-tight text-2xl md:text-3xl" 
                style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700 }}
              >
                Admin Access
              </h1>
              <p 
                className="text-muted-foreground mb-6 md:mb-10" 
                style={{ fontFamily: 'Crimson Pro, serif' }}
              >
                Enter your password to manage sales and content.
              </p>

              <form onSubmit={handleSignIn}>
                <div className="space-y-2 mb-6 md:mb-8">
                  <Label 
                    htmlFor="password"
                    style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '16px' }}
                  >
                    Password
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="h-12 flex-1"
                      required
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-400 hover:opacity-70 flex-shrink-0"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {authError && (
                  <p className="text-sm text-red-600 mt-4" style={{ fontFamily: 'DM Sans, sans-serif' }}>
                    {authError}
                  </p>
                )}

                <div className="mt-6">
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
      <header className="border-b border-border sticky top-0 bg-white z-30">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Mobile hamburger menu */}
              <button 
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="md:hidden p-2 hover:bg-gray-100 rounded-md"
              >
                <Menu className="h-5 w-5" />
              </button>
              <img 
                src="/logo.png" 
                alt="Well Spent Style" 
                className="h-12 md:h-16 cursor-pointer"
                onClick={handleBackToSite}
              />
            </div>
            <Button 
              variant="outline" 
              onClick={handleSignOut}
              className="text-sm md:text-base"
              style={{ fontFamily: 'DM Sans, sans-serif' }}
            >
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 w-full overflow-x-hidden" style={{ backgroundColor: '#f9fafb' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
