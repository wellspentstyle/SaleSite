import TelegramBot from 'node-telegram-bot-api';

let bot = null;

export function initializeTelegramBot(token) {
  if (!token) {
    console.warn('⚠️  Telegram bot token not provided');
    return null;
  }
  
  try {
    bot = new TelegramBot(token);
    console.log('✅ Telegram bot initialized');
    return bot;
  } catch (error) {
    console.error('❌ Failed to initialize Telegram bot:', error);
    return null;
  }
}

export async function sendStoryToTelegram(chatId, imageBuffer, caption) {
  if (!bot) {
    throw new Error('Telegram bot not initialized');
  }
  
  if (!chatId) {
    throw new Error('Telegram chat ID not provided');
  }
  
  try {
    console.log(`📱 Sending story to Telegram chat ${chatId}...`);
    
    await bot.sendPhoto(chatId, imageBuffer, {
      caption: caption,
      parse_mode: 'Markdown'
    });
    
    console.log('✅ Story sent successfully to Telegram');
    return true;
  } catch (error) {
    console.error('❌ Failed to send story to Telegram:', error);
    throw error;
  }
}

export async function sendAlertToTelegram(chatId, message, options = {}) {
  if (!bot) {
    console.warn('⚠️  Telegram bot not initialized, skipping alert');
    return false;
  }
  
  if (!chatId) {
    console.warn('⚠️  Telegram chat ID not provided, skipping alert');
    return false;
  }
  
  try {
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      ...options
    });
    
    console.log('📱 Alert sent to Telegram');
    return true;
  } catch (error) {
    console.error('❌ Failed to send Telegram alert:', error.message);
    return false;
  }
}

export function getTelegramBot() {
  return bot;
}
