import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REJECTED_EMAILS_FILE = path.join(__dirname, 'rejected-emails.json');
const MAX_REJECTED_EMAILS = 50; // Store last 50 rejected emails

export async function getRejectedEmails() {
  try {
    const data = await fs.readFile(REJECTED_EMAILS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

export async function addRejectedEmail({ brand, subject, reason, from }) {
  const emails = await getRejectedEmails();
  
  emails.unshift({
    id: `rejected_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    brand: brand || 'Unknown',
    subject: subject || 'No subject',
    reason: reason || 'Unknown reason',
    from: from || 'Unknown sender',
    timestamp: new Date().toISOString()
  });
  
  // Keep only the last N emails
  const trimmed = emails.slice(0, MAX_REJECTED_EMAILS);
  
  await fs.writeFile(REJECTED_EMAILS_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  
  console.log(`📭 Tracked rejected email: ${brand} - ${reason}`);
  
  return trimmed;
}
