// Test Google Shopping scraping with JavaScript rendering
import { scrapeProduct } from './scrapers/fast-scraper.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

const testUrl = process.argv[2] || 'https://www.madewell.com/the-lexie-ankle-boot-in-leather-NX546.html';

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY
});

console.log('🧪 Testing Google Shopping scraping with JavaScript rendering');
console.log('URL:', testUrl);
console.log('');

(async () => {
  try {
    const result = await scrapeProduct(testUrl, {
      openai,
      enableTestMetadata: true,
      logger: console
    });
    
    console.log('');
    console.log('=== FINAL RESULT ===');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('');
      console.log('✅ SUCCESS');
      console.log(`   Method: ${result.meta.extractionMethod}`);
      console.log(`   Confidence: ${result.meta.confidence}%`);
      console.log(`   Product: ${result.product.name}`);
      console.log(`   Price: $${result.product.currentPrice} (was $${result.product.originalPrice || 'N/A'})`);
    } else {
      console.log('');
      console.log('❌ FAILED');
      console.log(`   Error: ${result.error}`);
      console.log(`   Type: ${result.errorType}`);
    }
    
    process.exit(result.success ? 0 : 1);
    
  } catch (error) {
    console.error('');
    console.error('❌ EXCEPTION:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
