import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ============================================
// COMPANIES (Brands/Shops)
// ============================================

export async function getAllCompanies() {
  const result = await pool.query(`
    SELECT * FROM companies 
    ORDER BY name ASC
  `);
  return result.rows;
}

export async function getCompanyById(id) {
  const result = await pool.query(
    'SELECT * FROM companies WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function getCompanyByAirtableId(airtableId) {
  const result = await pool.query(
    'SELECT * FROM companies WHERE airtable_id = $1',
    [airtableId]
  );
  return result.rows[0] || null;
}

export async function getCompanyByName(name) {
  const result = await pool.query(
    'SELECT * FROM companies WHERE LOWER(name) = LOWER($1)',
    [name]
  );
  return result.rows[0] || null;
}

export async function getHighPriorityCompanies() {
  const result = await pool.query(`
    SELECT * FROM companies 
    WHERE priority = 'High'
    ORDER BY name ASC
  `);
  return result.rows;
}

export async function createCompany(data) {
  const result = await pool.query(`
    INSERT INTO companies (
      airtable_id, name, type, price_range, category, values, 
      max_womens_size, description, website, shopmy_url, urls, priority
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    RETURNING *
  `, [
    data.airtableId || null,
    data.name,
    data.type || null,
    data.priceRange || null,
    data.category || [],
    data.values || [],
    data.maxWomensSize || null,
    data.description || null,
    data.website || null,
    data.shopmyUrl || null,
    data.urls || [],
    data.priority || 'Normal'
  ]);
  return result.rows[0];
}

export async function updateCompany(id, data) {
  const setClauses = [];
  const values = [];
  let paramCount = 1;

  const fieldMap = {
    name: 'name',
    type: 'type',
    priceRange: 'price_range',
    category: 'category',
    values: 'values',
    maxWomensSize: 'max_womens_size',
    description: 'description',
    website: 'website',
    shopmyUrl: 'shopmy_url',
    urls: 'urls',
    priority: 'priority'
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      setClauses.push(`${column} = $${paramCount}`);
      values.push(data[key]);
      paramCount++;
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await pool.query(`
    UPDATE companies 
    SET ${setClauses.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `, values);
  
  return result.rows[0] || null;
}

// ============================================
// SALES
// ============================================

export async function getAllSales() {
  const result = await pool.query(`
    SELECT s.*, c.name as company_name, c.type as company_type,
           c.price_range, c.category, c.values, c.max_womens_size,
           c.description as company_description
    FROM sales s
    LEFT JOIN companies c ON s.company_id = c.id
    ORDER BY s.created_at DESC
  `);
  return result.rows;
}

export async function getLiveSales() {
  const result = await pool.query(`
    SELECT s.*, c.name as company_name, c.type as company_type,
           c.price_range, c.category, c.values, c.max_womens_size,
           c.description as company_description, c.shopmy_url as company_shopmy_url
    FROM sales s
    LEFT JOIN companies c ON s.company_id = c.id
    WHERE s.live = 'YES'
    ORDER BY s.created_at DESC
  `);
  return result.rows;
}

export async function getSaleById(id) {
  const result = await pool.query(`
    SELECT s.*, c.name as company_name
    FROM sales s
    LEFT JOIN companies c ON s.company_id = c.id
    WHERE s.id = $1
  `, [id]);
  return result.rows[0] || null;
}

export async function getSaleByAirtableId(airtableId) {
  const result = await pool.query(`
    SELECT s.*, c.name as company_name
    FROM sales s
    LEFT JOIN companies c ON s.company_id = c.id
    WHERE s.airtable_id = $1
  `, [airtableId]);
  return result.rows[0] || null;
}

export async function createSale(data) {
  const result = await pool.query(`
    INSERT INTO sales (
      airtable_id, company_id, original_company_name, sale_name,
      percent_off, promo_code, start_date, end_date, sale_url, clean_url,
      live, featured, featured_asset_url, featured_asset_date
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `, [
    data.airtableId || null,
    data.companyId || null,
    data.originalCompanyName || null,
    data.saleName || null,
    data.percentOff || null,
    data.promoCode || null,
    data.startDate || null,
    data.endDate || null,
    data.saleUrl || null,
    data.cleanUrl || null,
    data.live || 'NO',
    data.featured || 'NO',
    data.featuredAssetUrl || null,
    data.featuredAssetDate || null
  ]);
  return result.rows[0];
}

export async function updateSale(id, data) {
  const setClauses = [];
  const values = [];
  let paramCount = 1;

  const fieldMap = {
    companyId: 'company_id',
    originalCompanyName: 'original_company_name',
    saleName: 'sale_name',
    percentOff: 'percent_off',
    promoCode: 'promo_code',
    startDate: 'start_date',
    endDate: 'end_date',
    saleUrl: 'sale_url',
    cleanUrl: 'clean_url',
    live: 'live',
    featured: 'featured',
    featuredAssetUrl: 'featured_asset_url',
    featuredAssetDate: 'featured_asset_date'
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      setClauses.push(`${column} = $${paramCount}`);
      values.push(data[key]);
      paramCount++;
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await pool.query(`
    UPDATE sales 
    SET ${setClauses.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `, values);
  
  return result.rows[0] || null;
}

export async function getSalesWithPickCounts() {
  const result = await pool.query(`
    SELECT s.*, 
           c.name as company_name,
           COUNT(p.id) as picks_count
    FROM sales s
    LEFT JOIN companies c ON s.company_id = c.id
    LEFT JOIN picks p ON p.sale_id = s.id
    GROUP BY s.id, c.name
    ORDER BY s.created_at DESC
  `);
  return result.rows;
}

// ============================================
// PICKS
// ============================================

export async function getPicksBySaleId(saleId) {
  const result = await pool.query(`
    SELECT * FROM picks 
    WHERE sale_id = $1
    ORDER BY created_at DESC
  `, [saleId]);
  return result.rows;
}

export async function getPickById(id) {
  const result = await pool.query(
    'SELECT * FROM picks WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function createPick(data) {
  const result = await pool.query(`
    INSERT INTO picks (
      airtable_id, sale_id, product_name, brand, product_url, image_url,
      original_price, sale_price, percent_off, percent_off_override,
      shopmy_url, confidence, entry_type, sizes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *
  `, [
    data.airtableId || null,
    data.saleId,
    data.productName || null,
    data.brand || null,
    data.productUrl || null,
    data.imageUrl || null,
    data.originalPrice || null,
    data.salePrice || null,
    data.percentOff || null,
    data.percentOffOverride || null,
    data.shopmyUrl || null,
    data.confidence || null,
    data.entryType || 'manual',
    data.sizes || []
  ]);
  return result.rows[0];
}

export async function createPicksBatch(picks) {
  if (!picks || picks.length === 0) return [];
  
  const results = [];
  for (const pick of picks) {
    const created = await createPick(pick);
    results.push(created);
  }
  return results;
}

export async function updatePick(id, data) {
  const setClauses = [];
  const values = [];
  let paramCount = 1;

  const fieldMap = {
    saleId: 'sale_id',
    productName: 'product_name',
    brand: 'brand',
    productUrl: 'product_url',
    imageUrl: 'image_url',
    originalPrice: 'original_price',
    salePrice: 'sale_price',
    percentOff: 'percent_off',
    percentOffOverride: 'percent_off_override',
    shopmyUrl: 'shopmy_url',
    confidence: 'confidence',
    entryType: 'entry_type',
    sizes: 'sizes'
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) {
      setClauses.push(`${column} = $${paramCount}`);
      values.push(data[key]);
      paramCount++;
    }
  }

  if (setClauses.length === 0) return null;

  setClauses.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await pool.query(`
    UPDATE picks 
    SET ${setClauses.join(', ')}
    WHERE id = $${paramCount}
    RETURNING *
  `, values);
  
  return result.rows[0] || null;
}

export async function deletePick(id) {
  const result = await pool.query(
    'DELETE FROM picks WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0] || null;
}

export async function deletePicksBySaleId(saleId) {
  const result = await pool.query(
    'DELETE FROM picks WHERE sale_id = $1 RETURNING *',
    [saleId]
  );
  return result.rows;
}

// ============================================
// PENDING BRANDS (Approval Workflow)
// ============================================

export async function getAllPendingBrands() {
  const result = await pool.query(`
    SELECT * FROM pending_brands 
    ORDER BY created_at DESC
  `);
  return result.rows;
}

export async function getPendingBrandById(id) {
  const result = await pool.query(
    'SELECT * FROM pending_brands WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
}

export async function createPendingBrand(data) {
  const result = await pool.query(`
    INSERT INTO pending_brands (
      name, type, price_range, category, values, max_womens_size,
      description, url, airtable_record_id, source
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    data.name,
    data.type || null,
    data.priceRange || null,
    data.category || [],
    data.values || [],
    data.maxWomensSize || null,
    data.description || null,
    data.url || null,
    data.airtableRecordId || null,
    data.source || null
  ]);
  return result.rows[0];
}

export async function deletePendingBrand(id) {
  const result = await pool.query(
    'DELETE FROM pending_brands WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0] || null;
}

// ============================================
// REJECTED EMAILS
// ============================================

export async function getAllRejectedEmails() {
  const result = await pool.query(`
    SELECT * FROM rejected_emails 
    ORDER BY rejected_at DESC
  `);
  return result.rows;
}

export async function createRejectedEmail(data) {
  const result = await pool.query(`
    INSERT INTO rejected_emails (
      email_id, subject, from_address, reason, extracted_data
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [
    data.emailId || null,
    data.subject || null,
    data.fromAddress || null,
    data.reason || null,
    data.extractedData || null
  ]);
  return result.rows[0];
}

// ============================================
// REJECTED BRANDS (for recovery)
// ============================================

export async function getAllRejectedBrands() {
  const result = await pool.query(`
    SELECT * FROM rejected_brands 
    ORDER BY rejected_at DESC
  `);
  return result.rows;
}

export async function createRejectedBrand(data) {
  const result = await pool.query(`
    INSERT INTO rejected_brands (
      name, type, price_range, category, values, max_womens_size,
      description, url, airtable_record_id, original_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *
  `, [
    data.name,
    data.type || null,
    data.priceRange || null,
    data.category || [],
    data.values || [],
    data.maxWomensSize || null,
    data.description || null,
    data.url || null,
    data.airtableRecordId || null,
    data.originalData || null
  ]);
  return result.rows[0];
}

export async function deleteRejectedBrand(id) {
  const result = await pool.query(
    'DELETE FROM rejected_brands WHERE id = $1 RETURNING *',
    [id]
  );
  return result.rows[0] || null;
}

export async function getAndRemoveRejectedBrand(id) {
  const brand = await pool.query(
    'SELECT * FROM rejected_brands WHERE id = $1',
    [id]
  );
  if (brand.rows[0]) {
    await pool.query('DELETE FROM rejected_brands WHERE id = $1', [id]);
    return brand.rows[0];
  }
  return null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

export async function getLiveSalesWithPicks() {
  const sales = await getLiveSales();
  
  for (const sale of sales) {
    sale.picks = await getPicksBySaleId(sale.id);
  }
  
  return sales;
}

export async function checkDuplicateSale(cleanUrl) {
  if (!cleanUrl) return null;
  
  const result = await pool.query(`
    SELECT * FROM sales 
    WHERE clean_url = $1 AND live = 'YES'
    LIMIT 1
  `, [cleanUrl]);
  
  return result.rows[0] || null;
}

export { pool };
