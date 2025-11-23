import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function uuidv4() {
  return crypto.randomUUID();
}

const DRAFTS_FILE = path.join(__dirname, 'finalize-drafts.json');

async function ensureDraftsFile() {
  try {
    await fs.access(DRAFTS_FILE);
  } catch {
    await fs.writeFile(DRAFTS_FILE, JSON.stringify({ drafts: [] }, null, 2));
  }
}

async function getDrafts() {
  await ensureDraftsFile();
  const data = await fs.readFile(DRAFTS_FILE, 'utf-8');
  return JSON.parse(data);
}

async function saveDrafts(data) {
  await fs.writeFile(DRAFTS_FILE, JSON.stringify(data, null, 2));
}

async function getAllDrafts() {
  const data = await getDrafts();
  return data.drafts.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function getDraftById(draftId) {
  const data = await getDrafts();
  return data.drafts.find(d => d.id === draftId);
}

async function saveDraft(draft) {
  const data = await getDrafts();
  const now = new Date().toISOString();
  
  const existingIndex = data.drafts.findIndex(d => d.id === draft.id);
  
  if (existingIndex >= 0) {
    // Preserve createdAt and merge updates
    const existing = data.drafts[existingIndex];
    data.drafts[existingIndex] = {
      id: existing.id,
      saleId: draft.saleId,
      saleName: draft.saleName,
      salePercentOff: draft.salePercentOff,
      picks: draft.picks || [],
      manualEntries: draft.manualEntries || [],
      failedUrls: draft.failedUrls || [],
      customPercentOff: draft.customPercentOff || '',
      individualCustomPercent: draft.individualCustomPercent || {},
      createdAt: existing.createdAt, // Preserve original creation time
      updatedAt: now
    };
  } else {
    const newDraft = {
      id: draft.id || uuidv4(),
      saleId: draft.saleId,
      saleName: draft.saleName,
      salePercentOff: draft.salePercentOff,
      picks: draft.picks || [],
      manualEntries: draft.manualEntries || [],
      failedUrls: draft.failedUrls || [],
      customPercentOff: draft.customPercentOff || '',
      individualCustomPercent: draft.individualCustomPercent || {},
      createdAt: now,
      updatedAt: now
    };
    data.drafts.push(newDraft);
  }
  
  await saveDrafts(data);
  
  return existingIndex >= 0 ? data.drafts[existingIndex] : data.drafts[data.drafts.length - 1];
}

async function deleteDraft(draftId) {
  const data = await getDrafts();
  const initialLength = data.drafts.length;
  data.drafts = data.drafts.filter(d => d.id !== draftId);
  
  if (data.drafts.length < initialLength) {
    await saveDrafts(data);
    return true;
  }
  return false;
}

export {
  getAllDrafts,
  getDraftById,
  saveDraft,
  deleteDraft
};
