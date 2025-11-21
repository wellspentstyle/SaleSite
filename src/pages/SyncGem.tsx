import { useState } from 'react';
import { Button } from '../components/ui/button';
import { Loader2 } from 'lucide-react';

const API_BASE = '/api';

interface SyncResult {
  itemsAdded: number;
  itemsUpdated: number;
  totalProcessed: number;
  errors?: string[];
}

export function SyncGem() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  const handleSyncGem = async () => {
    setIsSyncing(true);
    setErrorMessage('');
    setSyncResult(null);

    const auth = sessionStorage.getItem('adminAuth') || '';

    try {
      const response = await fetch(`${API_BASE}/admin/sync-gem`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth
        }
      });

      const data = await response.json();

      if (data.success) {
        setSyncResult({
          itemsAdded: data.itemsAdded || 0,
          itemsUpdated: data.itemsUpdated || 0,
          totalProcessed: data.totalProcessed || 0,
          errors: data.errors
        });
      } else {
        setErrorMessage(data.message || 'Failed to sync Gem items');
      }
    } catch (error) {
      console.error('Sync error:', error);
      setErrorMessage('An error occurred while syncing. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

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
          <div style={{ marginTop: '24px', marginBottom: '32px' }}>
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

          {/* Success Message */}
          {syncResult && !errorMessage && (
          <div 
            className="border border-border bg-green-50 p-6 rounded-lg mb-6"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            <h3 className="font-semibold text-green-900 mb-4 text-lg">
              ✅ Sync Completed Successfully
            </h3>
            <div className="space-y-2 text-sm text-green-800">
              <div className="flex justify-between items-center py-2 border-b border-green-200">
                <span className="font-medium">Items Added:</span>
                <span className="font-bold text-lg">{syncResult.itemsAdded}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-green-200">
                <span className="font-medium">Items Updated:</span>
                <span className="font-bold text-lg">{syncResult.itemsUpdated}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="font-medium">Total Processed:</span>
                <span className="font-bold text-lg">{syncResult.totalProcessed}</span>
              </div>
            </div>

            {syncResult.errors && syncResult.errors.length > 0 && (
              <div className="mt-4 pt-4 border-t border-green-200">
                <h4 className="font-semibold text-green-900 mb-2">Warnings:</h4>
                <ul className="list-disc list-inside text-sm text-green-700 space-y-1">
                  {syncResult.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
          <div 
            className="border border-red-300 bg-red-50 p-6 rounded-lg"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
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
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          >
            <h3 className="font-semibold mb-2">How it works:</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Connects to your Gem.app account via the scraper</li>
              <li>Fetches all curated items from your Gem collections</li>
              <li>Adds new items and updates existing ones in the database</li>
              <li>Reports the number of items processed and any errors</li>
            </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
