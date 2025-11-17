import { generateStoryImage } from './story-generator.js';
import { sendStoryToTelegram } from './telegram-bot.js';

const AIRTABLE_PAT = process.env.AIRTABLE_PAT;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const PICKS_TABLE_NAME = 'Picks';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const POLL_INTERVAL_MS = 30 * 1000;

const processedRecords = new Set();

export async function checkForStoryRequests() {
  try {
    console.log('🔍 Checking for CreateStory requests...');
    
    const filter = `OR({CreateStory}='Create Story', {CreateStory}='create story', {CreateStory}='Story created', {CreateStory}='story created', {CreateStory}='Create story')`;
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}?filterByFormula=${encodeURIComponent(filter)}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Airtable API error: ${response.status}`);
    }
    
    const data = await response.json();
    const records = data.records || [];
    
    if (records.length === 0) {
      console.log('   No pending story requests');
      return;
    }
    
    console.log(`   Found ${records.length} pending story request(s)`);
    
    for (const record of records) {
      if (processedRecords.has(record.id)) {
        console.log(`   ⏭️  Skipping already processed record: ${record.id}`);
        continue;
      }
      
      const fields = record.fields;
      const pick = {
        id: record.id,
        name: fields.ProductName || 'Product',
        brand: fields.Brand || null,
        imageUrl: fields.ImageURL,
        originalPrice: fields.OriginalPrice,
        salePrice: fields.SalePrice,
        shopMyUrl: fields.ShopMyURL || '#',
        company: fields.Company || 'Unknown',
        saleName: fields.SaleName ? fields.SaleName[0] : 'Unknown Sale'
      };
      
      console.log(`   📸 Processing story for: ${pick.name}`);
      
      processedRecords.add(record.id);
      let telegramSent = false;
      
      try {
        const storyImage = await generateStoryImage(pick);
        
        const caption = `*${pick.name}*\n\nShop now: ${pick.shopMyUrl}`;
        
        await sendStoryToTelegram(TELEGRAM_CHAT_ID, storyImage.buffer, caption);
        telegramSent = true;
        
        await updateAirtableField(record.id, 'CreateStory', 'Story Created');
        
        console.log(`   ✅ Story created and sent for: ${pick.name}`);
        
      } catch (error) {
        console.error(`   ❌ Failed to process story for ${pick.name}:`, error);
        
        if (!telegramSent) {
          processedRecords.delete(record.id);
          console.log(`   ♻️  Removed from processed set - can retry`);
        } else {
          console.log(`   ⚠️  Telegram sent but Airtable update failed - keeping in processed set to prevent spam`);
        }
        
        try {
          await updateAirtableField(record.id, 'CreateStory', 'Failed');
        } catch (updateError) {
          console.error(`   ⚠️  Could not update Airtable to Failed:`, updateError.message);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking for story requests:', error);
  }
}

async function updateAirtableField(recordId, fieldName, value) {
  try {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${PICKS_TABLE_NAME}/${recordId}`;
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_PAT}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          [fieldName]: value
        }
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to update Airtable: ${response.status}`);
    }
    
    console.log(`   ✅ Updated ${fieldName} to "${value}" for record ${recordId}`);
    
  } catch (error) {
    console.error(`   ❌ Failed to update Airtable field:`, error);
    throw error;
  }
}

export function startStoryWatcher() {
  console.log('👀 Starting story watcher...');
  console.log(`   Polling every ${POLL_INTERVAL_MS / 1000} seconds`);
  
  checkForStoryRequests();
  
  const intervalId = setInterval(checkForStoryRequests, POLL_INTERVAL_MS);
  
  return intervalId;
}

export function stopStoryWatcher(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
    console.log('🛑 Story watcher stopped');
  }
}
