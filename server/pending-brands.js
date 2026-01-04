import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PENDING_BRANDS_FILE = path.join(__dirname, 'pending-brands.json');

async function ensureFileExists() {
  try {
    await fs.access(PENDING_BRANDS_FILE);
  } catch {
    await fs.writeFile(PENDING_BRANDS_FILE, '[]', 'utf-8');
  }
}

export async function getPendingBrands() {
  await ensureFileExists();
  const data = await fs.readFile(PENDING_BRANDS_FILE, 'utf-8');
  return JSON.parse(data);
}

export async function addPendingBrand(brandData) {
  // Filter out stores/retailers - only allow brands
  const storeTypes = ['shop', 'store', 'retailer', 'marketplace', 'department store'];
  const brandType = (brandData.type || '').toLowerCase();
  if (storeTypes.some(t => brandType.includes(t))) {
    console.log(`⚠️ Skipping store/retailer: ${brandData.name} (type: ${brandData.type})`);
    return await getPendingBrands();
  }
  
  // Also check name for common retailers
  const retailerNames = ['saks', 'nordstrom', 'neiman marcus', 'bergdorf', 'net-a-porter', 'matchesfashion', 'farfetch', 'ssense', 'mytheresa', 'wolf and badger'];
  const lowerName = (brandData.name || '').toLowerCase();
  if (retailerNames.some(r => lowerName.includes(r))) {
    console.log(`⚠️ Skipping known retailer: ${brandData.name}`);
    return await getPendingBrands();
  }
  
  const brands = await getPendingBrands();
  
  const existing = brands.find(b => 
    b.name.toLowerCase() === brandData.name.toLowerCase()
  );
  
  if (existing) {
    Object.assign(existing, {
      ...brandData,
      updatedAt: new Date().toISOString()
    });
  } else {
    brands.push({
      ...brandData,
      id: `brand_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString()
    });
  }
  
  await fs.writeFile(PENDING_BRANDS_FILE, JSON.stringify(brands, null, 2), 'utf-8');
  return brands;
}

export async function removePendingBrand(brandId) {
  const brands = await getPendingBrands();
  const filtered = brands.filter(b => b.id !== brandId);
  await fs.writeFile(PENDING_BRANDS_FILE, JSON.stringify(filtered, null, 2), 'utf-8');
  return filtered;
}

export async function updatePendingBrand(brandId, updates) {
  const brands = await getPendingBrands();
  const brand = brands.find(b => b.id === brandId);
  
  if (brand) {
    Object.assign(brand, updates, { updatedAt: new Date().toISOString() });
    await fs.writeFile(PENDING_BRANDS_FILE, JSON.stringify(brands, null, 2), 'utf-8');
  }
  
  return brands;
}
