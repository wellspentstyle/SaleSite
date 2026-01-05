import pg from 'pg';
const { Client } = pg;

const REPLIT_DB = 'postgresql://neondb_owner:npg_QA31BlTfCesX@ep-green-king-ah4x7wxc.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require';
const RAILWAY_DB = 'postgresql://postgres:kCkEAtMFQJvSSWShsCIfzYvDsUaIwnyo@metro.proxy.rlwy.net:18678/railway';

async function migrateData() {
  console.log('🚀 Starting data migration from Replit to Railway...\n');

  // Connect to both databases
  const sourceClient = new Client({ connectionString: REPLIT_DB });
  const destClient = new Client({
    connectionString: RAILWAY_DB,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔗 Connecting to Replit database...');
    await sourceClient.connect();
    console.log('✅ Connected to Replit\n');

    console.log('🔗 Connecting to Railway database...');
    await destClient.connect();
    console.log('✅ Connected to Railway\n');

    // Migrate companies first (no dependencies)
    console.log('📦 Migrating COMPANIES table...');
    const companiesResult = await sourceClient.query('SELECT * FROM companies ORDER BY id');
    console.log(`   Found ${companiesResult.rows.length} companies`);

    if (companiesResult.rows.length > 0) {
      for (const company of companiesResult.rows) {
        await destClient.query(`
          INSERT INTO companies (
            id, airtable_id, name, type, price_range, category, values,
            max_womens_size, description, website, shopmy_url, urls,
            priority, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (airtable_id) DO UPDATE SET
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            price_range = EXCLUDED.price_range,
            category = EXCLUDED.category,
            values = EXCLUDED.values,
            max_womens_size = EXCLUDED.max_womens_size,
            description = EXCLUDED.description,
            website = EXCLUDED.website,
            shopmy_url = EXCLUDED.shopmy_url,
            urls = EXCLUDED.urls,
            priority = EXCLUDED.priority,
            updated_at = EXCLUDED.updated_at
        `, [
          company.id, company.airtable_id, company.name, company.type,
          company.price_range, company.category, company.values,
          company.max_womens_size, company.description, company.website,
          company.shopmy_url, company.urls, company.priority,
          company.created_at, company.updated_at
        ]);
      }

      // Update sequence
      const maxId = Math.max(...companiesResult.rows.map(r => r.id));
      await destClient.query(`SELECT setval('companies_id_seq', $1)`, [maxId]);

      console.log(`✅ Migrated ${companiesResult.rows.length} companies\n`);
    }

    // Migrate sales (depends on companies)
    console.log('📦 Migrating SALES table...');
    const salesResult = await sourceClient.query('SELECT * FROM sales ORDER BY id');
    console.log(`   Found ${salesResult.rows.length} sales`);

    if (salesResult.rows.length > 0) {
      for (const sale of salesResult.rows) {
        await destClient.query(`
          INSERT INTO sales (
            id, airtable_id, company_id, original_company_name, sale_name,
            percent_off, promo_code, start_date, end_date, sale_url,
            clean_url, live, featured, featured_asset_url, featured_asset_date,
            extra_discount, image_url, original_created_at, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
          ON CONFLICT (airtable_id) DO UPDATE SET
            company_id = EXCLUDED.company_id,
            original_company_name = EXCLUDED.original_company_name,
            sale_name = EXCLUDED.sale_name,
            percent_off = EXCLUDED.percent_off,
            promo_code = EXCLUDED.promo_code,
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            sale_url = EXCLUDED.sale_url,
            clean_url = EXCLUDED.clean_url,
            live = EXCLUDED.live,
            featured = EXCLUDED.featured,
            featured_asset_url = EXCLUDED.featured_asset_url,
            featured_asset_date = EXCLUDED.featured_asset_date,
            extra_discount = EXCLUDED.extra_discount,
            image_url = EXCLUDED.image_url,
            original_created_at = EXCLUDED.original_created_at,
            updated_at = EXCLUDED.updated_at
        `, [
          sale.id, sale.airtable_id, sale.company_id, sale.original_company_name,
          sale.sale_name, sale.percent_off, sale.promo_code, sale.start_date,
          sale.end_date, sale.sale_url, sale.clean_url, sale.live, sale.featured,
          sale.featured_asset_url, sale.featured_asset_date, sale.extra_discount,
          sale.image_url, sale.original_created_at, sale.created_at, sale.updated_at
        ]);
      }

      // Update sequence
      const maxId = Math.max(...salesResult.rows.map(r => r.id));
      await destClient.query(`SELECT setval('sales_id_seq', $1)`, [maxId]);

      console.log(`✅ Migrated ${salesResult.rows.length} sales\n`);
    }

    // Migrate picks (depends on sales)
    console.log('📦 Migrating PICKS table...');
    const picksResult = await sourceClient.query('SELECT * FROM picks ORDER BY id');
    console.log(`   Found ${picksResult.rows.length} picks`);

    if (picksResult.rows.length > 0) {
      for (const pick of picksResult.rows) {
        await destClient.query(`
          INSERT INTO picks (
            id, airtable_id, sale_id, product_name, brand, product_url,
            image_url, original_price, sale_price, percent_off,
            percent_off_override, shopmy_url, confidence, entry_type,
            sizes, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (airtable_id) DO UPDATE SET
            sale_id = EXCLUDED.sale_id,
            product_name = EXCLUDED.product_name,
            brand = EXCLUDED.brand,
            product_url = EXCLUDED.product_url,
            image_url = EXCLUDED.image_url,
            original_price = EXCLUDED.original_price,
            sale_price = EXCLUDED.sale_price,
            percent_off = EXCLUDED.percent_off,
            percent_off_override = EXCLUDED.percent_off_override,
            shopmy_url = EXCLUDED.shopmy_url,
            confidence = EXCLUDED.confidence,
            entry_type = EXCLUDED.entry_type,
            sizes = EXCLUDED.sizes,
            updated_at = EXCLUDED.updated_at
        `, [
          pick.id, pick.airtable_id, pick.sale_id, pick.product_name,
          pick.brand, pick.product_url, pick.image_url, pick.original_price,
          pick.sale_price, pick.percent_off, pick.percent_off_override,
          pick.shopmy_url, pick.confidence, pick.entry_type, pick.sizes,
          pick.created_at, pick.updated_at
        ]);
      }

      // Update sequence
      const maxId = Math.max(...picksResult.rows.map(r => r.id));
      await destClient.query(`SELECT setval('picks_id_seq', $1)`, [maxId]);

      console.log(`✅ Migrated ${picksResult.rows.length} picks\n`);
    }

    // Summary
    console.log('🎉 Migration completed successfully!\n');
    console.log('Summary:');
    console.log(`  📊 Companies: ${companiesResult.rows.length}`);
    console.log(`  📊 Sales: ${salesResult.rows.length}`);
    console.log(`  📊 Picks: ${picksResult.rows.length}`);
    console.log(`  📊 Total records: ${companiesResult.rows.length + salesResult.rows.length + picksResult.rows.length}`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await sourceClient.end();
    await destClient.end();
    console.log('\n🔌 Database connections closed');
  }
}

migrateData();
