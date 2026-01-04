import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const MAX_REJECTED_EMAILS = 50;

export async function getRejectedEmails() {
  try {
    const result = await pool.query(
      `SELECT id, email_id, subject, reason, from_address, extracted_data, rejected_at
       FROM rejected_emails
       ORDER BY rejected_at DESC
       LIMIT $1`,
      [MAX_REJECTED_EMAILS]
    );
    
    return result.rows.map(row => ({
      id: row.email_id || `rejected_${row.id}`,
      brand: row.extracted_data?.brand || 'Unknown',
      subject: row.subject || 'No subject',
      reason: row.reason || 'Unknown reason',
      from: row.from_address || 'Unknown sender',
      timestamp: row.rejected_at ? row.rejected_at.toISOString() : null
    }));
  } catch (error) {
    console.error('Error getting rejected emails from database:', error);
    return [];
  }
}

export async function addRejectedEmail({ brand, subject, reason, from }) {
  try {
    const emailId = `rejected_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    await pool.query(
      `INSERT INTO rejected_emails (email_id, subject, reason, from_address, extracted_data, rejected_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        emailId,
        subject || 'No subject',
        reason || 'Unknown reason',
        from || 'Unknown sender',
        JSON.stringify({ brand: brand || 'Unknown' }),
        new Date()
      ]
    );
    
    console.log(`📭 Tracked rejected email: ${brand} - ${reason}`);
    
    await pool.query(
      `DELETE FROM rejected_emails
       WHERE id NOT IN (
         SELECT id FROM rejected_emails ORDER BY rejected_at DESC LIMIT $1
       )`,
      [MAX_REJECTED_EMAILS]
    );
    
    return await getRejectedEmails();
  } catch (error) {
    console.error('Error adding rejected email to database:', error);
    throw error;
  }
}
