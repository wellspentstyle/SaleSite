import { Sale, SalePick } from '../types';

const AIRTABLE_PAT = import.meta.env.VITE_AIRTABLE_PAT || '';
const AIRTABLE_BASE_ID = import.meta.env.VITE_AIRTABLE_BASE_ID || '';
const TABLE_NAME = 'Sales';
const PICKS_TABLE_NAME = 'Picks';

// Function to strip tracking parameters from URLs
function cleanUrl(url: string): string {
  if (!url) return url;
  try {
    const urlObj = new URL(url);
    // Return just the origin + pathname (no query params or hash)
    return `${urlObj.origin}${urlObj.pathname}`;
  } catch (e) {
    // If URL parsing fails, just return the original
    return url;
  }
}

interface AirtableRecord {
  id: string;
  createdTime: string;
  fields: {
    RecordID?: number;
    Company?: string;
    PercentOff?: number;
    StartDate?: string;
    EndDate?: string;
    SaleURL?: string;
    Description?: string;
    Confidence?: number;
    Live?: string;
    DiscountCode?: string;
    Featured?: string;
    Images?: Array<{ url: string }>;
    CleanURL?: string;
    ShopMyURL?: string;
  };
}

interface AirtablePickRecord {
  id: string;
  fields: {
    ProductURL?: string;
    ProductName?: string;
    ImageURL?: string;
    OriginalPrice?: number;
    SalePrice?: number;
    PercentOff?: number;
    SaleID?: string[];
    ShopMyURL?: string;
  };
}

interface AirtableResponse {
  records: AirtableRecord[];
  offset?: string;
}

interface AirtablePicksResponse {
  records: AirtablePickRecord[];
  offset?: string;
}

async function fetchPicksFromAirtable(): Promise<Map<string, SalePick[]>> {
  try {
    // Fetch ALL picks with pagination
    const allRecords: AirtablePickRecord[] = [];
    let offset: string | undefined = undefined;
    
    const fields = ['ProductURL', 'ProductName', 'ImageURL', 'OriginalPrice', 'SalePrice', 'PercentOff', 'SaleID', 'ShopMyURL'];
    
    do {
      const params = new URLSearchParams({
        fields: fields.join(','),
        pageSize: '100'
      });
      
      if (offset) {
        params.set('offset', offset);
      }
      
      const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}?${params}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Airtable API error: ${response.status} ${response.statusText}`);
      }

      const data: AirtablePicksResponse = await response.json();
      allRecords.push(...data.records);
      offset = data.offset;
      
      console.log(`📦 Fetched ${data.records.length} picks (total: ${allRecords.length})`);
    } while (offset);

    // Group picks by SaleID
    const picksBySale = new Map<string, SalePick[]>();
    
    allRecords.forEach(record => {
      const fields = record.fields;
      const saleIds = fields.SaleID || [];
      
      // Skip if no sale ID or missing required fields
      if (saleIds.length === 0 || !fields.ProductName || !fields.ProductURL) {
        return;
      }

      const productUrl = fields.ProductURL || '';
      const cleanedUrl = cleanUrl(productUrl);
      
      // Generate ShopMy URL
      let shopMyUrl = '#';
      if (fields.ShopMyURL) {
        shopMyUrl = fields.ShopMyURL;
      } else {
        shopMyUrl = `https://go.shopmy.us/apx/l9N1lH?url=${encodeURIComponent(cleanedUrl)}`;
      }

      const pick: SalePick = {
        id: record.id,
        name: fields.ProductName,
        url: productUrl,
        imageUrl: fields.ImageURL || '',
        originalPrice: fields.OriginalPrice || 0,
        salePrice: fields.SalePrice || 0,
        percentOff: fields.PercentOff || 0,
        shopMyUrl: shopMyUrl,
      };

      // Add this pick to each linked sale
      saleIds.forEach(saleId => {
        if (!picksBySale.has(saleId)) {
          picksBySale.set(saleId, []);
        }
        picksBySale.get(saleId)!.push(pick);
      });
    });

    return picksBySale;
  } catch (error) {
    console.error('Error fetching picks from Airtable:', error);
    return new Map();
  }
}

export async function fetchSalesFromAirtable(): Promise<Sale[]> {
  try {
    // Fetch sales from our backend API (which handles Airtable securely)
    const response = await fetch('/api/sales');
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch sales');
    }

    return data.sales;
  } catch (error) {
    console.error('Error fetching sales from Airtable:', error);
    return [];
  }
}
