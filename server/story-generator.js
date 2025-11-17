import sharp from 'sharp';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { uploadToGoogleDrive } from './google-drive-uploader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORY_WIDTH = 1080;
const STORY_HEIGHT = 1920;

// Track domains where image fetching has failed with 403/Forbidden
const imageBlocklist = new Set();

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (error) {
    return null;
  }
}

export async function generateStoryImage(pick) {
  try {
    console.log(`🎨 Generating story image for: ${pick.name}`);
    
    const imageUrl = pick.imageUrl;
    const productUrl = pick.productUrl;
    
    if (!imageUrl) {
      throw new Error('No image URL provided');
    }

    // Check if image domain is on blocklist
    const imageDomain = extractDomain(imageUrl);
    if (imageDomain && imageBlocklist.has(imageDomain)) {
      console.log(`   ⚠️  Image domain ${imageDomain} is blocked - skipping download`);
      throw new Error(`Image domain ${imageDomain} is blocked due to previous 403 errors`);
    }

    // Add browser-like headers to avoid Forbidden errors
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };
    
    // Add Referer if we have the product URL
    if (productUrl) {
      const productDomain = extractDomain(productUrl);
      if (productDomain) {
        headers['Referer'] = productUrl;
      }
    }

    const imageResponse = await fetch(imageUrl, { headers });
    
    if (!imageResponse.ok) {
      // If we get 403/Forbidden, add domain to blocklist
      if (imageResponse.status === 403) {
        if (imageDomain) {
          imageBlocklist.add(imageDomain);
          console.log(`   🚫 Added ${imageDomain} to image blocklist (403 Forbidden)`);
        }
      }
      throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
    }
    
    const imageBuffer = await imageResponse.arrayBuffer();
    
    const backgroundImage = await sharp(Buffer.from(imageBuffer))
      .resize(STORY_WIDTH, STORY_HEIGHT, {
        fit: 'cover',
        position: 'center'
      })
      .toBuffer();

    const originalPrice = pick.originalPrice;
    const salePrice = pick.salePrice;
    
    let priceText = '';
    if (originalPrice && originalPrice > 0 && salePrice && salePrice > 0) {
      priceText = `$${salePrice} vs. $${originalPrice}`;
    } else if (salePrice && salePrice > 0) {
      priceText = `$${salePrice}`;
    }

    if (!priceText) {
      throw new Error('No price information available');
    }

    const fontSize = 48;
    const textPadding = 20;
    const charWidth = fontSize * 0.6;
    const maxBoxWidth = STORY_WIDTH - 80;
    const lineGap = 10;
    
    const priceBoxWidth = Math.min(Math.ceil(priceText.length * charWidth) + (textPadding * 4), maxBoxWidth);
    const priceBoxHeight = fontSize + (textPadding * 2);

    const basePositionY = Math.floor(STORY_HEIGHT - (STORY_HEIGHT / 3));

    const productName = pick.name || 'Product';
    const brand = pick.brand;
    const company = pick.company;
    
    const showBrand = brand && company && brand !== company;

    let compositeArray = [];
    let currentY = basePositionY;

    if (showBrand) {
      const brandBoxWidth = Math.min(Math.ceil(brand.length * charWidth) + (textPadding * 4), maxBoxWidth);
      const brandBoxHeight = fontSize + (textPadding * 2);
      
      const brandSvg = `
        <svg width="${brandBoxWidth}" height="${brandBoxHeight}">
          <rect width="100%" height="100%" fill="black"/>
          <text 
            x="${textPadding * 2}" 
            y="${textPadding + fontSize * 0.8}" 
            font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
            font-size="${fontSize}" 
            font-weight="400" 
            fill="white"
            textLength="${brandBoxWidth - (textPadding * 4)}"
            lengthAdjust="spacingAndGlyphs"
          >${escapeHtml(brand)}</text>
        </svg>
      `;
      
      const brandOverlay = Buffer.from(brandSvg);
      
      const nameBoxWidth = Math.min(Math.ceil(productName.length * charWidth) + (textPadding * 4), maxBoxWidth);
      const nameBoxHeight = fontSize + (textPadding * 2);
      
      const nameSvg = `
        <svg width="${nameBoxWidth}" height="${nameBoxHeight}">
          <rect width="100%" height="100%" fill="black"/>
          <text 
            x="${textPadding * 2}" 
            y="${textPadding + fontSize * 0.8}" 
            font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
            font-size="${fontSize}" 
            font-weight="400" 
            fill="white"
            textLength="${nameBoxWidth - (textPadding * 4)}"
            lengthAdjust="spacingAndGlyphs"
          >${escapeHtml(productName)}</text>
        </svg>
      `;
      
      const nameOverlay = Buffer.from(nameSvg);
      
      const priceSvg = `
        <svg width="${priceBoxWidth}" height="${priceBoxHeight}">
          <rect width="100%" height="100%" fill="black"/>
          <text 
            x="${textPadding * 2}" 
            y="${textPadding + fontSize * 0.8}" 
            font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
            font-size="${fontSize}" 
            font-weight="400" 
            fill="white"
            textLength="${priceBoxWidth - (textPadding * 4)}"
            lengthAdjust="spacingAndGlyphs"
          >${escapeHtml(priceText)}</text>
        </svg>
      `;
      
      const priceOverlay = Buffer.from(priceSvg);
      
      const brandPositionY = currentY;
      const namePositionY = brandPositionY - brandBoxHeight - lineGap;
      const pricePositionY = namePositionY - nameBoxHeight - lineGap;
      
      compositeArray = [
        { input: priceOverlay, top: pricePositionY, left: 40 },
        { input: nameOverlay, top: namePositionY, left: 40 },
        { input: brandOverlay, top: brandPositionY, left: 40 }
      ];
    } else {
      const nameBoxWidth = Math.min(Math.ceil(productName.length * charWidth) + (textPadding * 4), maxBoxWidth);
      const nameBoxHeight = fontSize + (textPadding * 2);
      
      const nameSvg = `
        <svg width="${nameBoxWidth}" height="${nameBoxHeight}">
          <rect width="100%" height="100%" fill="black"/>
          <text 
            x="${textPadding * 2}" 
            y="${textPadding + fontSize * 0.8}" 
            font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
            font-size="${fontSize}" 
            font-weight="400" 
            fill="white"
            textLength="${nameBoxWidth - (textPadding * 4)}"
            lengthAdjust="spacingAndGlyphs"
          >${escapeHtml(productName)}</text>
        </svg>
      `;
      
      const nameOverlay = Buffer.from(nameSvg);
      
      const priceSvg = `
        <svg width="${priceBoxWidth}" height="${priceBoxHeight}">
          <rect width="100%" height="100%" fill="black"/>
          <text 
            x="${textPadding * 2}" 
            y="${textPadding + fontSize * 0.8}" 
            font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
            font-size="${fontSize}" 
            font-weight="400" 
            fill="white"
            textLength="${priceBoxWidth - (textPadding * 4)}"
            lengthAdjust="spacingAndGlyphs"
          >${escapeHtml(priceText)}</text>
        </svg>
      `;
      
      const priceOverlay = Buffer.from(priceSvg);
      
      const pricePositionY = currentY;
      const namePositionY = pricePositionY - priceBoxHeight - lineGap;
      
      compositeArray = [
        { input: nameOverlay, top: namePositionY, left: 40 },
        { input: priceOverlay, top: pricePositionY, left: 40 }
      ];
    }

    const finalImage = await sharp(backgroundImage)
      .composite(compositeArray)
      .jpeg({ quality: 90 })
      .toBuffer();

    const outputDir = path.join(__dirname, '../generated-stories');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const sanitizedName = (pick.name || 'product').replace(/[^a-z0-9 ]/gi, '').trim();
    const filename = `${sanitizedName}.jpg`;
    const timestamp = Date.now();
    const localFilename = `${sanitizedName}_${timestamp}.jpg`;
    const outputPath = path.join(outputDir, localFilename);

    fs.writeFileSync(outputPath, finalImage);
    
    console.log(`✅ Story image saved locally: ${outputPath}`);
    
    let driveLink = null;
    try {
      const companyName = pick.company || 'Unknown';
      const saleName = pick.saleName || 'Unknown Sale';
      const driveResult = await uploadToGoogleDrive(outputPath, filename, companyName, saleName);
      driveLink = driveResult.webViewLink;
    } catch (driveError) {
      console.error('⚠️  Google Drive upload failed (continuing anyway):', driveError.message);
    }
    
    return {
      buffer: finalImage,
      path: outputPath,
      filename: filename,
      driveLink: driveLink
    };

  } catch (error) {
    console.error('❌ Error generating story image:', error);
    throw error;
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
