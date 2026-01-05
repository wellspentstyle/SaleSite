import pg from 'pg';
import fs from 'fs';
import { parse } from 'csv-parse/sync';

const { Client } = pg;

const RAILWAY_DB = 'postgresql://postgres:kCkEAtMFQJvSSWShsCIfzYvDsUaIwnyo@metro.proxy.rlwy.net:18678/railway';

async function updateExtraDiscounts() {
  console.log('📊 Updating extra discounts from CSV...\n');

  // Read and parse CSV
  const csvContent = fs.readFileSync('/Users/kariclark/Downloads/Active Sales.csv', 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true // Handle UTF-8 BOM
  });

  console.log(`📄 Found ${records.length} records in CSV\n`);

  // Filter records that have ExtraDiscount
  const recordsWithExtra = records.filter(r => r.ExtraDiscount && r.ExtraDiscount.trim() !== '');
  console.log(`🎯 ${recordsWithExtra.length} records have ExtraDiscount:\n`);

  recordsWithExtra.forEach(r => {
    console.log(`  - ${r.Company || r.OriginalCompanyName}: ${r.PercentOff}% + ${r.ExtraDiscount}% extra`);
  });
  console.log('');

  // Connect to Railway database
  const client = new Client({
    connectionString: RAILWAY_DB,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('🔗 Connected to Railway database\n');

    let updated = 0;
    let notFound = 0;

    for (const record of recordsWithExtra) {
      const companyName = record.OriginalCompanyName || record.Company;
      const extraDiscount = parseFloat(record.ExtraDiscount);
      const promoCode = record.PromoCode || null;

      if (!companyName) {
        console.log(`⚠️  Skipping record with no company name`);
        continue;
      }

      // Update sales for this company that are currently LIVE
      const result = await client.query(`
        UPDATE sales
        SET extra_discount = $1,
            promo_code = COALESCE(promo_code, $2)
        WHERE original_company_name = $3
          AND live = 'YES'
        RETURNING id, original_company_name, percent_off, extra_discount
      `, [extraDiscount, promoCode, companyName]);

      if (result.rowCount > 0) {
        console.log(`✅ Updated ${result.rowCount} sale(s) for ${companyName}`);
        result.rows.forEach(row => {
          console.log(`   Sale ID ${row.id}: ${row.percent_off}% + ${row.extra_discount}% extra`);
        });
        updated += result.rowCount;
      } else {
        console.log(`⚠️  No LIVE sales found for: ${companyName}`);
        notFound++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`  ✅ Updated: ${updated} sales`);
    console.log(`  ⚠️  Not found: ${notFound} companies`);

  } catch (error) {
    console.error('❌ Error updating extra discounts:', error);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

updateExtraDiscounts();
