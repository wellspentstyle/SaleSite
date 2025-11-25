import sharp from 'sharp';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { uploadToGoogleDrive } from './google-drive-uploader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASSET_WIDTH = 1080;
const ASSET_HEIGHT = 1350;

const HEADER_COLORS = ['#273536', '#145fe9', '#fe6731', '#d2972f'];

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;

// Auto-detect environment and use appropriate Airtable base
const isProduction = !!process.env.REPLIT_DEPLOYMENT;
const AIRTABLE_BASE_ID = isProduction 
  ? process.env.AIRTABLE_BASE_ID 
  : (process.env.AIRTABLE_BASE_ID_DEV || process.env.AIRTABLE_BASE_ID);

function getRandomColor() {
  return HEADER_COLORS[Math.floor(Math.random() * HEADER_COLORS.length)];
}

// Calculate font size to fit text within max width
function calculateFontSize(text, baseFontSize, maxWidth, avgCharWidth = 0.6) {
  const approxTextWidth = text.length * baseFontSize * avgCharWidth;
  if (approxTextWidth <= maxWidth) {
    return baseFontSize;
  }
  // Scale down to fit, with a minimum font size
  const scaleFactor = maxWidth / approxTextWidth;
  return Math.max(Math.floor(baseFontSize * scaleFactor), Math.floor(baseFontSize * 0.4));
}

