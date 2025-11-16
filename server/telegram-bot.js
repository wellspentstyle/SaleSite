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

export function getTelegramBot() {
  return bot;
}
