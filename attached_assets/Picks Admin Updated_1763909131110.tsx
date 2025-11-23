// UPDATE FOR PICKSADMIN.TSX
// Replace the performScraping function with this:

const performScraping = async (urlList: string[]) => {
  setIsLoading(true);
  
  // Navigate IMMEDIATELY to finalize page with URLs to scrape
  // The finalize page will handle progressive scraping
  navigate('/admin/picks/finalize', {
    state: {
      scrapedProducts: [], // Start empty
      selectedSaleId: selectedSale?.id,
      saleName: selectedSale?.saleName,
      salePercentOff: selectedSale?.percentOff,
      failures: [],
      urlsToScrape: urlList, // Pass URLs for progressive scraping
      startScraping: true // Flag to trigger scraping
    }
  });
  
  setIsLoading(false);
};
