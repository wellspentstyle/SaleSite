import sharp from 'sharp';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

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

    const productName = pick.name || 'Product';
    const originalPrice = pick.originalPrice;
    const salePrice = pick.salePrice;
    
    let priceText = '';
    if (originalPrice && originalPrice > 0) {
      priceText = `$${originalPrice} > $${salePrice}`;
    } else if (salePrice && salePrice > 0) {
      priceText = `$${salePrice}`;
    }

    const padding = 20;
    const textPadding = 15;
    const fontSize = 48;
    const lineHeight = fontSize + 20;

    const nameSvg = `
      <svg width="${STORY_WIDTH}" height="${lineHeight + textPadding * 2}">
        <rect width="100%" height="100%" fill="black"/>
        <text 
          x="${textPadding}" 
          y="${textPadding + fontSize}" 
          font-family="Arial, sans-serif" 
          font-size="${fontSize}" 
          font-weight="400" 
          fill="white"
        >${escapeHtml(productName)}</text>
      </svg>
    `;

    const priceSvg = priceText ? `
      <svg width="${STORY_WIDTH}" height="${lineHeight + textPadding * 2}">
        <rect width="100%" height="100%" fill="black"/>
        <text 
          x="${textPadding}" 
          y="${textPadding + fontSize}" 
          font-family="Arial, sans-serif" 
          font-size="${fontSize}" 
          font-weight="400" 
          fill="white"
        >${escapeHtml(priceText)}</text>
      </svg>
    ` : '';

    const nameOverlay = Buffer.from(nameSvg);
    const priceOverlay = priceText ? Buffer.from(priceSvg) : null;

    const nameY = STORY_HEIGHT - (lineHeight + textPadding * 2) * (priceText ? 2 : 1) - padding;
    const priceY = STORY_HEIGHT - (lineHeight + textPadding * 2) - padding;

    let compositeArray = [
      { input: nameOverlay, top: nameY, left: 0 }
    ];
    
    if (priceOverlay) {
      compositeArray.push({ input: priceOverlay, top: priceY, left: 0 });
    }

    const finalImage = await sharp(backgroundImage)
      .composite(compositeArray)
      .jpeg({ quality: 90 })
      .toBuffer();

    const outputDir = path.join(__dirname, '../generated-stories');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = Date.now();
    const sanitizedName = productName.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const filename = `story_${sanitizedName}_${timestamp}.jpg`;
    const outputPath = path.join(outputDir, filename);

    fs.writeFileSync(outputPath, finalImage);
    
    console.log(`✅ Story image saved: ${outputPath}`);
    
    return {
      buffer: finalImage,
      path: outputPath,
      filename: filename
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
