import { execSync } from 'child_process';

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE_NAME = 'Sales';

function getCleanUrl(trackingUrl) {
  try {
    const cleanUrl = execSync(
      `curl -sL -o /dev/null -w '%{url_effective}' '${trackingUrl}'`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();
    
    return cleanUrl || null;
  } catch (error) {
    console.error(`   ❌ Error following redirects:`, error.message);
    return null;
  }
}

async function fetchAllSales() {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${AIRTABLE_PAT}`
    }
  });
  
  const data = await response.json();
  return data.records;
}

async function updateCleanUrl(recordId, cleanUrl) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}/${recordId}`;
  
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${AIRTABLE_PAT}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fields: {
        CleanURL: cleanUrl
      }
    })
  });
  
  return response.json();
}

async function processAllSales() {
  console.log('Fetching sales from Airtable...\n');
  const sales = await fetchAllSales();
  
  console.log(`Found ${sales.length} sales records\n`);
  
  for (const sale of sales) {
    const saleUrl = sale.fields.SaleURL;
    const existingCleanUrl = sale.fields.CleanURL;
    const company = sale.fields.Company;
    
    if (!saleUrl) {
      console.log(`⏭️  Skipping ${company} - no SaleURL`);
      continue;
    }
    
    // Skip if CleanURL exists and is different from SaleURL
    if (existingCleanUrl && existingCleanUrl !== saleUrl) {
      console.log(`⏭️  Skipping ${company} - CleanURL already exists`);
      continue;
    }
    
    console.log(`🔄 Processing ${company}...`);
    console.log(`   Tracking URL: ${saleUrl.substring(0, 60)}...`);
    
    const cleanUrl = getCleanUrl(saleUrl);
    
    if (cleanUrl && cleanUrl !== saleUrl) {
      console.log(`   ✅ Clean URL: ${cleanUrl.substring(0, 80)}...`);
      await updateCleanUrl(sale.id, cleanUrl);
      console.log(`   ✅ Updated in Airtable\n`);
    } else if (cleanUrl === saleUrl) {
      console.log(`   ℹ️  No redirect - URL is already clean`);
      await updateCleanUrl(sale.id, cleanUrl);
      console.log(`   ✅ Updated in Airtable\n`);
    } else {
      console.log(`   ❌ Failed to get clean URL\n`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n✅ Finished processing all sales!');
}

processAllSales().catch(console.error);
