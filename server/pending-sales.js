import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function addPendingSale(saleData) {
  const saleId = Date.now().toString();
  const receivedAt = new Date();
  
  try {
    const result = await pool.query(
      `INSERT INTO pending_sales (
        sale_id, company, percent_off, sale_url, clean_url, discount_code,
        start_date, end_date, confidence, reasoning, company_record_id,
        email_from, email_subject, missing_url, url_source, received_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *`,
      [
        saleId,
        saleData.company,
        saleData.percentOff,
        saleData.saleUrl,
        saleData.cleanUrl,
        saleData.discountCode,
        saleData.startDate,
        saleData.endDate,
        saleData.confidence || 100,
        saleData.reasoning,
        saleData.companyRecordId,
        saleData.emailFrom,
        saleData.emailSubject,
        saleData.missingUrl || false,
        saleData.urlSource,
        receivedAt
      ]
    );
    
    return mapRowToSale(result.rows[0]);
  } catch (error) {
    console.error('Error adding pending sale to database:', error);
    throw error;
  }
}

export async function getPendingSales() {
  try {
    const result = await pool.query(
      'SELECT * FROM pending_sales ORDER BY received_at DESC'
    );
    return result.rows.map(mapRowToSale);
  } catch (error) {
    console.error('Error getting pending sales from database:', error);
    return [];
  }
}

export async function removePendingSale(id) {
  try {
    const result = await pool.query(
      'DELETE FROM pending_sales WHERE sale_id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length > 0) {
      return mapRowToSale(result.rows[0]);
    }
    return null;
  } catch (error) {
    console.error('Error removing pending sale from database:', error);
    throw error;
  }
}

export async function isApprovalsEnabled() {
  try {
    const result = await pool.query(
      "SELECT setting_value FROM approval_settings WHERE setting_key = 'approvalsEnabled'"
    );
    return result.rows.length > 0 && result.rows[0].setting_value === true;
  } catch (error) {
    console.error('Error checking approvals enabled:', error);
    return false;
  }
}

export async function setApprovalsEnabled(enabled) {
  try {
    await pool.query(
      `INSERT INTO approval_settings (setting_key, setting_value) 
       VALUES ('approvalsEnabled', $1)
       ON CONFLICT (setting_key) DO UPDATE SET setting_value = $1`,
      [enabled]
    );
  } catch (error) {
    console.error('Error setting approvals enabled:', error);
    throw error;
  }
}

export async function getApprovalSettings() {
  try {
    const result = await pool.query(
      "SELECT setting_value FROM approval_settings WHERE setting_key = 'approvalsEnabled'"
    );
    return {
      approvalsEnabled: result.rows.length > 0 && result.rows[0].setting_value === true
    };
  } catch (error) {
    console.error('Error getting approval settings:', error);
    return { approvalsEnabled: false };
  }
}

function mapRowToSale(row) {
  return {
    id: row.sale_id,
    company: row.company,
    percentOff: row.percent_off,
    saleUrl: row.sale_url,
    cleanUrl: row.clean_url,
    discountCode: row.discount_code,
    startDate: row.start_date ? row.start_date.toISOString().split('T')[0] : null,
    endDate: row.end_date ? row.end_date.toISOString().split('T')[0] : null,
    confidence: row.confidence,
    reasoning: row.reasoning,
    companyRecordId: row.company_record_id,
    emailFrom: row.email_from,
    emailSubject: row.email_subject,
    missingUrl: row.missing_url,
    urlSource: row.url_source,
    receivedAt: row.received_at ? row.received_at.toISOString() : null
  };
}
