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
    
    const company = sale.Company || 'Sale';
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
          font-size="90" 
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