async function fetchImageAsBuffer(imageUrl, productUrl = null) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
  
  if (productUrl) {
    headers['Referer'] = productUrl;
  }

  const response = await fetch(imageUrl, { headers });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function fetchSaleWithPicks(saleId) {
  const saleUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
  const saleResponse = await fetch(saleUrl, {
    headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
  });
  
  if (!saleResponse.ok) {
    throw new Error(`Failed to fetch sale: ${saleResponse.statusText}`);
  }
  
  const saleData = await saleResponse.json();
  const sale = saleData.fields;
  
  const picksUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Picks?filterByFormula=FIND("${saleId}",{SaleRecordIDs}&'')`;
  const picksResponse = await fetch(picksUrl, {
    headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
  });
  
  if (!picksResponse.ok) {
    throw new Error(`Failed to fetch picks: ${picksResponse.statusText}`);
  }
  
  const picksData = await picksResponse.json();
  const allPicks = picksData.records || [];
  
  const validPicks = allPicks
    .filter(record => {
      const fields = record.fields || {};
      return fields.ImageURL && fields.ProductName;
    })
    .slice(0, 3);
  
  return { sale, picks: validPicks };
}

export async function generateFeaturedSaleAsset(saleId) {
  try {
    console.log(`🎨 Generating featured sale asset for sale ID: ${saleId}`);
    
    const { sale, picks } = await fetchSaleWithPicks(saleId);
    
    // Use OriginalCompanyName (plain text) instead of Company (linked record ID)
    const company = sale.OriginalCompanyName || sale.CompanyName || 'Sale';
    const percentOff = sale.PercentOff || 0;
    const endDate = sale.EndDate ? new Date(sale.EndDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : null;
    const discountCode = sale.DiscountCode || null;
    
    if (picks.length === 0) {
      throw new Error('No valid picks with images found for this sale');
    }
    
    if (picks.length < 3) {
      console.log(`   ⚠️  Only found ${picks.length} valid picks (need 3 for best layout)`);
    }
    
    console.log(`   Company: ${company}, ${percentOff}% off`);
    console.log(`   Found ${picks.length} valid picks`);
    
    const headerColor = getRandomColor();
    console.log(`   Header color: ${headerColor}`);
    
    const headerHeight = 450;
    const productAreaHeight = ASSET_HEIGHT - headerHeight;
    const productImageSize = Math.floor(ASSET_WIDTH / 3);
    
    let canvas = sharp({
      create: {
        width: ASSET_WIDTH,
        height: ASSET_HEIGHT,
        channels: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 }
      }
    });
    
    const companyUpper = company.toUpperCase();
    const percentOffText = `${percentOff}% OFF`;
    
    // Calculate dynamic font size for company name (max width ~960px with 60px padding)
    const companyFontSize = calculateFontSize(companyUpper, 90, 960);
    
    let headerInfoText = '';
    if (endDate && discountCode) {
      headerInfoText = `UNTIL ${endDate}\nPROMO CODE: ${discountCode}`;
    } else if (endDate) {
      headerInfoText = `UNTIL ${endDate}`;
    } else if (discountCode) {
      headerInfoText = `PROMO CODE: ${discountCode}`;
    }
    
    const headerSvg = `
      <svg width="${ASSET_WIDTH}" height="${headerHeight}">
        <rect width="100%" height="100%" fill="${headerColor}"/>
        
        <text 
          x="60" 
          y="120" 
          font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
          font-size="${companyFontSize}" 
          font-weight="900"
          letter-spacing="-2"
          fill="white"
          style="text-transform: uppercase;">
          ${companyUpper}
        </text>
        
        <text 
          x="60" 
          y="240" 
          font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
          font-size="110" 
          font-weight="900"
          letter-spacing="-2"
          fill="white">
          ${percentOffText}
        </text>
        
        ${headerInfoText ? `
        <text 
          x="60" 
          y="310" 
          font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
          font-size="32" 
          font-weight="700"
          letter-spacing="1"
          fill="white">
          ${headerInfoText.split('\n')[0]}
        </text>
        ${headerInfoText.split('\n')[1] ? `
        <text 
          x="60" 
          y="355" 
          font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
          font-size="32" 
          font-weight="700"
          letter-spacing="1"
          fill="white">
          ${headerInfoText.split('\n')[1]}
        </text>
        ` : ''}
        ` : ''}
      </svg>
    `;
    
    const compositeArray = [
      {
        input: Buffer.from(headerSvg),
        top: 0,
        left: 0
      }
    ];
    
    for (let i = 0; i < Math.min(picks.length, 3); i++) {
      const pick = picks[i].fields;
      const imageUrl = pick.ImageURL;
      
      if (!imageUrl) {
        console.log(`   ⚠️  Pick ${i + 1} has no image, skipping`);
        continue;
      }
      
      try {
        const imageBuffer = await fetchImageAsBuffer(imageUrl, pick.ProductURL);
        
        const productImage = await sharp(imageBuffer)
          .resize(productImageSize, productAreaHeight, {
            fit: 'cover',
            position: 'center'
          })
          .toBuffer();
        
        const xPosition = i * productImageSize;
        const yPosition = headerHeight;
        
        compositeArray.push({
          input: productImage,
          top: yPosition,
          left: xPosition
        });
        
        const productName = pick.ProductName || 'Product';
        const salePrice = pick.SalePrice;
        const originalPrice = pick.OriginalPrice;
        
        let priceText = '';
        if (salePrice && originalPrice && originalPrice > salePrice) {
          priceText = `$${salePrice} vs. $${originalPrice}`;
        } else if (salePrice) {
          priceText = `$${salePrice}`;
        }
        
        const labelHeight = 120;
        const labelY = headerHeight + productAreaHeight - labelHeight;
        
        const labelSvg = `
          <svg width="${productImageSize}" height="${labelHeight}">
            <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.85)"/>
            
            <text 
              x="15" 
              y="35" 
              font-family="DejaVu Sans, Arial, sans-serif" 
              font-size="14" 
              font-weight="400"
              fill="white"
              style="line-height: 1.2;">
              ${productName.length > 30 ? productName.substring(0, 30) + '...' : productName}
            </text>
            
            ${priceText ? `
            <text 
              x="15" 
              y="70" 
              font-family="DejaVu Sans, Arial, sans-serif" 
              font-size="18" 
              font-weight="700"
              fill="white">
              ${priceText}
            </text>
            ` : ''}
          </svg>
        `;
        
        compositeArray.push({
          input: Buffer.from(labelSvg),
          top: labelY,
          left: xPosition
        });
        
        console.log(`   ✅ Added pick ${i + 1}: ${productName}`);
        
      } catch (error) {
        console.log(`   ⚠️  Failed to process pick ${i + 1}: ${error.message}`);
      }
    }
    
    const productImagesAdded = compositeArray.length - 1;
    if (productImagesAdded === 0) {
      throw new Error('Failed to fetch any product images - cannot generate asset');
    }
    
    console.log(`   ✨ Compositing image with ${productImagesAdded} product image(s)...`);
    
    const finalImage = await canvas
      .composite(compositeArray)
      .png()
      .toBuffer();
    
    const today = new Date().toISOString().split('T')[0];
    const filename = `${company.replace(/[^a-zA-Z0-9]/g, '-')}-${percentOff}off.png`;
    
    console.log(`   📤 Uploading to Google Drive...`);
    const driveResult = await uploadToGoogleDrive({
      fileName: filename,
      mimeType: 'image/png',
      fileBuffer: finalImage,
      folderPath: `Product Images/Featured Sales/${today}`
    });
    
    console.log(`   ✅ Uploaded to Google Drive: ${filename}`);
    
    // Mark sale as having assets generated in Airtable
    try {
      const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_PAT}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fields: {
            FeaturedAssetURL: driveResult.webViewLink,
            FeaturedAssetDate: new Date().toISOString().split('T')[0]
          }
        })
      });
      console.log(`   ✅ Updated Airtable with asset URL`);
    } catch (error) {
      console.error(`   ⚠️  Failed to update Airtable: ${error.message}`);
    }
    
    return {
      success: true,
      filename,
      driveFileId: driveResult.fileId,
      driveUrl: driveResult.webViewLink
    };
    
  } catch (error) {
    console.error(`   ❌ Failed to generate asset: ${error.message}`);
    throw error;
  }
}

export async function generateMultipleFeaturedAssets(saleIds) {
  console.log(`\n🎨 Generating ${saleIds.length} featured sale assets...`);
  
  const results = [];
  
  for (const saleId of saleIds) {
    try {
      const result = await generateFeaturedSaleAsset(saleId);
      results.push({ saleId, ...result });
    } catch (error) {
      results.push({ 
        saleId, 
        success: false, 
        error: error.message 
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n✅ Generated ${successCount}/${saleIds.length} assets successfully`);
  
  return results;
}

