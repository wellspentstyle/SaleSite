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

export async function generateStoryImage(pick) {
  try {
    console.log(`🎨 Generating story image for: ${pick.name}`);
    
    const imageUrl = pick.imageUrl;
    if (!imageUrl) {
      throw new Error('No image URL provided');
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
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
    const boxWidth = Math.ceil(priceText.length * charWidth) + (textPadding * 4);
    const boxHeight = fontSize + (textPadding * 2);

    const positionY = Math.floor(STORY_HEIGHT - (STORY_HEIGHT / 3));

    const priceSvg = `
      <svg width="${boxWidth}" height="${boxHeight}">
        <rect width="100%" height="100%" fill="black"/>
        <text 
          x="${textPadding * 2}" 
          y="${textPadding + fontSize * 0.8}" 
          font-family="IBM Plex Mono, SF Mono, Courier New, monospace" 
          font-size="${fontSize}" 
          font-weight="400" 
          fill="white"
        >${escapeHtml(priceText)}</text>
      </svg>
    `;

    const priceOverlay = Buffer.from(priceSvg);

    let compositeArray = [
      { input: priceOverlay, top: positionY, left: 40 }
    ];

    const finalImage = await sharp(backgroundImage)
      .composite(compositeArray)
      .jpeg({ quality: 90 })
      .toBuffer();

    const outputDir = path.join(__dirname, '../generated-stories');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const sanitizedName = (pick.name || 'product').replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const filename = `story_${sanitizedName}_${timestamp}.jpg`;
    const outputPath = path.join(outputDir, filename);

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
