#!/usr/bin/env node
import 'dotenv/config';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;

const DRY_RUN = process.argv.includes('--dry-run');
const SINGLE_TEST = process.argv.includes('--test');

console.log('🔄 Airtable to PostgreSQL Migration Script');
console.log('==========================================');
if (DRY_RUN) console.log('🔍 DRY RUN MODE - No changes will be made');
if (SINGLE_TEST) console.log('🧪 TEST MODE - Only migrating first record of each type');
console.log('');

async function fetchAllAirtableRecords(tableName, params = {}) {
  const allRecords = [];
  let offset = null;
  
  do {
    const urlParams = new URLSearchParams(params);
    if (offset) urlParams.set('offset', offset);
    
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableName}?${urlParams}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
    });
    
    if (!response.ok) {
      throw new Error(`Airtable error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    allRecords.push(...data.records);
    offset = data.offset || null;
    
    // Rate limiting - wait 250ms between requests
    await new Promise(r => setTimeout(r, 250));
  } while (offset && !SINGLE_TEST);
  
  return SINGLE_TEST ? allRecords.slice(0, 1) : allRecords;
}

async function migrateCompanies() {
  console.log('📦 Fetching companies from Airtable...');
  const records = await fetchAllAirtableRecords('Companies');
  console.log(`   Found ${records.length} companies`);
  
  if (DRY_RUN) {
    console.log('   [DRY RUN] Would insert companies');
    return new Map();
  }
  
  const idMap = new Map(); // airtableId -> postgresId
  let inserted = 0;
  let skipped = 0;
  
  for (const record of records) {
    const f = record.fields;
    
    // Check if already exists
    const existing = await pool.query(
      'SELECT id FROM companies WHERE airtable_id = $1',
      [record.id]
    );
    
    if (existing.rows.length > 0) {
      idMap.set(record.id, existing.rows[0].id);
      skipped++;
      continue;
    }
    
    // Parse category and values arrays
    const category = Array.isArray(f.Category) ? f.Category : 
                     (f.Category ? [f.Category] : []);
    const values = Array.isArray(f.Values) ? f.Values : 
                   (f.Values ? [f.Values] : []);
    const urls = Array.isArray(f.URLs) ? f.URLs : 
                 (f.URLs ? [f.URLs] : []);
    
    const result = await pool.query(`
      INSERT INTO companies (
        airtable_id, name, type, price_range, category, values,
        max_womens_size, description, website, shopmy_url, urls, priority
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id
    `, [
      record.id,
      f.Name || 'Unknown',
      f.Type || null,
      Array.isArray(f.PriceRange) ? f.PriceRange[0] : f.PriceRange || null,
      category,
      values,
      Array.isArray(f.MaxWomensSize) ? f.MaxWomensSize[0] : f.MaxWomensSize || null,
      f.Description || null,
      f.Website || f.URL || null,
      f.ShopmyURL || null,
      urls,
      f.Priority || 'Normal'
    ]);
    
    idMap.set(record.id, result.rows[0].id);
    inserted++;
  }
  
  console.log(`   ✅ Inserted ${inserted} companies, skipped ${skipped} existing`);
  return idMap;
}

async function migrateSales(companyIdMap) {
  console.log('📦 Fetching sales from Airtable...');
  const records = await fetchAllAirtableRecords('Sales');
  console.log(`   Found ${records.length} sales`);
  
  if (DRY_RUN) {
    console.log('   [DRY RUN] Would insert sales');
    return new Map();
  }
  
  const idMap = new Map();
  let inserted = 0;
  let skipped = 0;
  
  for (const record of records) {
    const f = record.fields;
    
    // Check if already exists
    const existing = await pool.query(
      'SELECT id FROM sales WHERE airtable_id = $1',
      [record.id]
    );
    
    if (existing.rows.length > 0) {
      idMap.set(record.id, existing.rows[0].id);
      skipped++;
      continue;
    }
    
    // Get PostgreSQL company ID from Airtable company link
    let companyId = null;
    const companyLinks = f.Company || [];
    if (companyLinks.length > 0 && companyIdMap.has(companyLinks[0])) {
      companyId = companyIdMap.get(companyLinks[0]);
    }
    
    // Get company name from lookup field
    const companyName = f.CompanyName || f.OriginalCompanyName || null;
    
    const result = await pool.query(`
      INSERT INTO sales (
        airtable_id, company_id, original_company_name, sale_name,
        percent_off, promo_code, start_date, end_date, sale_url, clean_url,
        live, featured, featured_asset_url, featured_asset_date
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      record.id,
      companyId,
      companyName,
      f.SaleName || null,
      f.PercentOff || null,
      f.PromoCode || f.DiscountCode || null,
      f.StartDate || null,
      f.EndDate || null,
      f.SaleURL || null,
      f.CleanURL || null,
      f.Live || 'NO',
      f.Featured || 'NO',
      f.FeaturedAssetURL || null,
      f.FeaturedAssetDate || null
    ]);
    
    idMap.set(record.id, result.rows[0].id);
    inserted++;
  }
  
  console.log(`   ✅ Inserted ${inserted} sales, skipped ${skipped} existing`);
  return idMap;
}