// Generate header-only asset (no product images)
export async function generateHeaderOnlyAsset(saleId) {
  console.log(`🎨 Generating header-only asset for sale: ${saleId}`);
  
  const saleUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
  const saleResponse = await fetch(saleUrl, {
    headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
  });
  
  if (!saleResponse.ok) {
    throw new Error(`Failed to fetch sale: ${saleResponse.statusText}`);
  }
  
  const saleData = await saleResponse.json();
  const sale = saleData.fields;
  
  // Use OriginalCompanyName (plain text) instead of Company (linked record ID)
  const company = sale.OriginalCompanyName || sale.CompanyName || 'Sale';
  const percentOff = sale.PercentOff || 0;
  const endDate = sale.EndDate ? new Date(sale.EndDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : null;
  const discountCode = sale.DiscountCode || sale.PromoCode || null;
  
  const headerColor = getRandomColor();
  const companyUpper = company.toUpperCase();
  const percentOffText = `${percentOff}% OFF`;
  
  // Calculate font size based on company name length to prevent overflow
  // Max width is ~920px (1080 - 80 padding on each side)
  const maxWidth = 920;
  const baseFontSize = 120;
  const charsAtBaseSize = 10; // Approximate chars that fit at 120px
  const companyFontSize = companyUpper.length > charsAtBaseSize 
    ? Math.max(60, Math.floor(baseFontSize * charsAtBaseSize / companyUpper.length))
    : baseFontSize;
  
  let headerInfoText = '';
  if (endDate && discountCode) {
    headerInfoText = `UNTIL ${endDate}\nPROMO CODE: ${discountCode}`;
  } else if (endDate) {
    headerInfoText = `UNTIL ${endDate}`;
  } else if (discountCode) {
    headerInfoText = `PROMO CODE: ${discountCode}`;
  }
  
  // Full height header for header-only version
  const svg = `
    <svg width="${ASSET_WIDTH}" height="${ASSET_HEIGHT}">
      <rect width="100%" height="100%" fill="${headerColor}"/>
      
      <text 
        x="80" 
        y="420" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="${companyFontSize}" 
        font-weight="900"
        letter-spacing="-3"
        fill="white">
        ${companyUpper}
      </text>
      
      <text 
        x="80" 
        y="600" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="180" 
        font-weight="900"
        letter-spacing="-4"
        fill="white">
        ${percentOffText}
      </text>
      
      ${headerInfoText ? `
      <text 
        x="80" 
        y="720" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="48" 
        font-weight="700"
        letter-spacing="2"
        fill="white">
        ${headerInfoText.split('\n')[0]}
      </text>
      ${headerInfoText.split('\n')[1] ? `
      <text 
        x="80" 
        y="790" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="48" 
        font-weight="700"
        letter-spacing="2"
        fill="white">
        ${headerInfoText.split('\n')[1]}
      </text>
      ` : ''}
      ` : ''}
    </svg>
  `;
  
  const finalImage = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();
  
  const today = new Date().toISOString().split('T')[0];
  const filename = `${company.replace(/[^a-zA-Z0-9]/g, '-')}-${percentOff}off-header.png`;
  
  console.log(`   📤 Uploading to Google Drive...`);
  const driveResult = await uploadToGoogleDrive({
    fileName: filename,
    mimeType: 'image/png',
    fileBuffer: finalImage,
    folderPath: `Product Images/Featured Sales/${today}`
  });
  
  console.log(`   ✅ Uploaded header-only asset: ${filename}`);
  
  // Update Airtable with asset URL
  try {
    const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
    await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          FeaturedAssetURL: driveResult.webViewLink,
          FeaturedAssetDate: new Date().toISOString().split('T')[0]
        }
      })
    });
    console.log(`   ✅ Updated Airtable with asset URL`);
  } catch (error) {
    console.error(`   ⚠️  Failed to update Airtable: ${error.message}`);
  }
  
  return {
    success: true,
    filename,
    driveFileId: driveResult.fileId,
    driveUrl: driveResult.webViewLink
  };
}

