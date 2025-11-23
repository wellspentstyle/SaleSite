import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PENDING_SALES_FILE = path.join(__dirname, 'pending-sales.json');
const SETTINGS_FILE = path.join(__dirname, 'approval-settings.json');

function readPendingSales() {
  try {
    if (fs.existsSync(PENDING_SALES_FILE)) {
      const data = fs.readFileSync(PENDING_SALES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading pending sales:', error);
  }
  return [];
}

function writePendingSales(sales) {
  try {
    fs.writeFileSync(PENDING_SALES_FILE, JSON.stringify(sales, null, 2));
  } catch (error) {
    console.error('Error writing pending sales:', error);
  }
}

function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error reading settings:', error);
  }
  return { approvalsEnabled: false };
}

function writeSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error writing settings:', error);
  }
}

export function addPendingSale(saleData) {
  const sales = readPendingSales();
  const newSale = {
    id: Date.now().toString(),
    ...saleData,
    receivedAt: new Date().toISOString()
  };
  sales.push(newSale);
  writePendingSales(sales);
  return newSale;
}

export function getPendingSales() {
  return readPendingSales();
}

export function removePendingSale(id) {
  const sales = readPendingSales();
  const filtered = sales.filter(s => s.id !== id);
  writePendingSales(filtered);
  return sales.find(s => s.id === id);
}

export function isApprovalsEnabled() {
  const settings = readSettings();
  return settings.approvalsEnabled === true;
}

export function setApprovalsEnabled(enabled) {
  writeSettings({ approvalsEnabled: enabled });
}

export function getApprovalSettings() {
  return readSettings();
}