async function migratePicks(saleIdMap) {
  console.log('📦 Fetching picks from Airtable...');
  const records = await fetchAllAirtableRecords('Picks');
  console.log(`   Found ${records.length} picks`);
  
  if (DRY_RUN) {
    console.log('   [DRY RUN] Would insert picks');
    return;
  }
  
  let inserted = 0;
  let skipped = 0;
  let noSaleLink = 0;
  
  for (const record of records) {
    const f = record.fields;
    
    // Check if already exists
    const existing = await pool.query(
      'SELECT id FROM picks WHERE airtable_id = $1',
      [record.id]
    );
    
    if (existing.rows.length > 0) {
      skipped++;
      continue;
    }
    
    // Get PostgreSQL sale ID from Airtable sale link
    const saleLinks = f.SaleID || [];
    let saleId = null;
    
    if (saleLinks.length > 0 && saleIdMap.has(saleLinks[0])) {
      saleId = saleIdMap.get(saleLinks[0]);
    }
    
    if (!saleId) {
      noSaleLink++;
      continue; // Skip picks without a valid sale link
    }
    
    await pool.query(`
      INSERT INTO picks (
        airtable_id, sale_id, product_name, brand, product_url, image_url,
        original_price, sale_price, percent_off, percent_off_override,
        shopmy_url, confidence, entry_type, sizes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `, [
      record.id,
      saleId,
      f.ProductName || null,
      f.Brand || null,
      f.ProductURL || null,
      f.ImageURL || null,
      f.OriginalPrice || null,
      f.SalePrice || null,
      f.PercentOff || null,
      f.PercentOffOverride || null,
      f.ShopMyURL || null,
      f.Confidence || null,
      f.EntryType || 'migrated',
      f.Sizes || []
    ]);
    
    inserted++;
  }
  
  console.log(`   ✅ Inserted ${inserted} picks, skipped ${skipped} existing, ${noSaleLink} without sale link`);
}

async function showStats() {
  console.log('\n📊 Current PostgreSQL Database Stats:');
  
  const tables = ['companies', 'sales', 'picks', 'pending_brands', 'rejected_emails', 'rejected_brands'];
  
  for (const table of tables) {
    const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
    console.log(`   ${table}: ${result.rows[0].count} records`);
  }
}

async function main() {
  try {
    if (!AIRTABLE_PAT || !AIRTABLE_BASE_ID) {
      console.error('❌ Missing AIRTABLE_PAT or AIRTABLE_BASE_ID environment variables');
      process.exit(1);
    }
    
    // Migrate in order (companies first, then sales, then picks)
    const companyIdMap = await migrateCompanies();
    const saleIdMap = await migrateSales(companyIdMap);
    await migratePicks(saleIdMap);
    
    await showStats();
    
    console.log('\n✅ Migration complete!');
    if (DRY_RUN) {
      console.log('   This was a dry run. Run without --dry-run to actually migrate data.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