// Generate asset with specific picks
export async function generateAssetWithPicks(saleId, pickIds) {
  console.log(`🎨 Generating asset with ${pickIds.length} specific picks for sale: ${saleId}`);
  
  const saleUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
  const saleResponse = await fetch(saleUrl, {
    headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
  });
  
  if (!saleResponse.ok) {
    throw new Error(`Failed to fetch sale: ${saleResponse.statusText}`);
  }
  
  const saleData = await saleResponse.json();
  const sale = saleData.fields;
  
  // Use OriginalCompanyName (plain text) instead of Company (linked record ID)
  const company = sale.OriginalCompanyName || sale.CompanyName || 'Sale';
  const percentOff = sale.PercentOff || 0;
  const endDate = sale.EndDate ? new Date(sale.EndDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : null;
  const discountCode = sale.DiscountCode || sale.PromoCode || null;
  
  // Fetch the specific picks
  const picks = [];
  for (const pickId of pickIds.slice(0, 3)) {
    const pickUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Picks/${pickId}`;
    const pickResponse = await fetch(pickUrl, {
      headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
    });
    if (pickResponse.ok) {
      const pickData = await pickResponse.json();
      picks.push({ id: pickId, fields: pickData.fields });
    }
  }
  
  if (picks.length === 0) {
    throw new Error('No valid picks found');
  }
  
  const headerColor = getRandomColor();
  const headerHeight = 450;
  const productAreaHeight = ASSET_HEIGHT - headerHeight;
  const productImageSize = Math.floor(ASSET_WIDTH / 3);
  
  const companyUpper = company.toUpperCase();
  const percentOffText = `${percentOff}% OFF`;
  
  // Calculate dynamic font size for company name (max width ~960px with 60px padding)
  const companyFontSize = calculateFontSize(companyUpper, 90, 960);
  
  let headerInfoText = '';
  if (endDate && discountCode) {
    headerInfoText = `UNTIL ${endDate}\nPROMO CODE: ${discountCode}`;
  } else if (endDate) {
    headerInfoText = `UNTIL ${endDate}`;
  } else if (discountCode) {
    headerInfoText = `PROMO CODE: ${discountCode}`;
  }
  
  const headerSvg = `
    <svg width="${ASSET_WIDTH}" height="${headerHeight}">
      <rect width="100%" height="100%" fill="${headerColor}"/>
      
      <text 
        x="60" 
        y="120" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="${companyFontSize}" 
        font-weight="900"
        letter-spacing="-2"
        fill="white">
        ${companyUpper}
      </text>
      
      <text 
        x="60" 
        y="240" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="110" 
        font-weight="900"
        letter-spacing="-2"
        fill="white">
        ${percentOffText}
      </text>
      
      ${headerInfoText ? `
      <text 
        x="60" 
        y="310" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="32" 
        font-weight="700"
        letter-spacing="1"
        fill="white">
        ${headerInfoText.split('\n')[0]}
      </text>
      ${headerInfoText.split('\n')[1] ? `
      <text 
        x="60" 
        y="355" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="32" 
        font-weight="700"
        letter-spacing="1"
        fill="white">
        ${headerInfoText.split('\n')[1]}
      </text>
      ` : ''}
      ` : ''}
    </svg>
  `;
  
  let canvas = sharp({
    create: {
      width: ASSET_WIDTH,
      height: ASSET_HEIGHT,
      channels: 4,
      background: { r: 240, g: 240, b: 240, alpha: 1 }
    }
  });
  
  const compositeArray = [
    {
      input: Buffer.from(headerSvg),
      top: 0,
      left: 0
    }
  ];
  
  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i].fields;
    const imageUrl = pick.ImageURL;
    
    if (!imageUrl) continue;
    
    try {
      const imageBuffer = await fetchImageAsBuffer(imageUrl, pick.ProductURL);
      
      const productImage = await sharp(imageBuffer)
        .resize(productImageSize, productAreaHeight, {
          fit: 'cover',
          position: 'center'
        })
        .toBuffer();
      
      const xPosition = i * productImageSize;
      
      compositeArray.push({
        input: productImage,
        top: headerHeight,
        left: xPosition
      });
      
      const productName = pick.ProductName || 'Product';
      const salePrice = pick.SalePrice;
      const originalPrice = pick.OriginalPrice;
      
      let priceText = '';
      if (salePrice && originalPrice && originalPrice > salePrice) {
        priceText = `$${salePrice} vs. $${originalPrice}`;
      } else if (salePrice) {
        priceText = `$${salePrice}`;
      }
      
      const labelHeight = 120;
      const labelY = headerHeight + productAreaHeight - labelHeight;
      
      const labelSvg = `
        <svg width="${productImageSize}" height="${labelHeight}">
          <rect width="100%" height="100%" fill="rgba(0, 0, 0, 0.85)"/>
          
          <text 
            x="15" 
            y="35" 
            font-family="DejaVu Sans, Arial, sans-serif" 
            font-size="14" 
            font-weight="400"
            fill="white">
            ${productName.length > 30 ? productName.substring(0, 30) + '...' : productName}
          </text>
          
          ${priceText ? `
          <text 
            x="15" 
            y="70" 
            font-family="DejaVu Sans, Arial, sans-serif" 
            font-size="18" 
            font-weight="700"
            fill="white">
            ${priceText}
          </text>
          ` : ''}
        </svg>
      `;
      
      compositeArray.push({
        input: Buffer.from(labelSvg),
        top: labelY,
        left: xPosition
      });
      
    } catch (error) {
      console.log(`   ⚠️  Failed to process pick: ${error.message}`);
    }
  }
  
  const finalImage = await canvas
    .composite(compositeArray)
    .png()
    .toBuffer();
  
  const today = new Date().toISOString().split('T')[0];
  const filename = `${company.replace(/[^a-zA-Z0-9]/g, '-')}-${percentOff}off-picks.png`;
  
  console.log(`   📤 Uploading to Google Drive...`);
  const driveResult = await uploadToGoogleDrive({
    fileName: filename,
    mimeType: 'image/png',
    fileBuffer: finalImage,
    folderPath: `Product Images/Featured Sales/${today}`
  });
  
  console.log(`   ✅ Uploaded asset with picks: ${filename}`);
  
  // Update Airtable
  try {
    const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
    await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          FeaturedAssetURL: driveResult.webViewLink,
          FeaturedAssetDate: new Date().toISOString().split('T')[0]
        }
      })
    });
  } catch (error) {
    console.error(`   ⚠️  Failed to update Airtable: ${error.message}`);
  }
  
  return {
    success: true,
    filename,
    driveFileId: driveResult.fileId,
    driveUrl: driveResult.webViewLink
  };
}

// Story dimensions
const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Generate main sale asset in Story format (1080x1920)
export async function generateMainSaleStory(saleId, customNote = '') {
  console.log(`🎨 Generating main sale story for sale: ${saleId}`);
  
  const saleUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
  const saleResponse = await fetch(saleUrl, {
    headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
  });
  
  if (!saleResponse.ok) {
    throw new Error(`Failed to fetch sale: ${saleResponse.statusText}`);
  }
  
  const saleData = await saleResponse.json();
  const sale = saleData.fields;
  
  const company = sale.OriginalCompanyName || sale.CompanyName || 'Sale';
  const percentOff = sale.PercentOff || 0;
  const endDate = sale.EndDate ? new Date(sale.EndDate).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }) : null;
  const discountCode = sale.DiscountCode || sale.PromoCode || null;
  const saleLink = sale.SaleURL || sale.ShopMyURL || '';
  
  const headerColor = getRandomColor();
  const companyUpper = company.toUpperCase();
  const percentOffText = `${percentOff}% OFF`;
  
  // Calculate font size for company name to fit width
  const maxWidth = 920;
  const baseFontSize = 120;
  const companyFontSize = calculateFontSize(companyUpper, baseFontSize, maxWidth, 0.7);
  
  let headerInfoText = '';
  let headerInfoLines = 0;
  if (endDate && discountCode) {
    headerInfoText = `UNTIL ${endDate}\nPROMO CODE: ${discountCode}`;
    headerInfoLines = 2;
  } else if (endDate) {
    headerInfoText = `UNTIL ${endDate}`;
    headerInfoLines = 1;
  } else if (discountCode) {
    headerInfoText = `PROMO CODE: ${discountCode}`;
    headerInfoLines = 1;
  }
  
  // Calculate link position based on header info lines
  const linkYPosition = headerInfoLines === 2 ? 1260 : (headerInfoLines === 1 ? 1180 : 1020);
  
  // Create the full-height story with colored background
  const svg = `
    <svg width="${STORY_WIDTH}" height="${STORY_HEIGHT}">
      <rect width="100%" height="100%" fill="${headerColor}"/>
      
      <text 
        x="80" 
        y="700" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="${companyFontSize}" 
        font-weight="900"
        letter-spacing="-3"
        fill="white">
        ${escapeHtml(companyUpper)}
      </text>
      
      <text 
        x="80" 
        y="920" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="200" 
        font-weight="900"
        letter-spacing="-4"
        fill="white">
        ${percentOffText}
      </text>
      
      ${headerInfoText ? `
      <text 
        x="80" 
        y="1080" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="56" 
        font-weight="700"
        letter-spacing="2"
        fill="white">
        ${escapeHtml(headerInfoText.split('\n')[0])}
      </text>
      ${headerInfoText.split('\n')[1] ? `
      <text 
        x="80" 
        y="1160" 
        font-family="DejaVu Sans, Arial, Helvetica, sans-serif" 
        font-size="56" 
        font-weight="700"
        letter-spacing="2"
        fill="white">
        ${escapeHtml(headerInfoText.split('\n')[1])}
      </text>
      ` : ''}
      ` : ''}
      
      ${saleLink ? `
      <text 
        x="80" 
        y="${linkYPosition}" 
        font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" 
        font-size="64" 
        fill="white">
        🔗🔗🔗
      </text>
      ` : ''}
    </svg>
  `;
  
  let backgroundImage = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();
  
  // Add custom note in black bar at bottom-left (like product stories)
  const compositeArray = [];
  
  if (customNote && customNote.trim()) {
    const noteLines = customNote.trim().split('\n').slice(0, 3); // Max 3 lines
    const noteFontSize = 48;
    const notePadding = 20;
    const noteLineHeight = noteFontSize + 12;
    const charWidth = noteFontSize * 0.55;
    
    // Calculate box dimensions
    let maxLineWidth = 0;
    for (const line of noteLines) {
      const lineWidth = Math.ceil(line.length * charWidth);
      if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
    }
    
    const noteBoxWidth = Math.round(Math.min(maxLineWidth + (notePadding * 4), STORY_WIDTH - 80));
    const noteBoxHeight = Math.round((noteLines.length * noteLineHeight) + (notePadding * 2));
    
    let noteTextElements = '';
    noteLines.forEach((line, index) => {
      noteTextElements += `
        <text 
          x="${notePadding * 2}" 
          y="${notePadding + (index + 1) * noteLineHeight - 12}" 
          font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
          font-size="${noteFontSize}" 
          font-weight="400" 
          fill="white">
          ${escapeHtml(line)}
        </text>
      `;
    });
    
    const noteSvg = `
      <svg width="${noteBoxWidth}" height="${noteBoxHeight}">
        <rect width="100%" height="100%" fill="black"/>
        ${noteTextElements}
      </svg>
    `;
    
    // Position at bottom-left with 40px margin from edges
    const noteX = 40;
    const noteY = Math.round(STORY_HEIGHT - noteBoxHeight - 100);
    
    compositeArray.push({
      input: Buffer.from(noteSvg),
      top: noteY,
      left: noteX
    });
  }
  
  // Composite the note overlay if present
  let finalImage;
  if (compositeArray.length > 0) {
    finalImage = await sharp(backgroundImage)
      .composite(compositeArray)
      .png()
      .toBuffer();
  } else {
    finalImage = backgroundImage;
  }
  
  const today = new Date().toISOString().split('T')[0];
  const sanitizedName = company.replace(/[^a-zA-Z0-9]/g, '-');
  const filename = `${sanitizedName}-${percentOff}off-story.png`;
  
  console.log(`   📤 Uploading to Google Drive...`);
  const driveResult = await uploadToGoogleDrive({
    fileName: filename,
    mimeType: 'image/png',
    fileBuffer: finalImage,
    folderPath: `Product Images/Stories/${today}`
  });
  
  console.log(`   ✅ Uploaded main sale story: ${filename}`);
  
  // Update Airtable with asset URL
  try {
    const updateUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sales/${saleId}`;
    await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          FeaturedAssetURL: driveResult.webViewLink,
          FeaturedAssetDate: new Date().toISOString().split('T')[0]
        }
      })
    });
    console.log(`   ✅ Updated Airtable with asset URL`);
  } catch (error) {
    console.error(`   ⚠️  Failed to update Airtable: ${error.message}`);
  }
  
  return {
    success: true,
    filename,
    driveFileId: driveResult.fileId,
    driveUrl: driveResult.webViewLink
  };
}

