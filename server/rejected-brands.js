import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REJECTED_BRANDS_FILE = path.join(__dirname, 'rejected-brands.json');
const MAX_REJECTED_BRANDS = 50;

export async function getRejectedBrands() {
  try {
    const data = await fs.readFile(REJECTED_BRANDS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
}

export async function addRejectedBrand(brandData) {
  const brands = await getRejectedBrands();
  
  brands.unshift({
    ...brandData,
    rejectedAt: new Date().toISOString()
  });
  
  const trimmed = brands.slice(0, MAX_REJECTED_BRANDS);
  
  await fs.writeFile(REJECTED_BRANDS_FILE, JSON.stringify(trimmed, null, 2), 'utf-8');
  
  console.log(`🚫 Tracked rejected brand: ${brandData.name}`);
  
  return trimmed;
}

export async function removeRejectedBrand(brandId) {
  const brands = await getRejectedBrands();
  const filtered = brands.filter(b => b.id !== brandId);
  await fs.writeFile(REJECTED_BRANDS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return filtered;
}

export async function getAndRemoveRejectedBrand(brandId) {
  const brands = await getRejectedBrands();
  const brand = brands.find(b => b.id === brandId);
  
  if (brand) {
    const filtered = brands.filter(b => b.id !== brandId);
    await fs.writeFile(REJECTED_BRANDS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  }
  
  return brand;
}
