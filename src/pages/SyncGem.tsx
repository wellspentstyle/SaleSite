import { useState, useEffect } from 'react';
import { Button } from '../components/ui/button';
import { Loader2 } from 'lucide-react';

const API_BASE = '/api';

interface SyncResult {
  itemsScraped: number;
  itemsSaved: number;
}

interface SyncStatus {
  isRunning: boolean;
  currentStep: string;
  progress: number;
  startedAt: string | null;
  result: {
    success: boolean;
    message: string;
    itemsScraped: number;
    itemsSaved: number;
  } | null;
  error: string | null;
}

export function SyncGem() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const auth = sessionStorage.getItem('adminAuth') || '';

  // Poll for status when sync is running
  useEffect(() => {
    if (!syncStatus?.isRunning) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/admin/gem-sync-status`, {
          method: 'GET',
          headers: {
            'auth': auth
          }
        });

        const data = await response.json();
        setSyncStatus(data);

        // Stop polling when sync is complete
        if (!data.isRunning) {
          clearInterval(intervalId);
          
          // Show success or error message
          if (data.result) {
            setErrorMessage('');
          } else if (data.error) {
            setErrorMessage(data.error);
          }
        }
      } catch (error) {
        console.error('Status poll error:', error);
      }
    }, 1000); // Poll every second

    return () => clearInterval(intervalId);
  }, [syncStatus?.isRunning, auth]);

  const handleSyncGem = async () => {
    setErrorMessage('');
    setSyncStatus(null);

    try {
      const response = await fetch(`${API_BASE}/admin/sync-gem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        }
      });

      const data = await response.json();

      if (data.isRunning) {
        // Sync started successfully, begin polling
        setSyncStatus({
          isRunning: true,
          currentStep: 'Starting...',
          progress: 0,
          startedAt: new Date().toISOString(),
          result: null,
          error: null
        });
      } else {
        setErrorMessage(data.message || 'Failed to start Gem sync');
      }
    } catch (error) {
      console.error('Sync error:', error);
      setErrorMessage('An error occurred while starting sync. Please try again.');
    }
  };

  const isSyncing = syncStatus?.isRunning || false;
  const syncResult = syncStatus?.result;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 16px' }}>
      <div style={{ width: '100%', maxWidth: '700px' }}>
        <div className="border border-border bg-white" style={{ padding: '48px' }}>
          <h1 
            className="mb-2 tracking-tight" 
            style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 700, fontSize: '31px' }}
          >
            Sync Gem
          </h1>
          <p 
            className="text-muted-foreground mb-10" 
            style={{ fontFamily: 'Crimson Pro, serif' }}
          >
            Synchronize items from your Gem.app account to the database.
          </p>

          {/* Sync Button */}
          <div style={{ marginTop: '24px', marginBottom: '8px' }}>
            <Button 
              onClick={handleSyncGem}
              disabled={isSyncing}
              style={{ 
                fontFamily: 'DM Sans, sans-serif',
                backgroundColor: '#000',
                color: '#fff',
                height: '48px',
                paddingLeft: '32px',
                paddingRight: '32px',
                whiteSpace: 'nowrap'
              }}
            >
              {isSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing Gem Items...
                </>
              ) : (
                'Sync Gem Items'
              )}
            </Button>
          </div>

          {/* Live Progress Indicator */}
          {isSyncing && syncStatus && (
            <div style={{ 
              fontFamily: 'DM Sans, sans-serif',
              fontSize: '14px',
              color: '#666',
              marginBottom: '24px',
              paddingTop: '8px'
            }}>
              {syncStatus.currentStep}
              {syncStatus.progress > 0 && (
                <span style={{ marginLeft: '8px', color: '#999' }}>
                  ({syncStatus.progress}%)
                </span>
              )}
            </div>
          )}

          {/* Success Message */}
          {syncResult && !errorMessage && !isSyncing && (
            <div 
              className="border border-border bg-green-50 p-6 rounded-lg mb-6"
              style={{ fontFamily: 'DM Sans, sans-serif', marginTop: '24px' }}
            >
              <h3 className="font-semibold text-green-900 mb-4 text-lg">
                ✅ Sync Completed Successfully
              </h3>
              <div className="space-y-2 text-sm text-green-800">
                <div className="flex justify-between items-center py-2 border-b border-green-200">
                  <span className="font-medium">Items Scraped:</span>
                  <span className="font-bold text-lg">{syncResult.itemsScraped}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="font-medium">Items Saved:</span>
                  <span className="font-bold text-lg">{syncResult.itemsSaved}</span>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div 
              className="border border-red-300 bg-red-50 p-6 rounded-lg"
              style={{ fontFamily: 'DM Sans, sans-serif', marginTop: '24px' }}
            >
              <h3 className="font-semibold text-red-900 mb-2 text-lg">
                ❌ Sync Failed
              </h3>
              <p className="text-sm text-red-700">
                {errorMessage}
              </p>
            </div>
          )}

          {/* Info Box */}
          {!syncResult && !errorMessage && !isSyncing && (
            <div 
              className="border border-border bg-muted p-6 rounded-lg"
              style={{ fontFamily: 'DM Sans, sans-serif', marginTop: '24px' }}
            >
              <h3 className="font-semibold mb-2">How it works:</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Connects to your Gem.app account via the scraper</li>
                <li>Fetches all curated items from your Gem collections</li>
                <li>Adds new items and updates existing ones in the database</li>
                <li>Reports the number of items processed and any errors</li>
                <li>Runs in the background - you can navigate away during sync</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