// Generate a story image with custom copy overlay
export async function generatePickStoryWithCopy(pickId, customCopy = '') {
  console.log(`🎨 Generating story for pick: ${pickId}`);
  
  const pickUrl = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Picks/${pickId}`;
  const pickResponse = await fetch(pickUrl, {
    headers: { 'Authorization': `Bearer ${AIRTABLE_PAT}` }
  });
  
  if (!pickResponse.ok) {
    throw new Error(`Failed to fetch pick: ${pickResponse.statusText}`);
  }
  
  const pickData = await pickResponse.json();
  const pick = pickData.fields;
  
  const imageUrl = pick.ImageURL;
  if (!imageUrl) {
    throw new Error('Pick has no image URL');
  }
  
  const imageBuffer = await fetchImageAsBuffer(imageUrl, pick.ProductURL);
  
  const backgroundImage = await sharp(Buffer.from(imageBuffer))
    .resize(STORY_WIDTH, STORY_HEIGHT, {
      fit: 'cover',
      position: 'center'
    })
    .toBuffer();
  
  const productName = pick.ProductName || 'Product';
  const brand = pick.Brand || '';
  const company = pick.Company?.[0] || '';
  const salePrice = pick.SalePrice;
  const originalPrice = pick.OriginalPrice;
  const shopMyUrl = pick.ShopMyURL || pick.ProductURL || '';
  
  let priceText = '';
  if (originalPrice && originalPrice > 0 && salePrice && salePrice > 0) {
    priceText = `$${salePrice} vs. $${originalPrice}`;
  } else if (salePrice && salePrice > 0) {
    priceText = `$${salePrice}`;
  }
  
  const fontSize = 48;
  const textPadding = 20;
  const charWidth = fontSize * 0.6;
  const maxBoxWidth = STORY_WIDTH - 80;
  const lineGap = 10;
  
  const compositeArray = [];
  
  // Bottom-left text overlays (price, name, brand, link)
  const basePositionY = STORY_HEIGHT - 100;
  let currentY = basePositionY;
  
  const showBrand = brand && company && brand !== company;
  
  if (showBrand) {
    const brandBoxWidth = Math.round(Math.min(Math.ceil(brand.length * charWidth) + (textPadding * 4), maxBoxWidth));
    const brandBoxHeight = Math.round(fontSize + (textPadding * 2));
    
    const brandSvg = `
      <svg width="${brandBoxWidth}" height="${brandBoxHeight}">
        <rect width="100%" height="100%" fill="black"/>
        <text 
          x="${textPadding * 2}" 
          y="${textPadding + fontSize * 0.8}" 
          font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
          font-size="${fontSize}" 
          font-weight="400" 
          fill="white">
          ${escapeHtml(brand)}
        </text>
      </svg>
    `;
    
    const nameBoxWidth = Math.round(Math.min(Math.ceil(productName.length * charWidth) + (textPadding * 4), maxBoxWidth));
    const nameBoxHeight = Math.round(fontSize + (textPadding * 2));
    
    const nameSvg = `
      <svg width="${nameBoxWidth}" height="${nameBoxHeight}">
        <rect width="100%" height="100%" fill="black"/>
        <text 
          x="${textPadding * 2}" 
          y="${textPadding + fontSize * 0.8}" 
          font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
          font-size="${fontSize}" 
          font-weight="400" 
          fill="white">
          ${escapeHtml(productName)}
        </text>
      </svg>
    `;
    
    if (priceText) {
      const priceBoxWidth = Math.round(Math.min(Math.ceil(priceText.length * charWidth) + (textPadding * 4), maxBoxWidth));
      const priceBoxHeight = Math.round(fontSize + (textPadding * 2));
      
      const priceSvg = `
        <svg width="${priceBoxWidth}" height="${priceBoxHeight}">
          <rect width="100%" height="100%" fill="black"/>
          <text 
            x="${textPadding * 2}" 
            y="${textPadding + fontSize * 0.8}" 
            font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
            font-size="${fontSize}" 
            font-weight="400" 
            fill="white">
            ${escapeHtml(priceText)}
          </text>
        </svg>
      `;
      
      const brandPositionY = Math.round(currentY);
      const namePositionY = Math.round(brandPositionY - brandBoxHeight - lineGap);
      const pricePositionY = Math.round(namePositionY - nameBoxHeight - lineGap);
      
      compositeArray.push(
        { input: Buffer.from(priceSvg), top: pricePositionY, left: 40 },
        { input: Buffer.from(nameSvg), top: namePositionY, left: 40 },
        { input: Buffer.from(brandSvg), top: brandPositionY, left: 40 }
      );
      
      // Add ShopMy link below brand (bottom element)
      if (shopMyUrl) {
        const linkText = '🔗🔗🔗';
        const linkFontSize = 40;
        const linkBoxWidth = Math.round(180);
        const linkBoxHeight = Math.round(linkFontSize + (textPadding * 2));
        const linkPositionY = Math.round(brandPositionY + brandBoxHeight + lineGap);
        
        const linkSvg = `
          <svg width="${linkBoxWidth}" height="${linkBoxHeight}">
            <rect width="100%" height="100%" fill="black"/>
            <text 
              x="${textPadding * 2}" 
              y="${textPadding + linkFontSize * 0.8}" 
              font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" 
              font-size="${linkFontSize}" 
              fill="white">
              ${linkText}
            </text>
          </svg>
        `;
        compositeArray.push({ input: Buffer.from(linkSvg), top: linkPositionY, left: 40 });
      }
    }
  } else {
    const nameBoxWidth = Math.round(Math.min(Math.ceil(productName.length * charWidth) + (textPadding * 4), maxBoxWidth));
    const nameBoxHeight = Math.round(fontSize + (textPadding * 2));
    
    const nameSvg = `
      <svg width="${nameBoxWidth}" height="${nameBoxHeight}">
        <rect width="100%" height="100%" fill="black"/>
        <text 
          x="${textPadding * 2}" 
          y="${textPadding + fontSize * 0.8}" 
          font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
          font-size="${fontSize}" 
          font-weight="400" 
          fill="white">
          ${escapeHtml(productName)}
        </text>
      </svg>
    `;
    
    if (priceText) {
      const priceBoxWidth = Math.round(Math.min(Math.ceil(priceText.length * charWidth) + (textPadding * 4), maxBoxWidth));
      const priceBoxHeight = Math.round(fontSize + (textPadding * 2));
      
      const priceSvg = `
        <svg width="${priceBoxWidth}" height="${priceBoxHeight}">
          <rect width="100%" height="100%" fill="black"/>
          <text 
            x="${textPadding * 2}" 
            y="${textPadding + fontSize * 0.8}" 
            font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
            font-size="${fontSize}" 
            font-weight="400" 
            fill="white">
            ${escapeHtml(priceText)}
          </text>
        </svg>
      `;
      
      const pricePositionY = Math.round(currentY);
      const namePositionY = Math.round(pricePositionY - priceBoxHeight - lineGap);
      
      compositeArray.push(
        { input: Buffer.from(nameSvg), top: namePositionY, left: 40 },
        { input: Buffer.from(priceSvg), top: pricePositionY, left: 40 }
      );
      
      // Add ShopMy link below price (bottom element)
      if (shopMyUrl) {
        const linkText = '🔗🔗🔗';
        const linkFontSize = 40;
        const linkBoxWidth = Math.round(180);
        const linkBoxHeight = Math.round(linkFontSize + (textPadding * 2));
        const linkPositionY = Math.round(pricePositionY + priceBoxHeight + lineGap);
        
        const linkSvg = `
          <svg width="${linkBoxWidth}" height="${linkBoxHeight}">
            <rect width="100%" height="100%" fill="black"/>
            <text 
              x="${textPadding * 2}" 
              y="${textPadding + linkFontSize * 0.8}" 
              font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif" 
              font-size="${linkFontSize}" 
              fill="white">
              ${linkText}
            </text>
          </svg>
        `;
        compositeArray.push({ input: Buffer.from(linkSvg), top: linkPositionY, left: 40 });
      }
    }
  }
  
  // Add custom copy overlay in top-right if provided
  if (customCopy && customCopy.trim()) {
    const copyLines = customCopy.trim().split('\n').slice(0, 3); // Max 3 lines
    const copyFontSize = 36;
    const copyPadding = 16;
    const copyLineHeight = copyFontSize + 8;
    
    // Calculate box dimensions - ensure integer values for Sharp
    let maxLineWidth = 0;
    for (const line of copyLines) {
      const lineWidth = Math.ceil(line.length * copyFontSize * 0.55);
      if (lineWidth > maxLineWidth) maxLineWidth = lineWidth;
    }
    
    const copyBoxWidth = Math.round(Math.min(maxLineWidth + (copyPadding * 4), STORY_WIDTH - 80));
    const copyBoxHeight = Math.round((copyLines.length * copyLineHeight) + (copyPadding * 2));
    
    let copyTextElements = '';
    copyLines.forEach((line, index) => {
      copyTextElements += `
        <text 
          x="${copyPadding * 2}" 
          y="${copyPadding + (index + 1) * copyLineHeight - 8}" 
          font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
          font-size="${copyFontSize}" 
          font-weight="400" 
          fill="white">
          ${escapeHtml(line)}
        </text>
      `;
    });
    
    const copySvg = `
      <svg width="${copyBoxWidth}" height="${copyBoxHeight}">
        <rect width="100%" height="100%" fill="black"/>
        ${copyTextElements}
      </svg>
    `;
    
    // Position in top-right with same margin as bottom-left - ensure integers for Sharp
    const copyX = Math.round(STORY_WIDTH - copyBoxWidth - 40);
    const copyY = 80;
    
    compositeArray.push({
      input: Buffer.from(copySvg),
      top: copyY,
      left: copyX
    });
  }
  
  const finalImage = await sharp(backgroundImage)
    .composite(compositeArray)
    .jpeg({ quality: 90 })
    .toBuffer();
  
  const today = new Date().toISOString().split('T')[0];
  const sanitizedName = productName.replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
  const filename = `${sanitizedName}-story.jpg`;
  
  console.log(`   📤 Uploading story to Google Drive...`);
  const driveResult = await uploadToGoogleDrive({
    fileName: filename,
    mimeType: 'image/jpeg',
    fileBuffer: finalImage,
    folderPath: `Product Images/Stories/${today}`
  });
  
  console.log(`   ✅ Uploaded story: ${filename}`);
  
  return {
    success: true,
    filename,
    driveFileId: driveResult.fileId,
    driveUrl: driveResult.webViewLink
  };
}
