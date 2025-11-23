// UPDATE FOR FINALIZEPICKS.TSX
// Add these to your LocationState interface:

interface LocationState {
  scrapedProducts: Product[];
  selectedSaleId: string;
  saleName?: string;
  salePercentOff?: number;
  failures?: Failure[];
  urlsToScrape?: string[];  // NEW
  startScraping?: boolean;   // NEW
}

// Add this state for scraping progress:
const [scrapingProgress, setScrapingProgress] = useState<{
  current: number;
  total: number;
  isScrapingNow: boolean;
}>({
  current: 0,
  total: 0,
  isScrapingNow: false
});

// Add this useEffect AFTER your existing useEffect:

useEffect(() => {
  // Progressive scraping logic
  if (state?.startScraping && state?.urlsToScrape && state.urlsToScrape.length > 0) {
    scrapeProgressively(state.urlsToScrape);
  }
}, [state?.startScraping, state?.urlsToScrape]);

// Add this new function:

const scrapeProgressively = async (urls: string[]) => {
  const auth = sessionStorage.getItem('adminAuth');
  const failedDomains = new Set<string>();
  
  setScrapingProgress({
    current: 0,
    total: urls.length,
    isScrapingNow: true
  });
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    
    // Extract domain to check if it's already blocked
    const domain = extractDomain(url);
    
    // Skip if domain is blocked
    if (failedDomains.has(domain)) {
      setFailedUrls(prev => [...prev, url]);
      toast.error(`Skipped ${url} - domain ${domain} is blocked`);
      continue;
    }
    
    setScrapingProgress({
      current: i + 1,
      total: urls.length,
      isScrapingNow: true
    });
    
    try {
      const response = await fetch(`${API_BASE}/admin/scrape-product`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'auth': auth || ''
        },
        body: JSON.stringify({ url }) // Single URL
      });
      
      const data = await response.json();
      
      if (data.success && data.successes && data.successes.length > 0) {
        const scrapedProduct = {
          ...data.successes[0].product,
          confidence: data.successes[0].confidence,
          extractionMethod: data.successes[0].extractionMethod
        };
        
        // Add to picks immediately - UI updates progressively!
        setPicks(prev => [...prev, scrapedProduct]);
        
        toast.success(`✓ Scraped ${i + 1}/${urls.length}: ${scrapedProduct.name.substring(0, 40)}...`);
        
      } else if (data.failures && data.failures.length > 0) {
        const failure = data.failures[0];
        
        // Check if it's a blocking error - if so, skip remaining URLs from this domain
        if (failure.errorType === 'BLOCKING') {
          failedDomains.add(domain);
          toast.error(`Domain ${domain} is blocking us - skipping remaining URLs from this store`);
        }
        
        setFailedUrls(prev => [...prev, url]);
        toast.error(`✗ Failed ${i + 1}/${urls.length}: ${failure.error}`);
      } else {
        // Unknown error
        setFailedUrls(prev => [...prev, url]);
        toast.error(`✗ Failed ${i + 1}/${urls.length}`);
      }
      
    } catch (error) {
      console.error('Scraping error:', error);
      setFailedUrls(prev => [...prev, url]);
      toast.error(`✗ Error ${i + 1}/${urls.length}: Network error`);
    }
  }
  
  // Done scraping
  setScrapingProgress({
    current: urls.length,
    total: urls.length,
    isScrapingNow: false
  });
  
  const successCount = picks.length;
  const failureCount = failedUrls.length;
  
  if (successCount > 0) {
    toast.success(`🎉 Scraping complete! ${successCount} successful, ${failureCount} failed`);
  } else {
    toast.error(`All ${failureCount} products failed to scrape`);
  }
};

// Helper function to extract domain from URL
const extractDomain = (url: string): string => {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace('www.', '');
  } catch {
    return url;
  }
};

// Add this progress indicator in your JSX, right after the page title:

{scrapingProgress.isScrapingNow && (
  <div 
    style={{ 
      padding: '16px',
      backgroundColor: '#f0f9ff',
      border: '1px solid #0284c7',
      borderRadius: '4px',
      marginBottom: '24px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px'
    }}
  >
    <Loader2 className="h-5 w-5 animate-spin" style={{ color: '#0284c7' }} />
    <div style={{ flex: 1 }}>
      <p style={{ fontFamily: 'DM Sans, sans-serif', fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
        Scraping products... {scrapingProgress.current} of {scrapingProgress.total}
      </p>
      <div style={{ 
        width: '100%', 
        height: '6px', 
        backgroundColor: '#e0f2fe', 
        borderRadius: '3px',
        overflow: 'hidden'
      }}>
        <div 
          style={{ 
            width: `${(scrapingProgress.current / scrapingProgress.total) * 100}%`,
            height: '100%',
            backgroundColor: '#0284c7',
            transition: 'width 0.3s ease'
          }}
        />
      </div>
    </div>
  </div>
)}
