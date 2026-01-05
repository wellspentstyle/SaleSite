import TelegramBot from 'node-telegram-bot-api';

let bot = null;
let approvalHandler = null;

export function initializeTelegramBot(token, onApproval = null) {
  if (!token) {
    console.warn('⚠️  Telegram bot token not provided');
    return null;
  }
  
  try {
    bot = new TelegramBot(token, { polling: true });
    approvalHandler = onApproval;
    
    bot.on('callback_query', async (query) => {
      const data = query.data;
      const chatId = query.message.chat.id;
      const messageId = query.message.message_id;
      
      console.log(`📱 Telegram callback: ${data}`);
      
      if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const [action, saleId] = data.split('_');
        
        if (approvalHandler) {
          try {
            const result = await approvalHandler(action, saleId);
            
            if (result.success) {
              const newText = action === 'approve' 
                ? `✅ *Approved*\n\n${query.message.text.replace('🛍️ *New Sale to Approve*', '').trim()}`
                : `❌ *Rejected*\n\n${query.message.text.replace('🛍️ *New Sale to Approve*', '').trim()}`;
              
              await bot.editMessageText(newText, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown'
              });
            } else {
              await bot.answerCallbackQuery(query.id, {
                text: `Failed: ${result.error}`,
                show_alert: true
              });
            }
          } catch (error) {
            console.error('Approval handler error:', error);
            await bot.answerCallbackQuery(query.id, {
              text: 'Error processing action',
              show_alert: true
            });
          }
        }
      }
      
      await bot.answerCallbackQuery(query.id);
    });
    
    bot.on('polling_error', (error) => {
      if (error.code !== 'ETELEGRAM' || !error.message.includes('409')) {
        console.error('Telegram polling error:', error.message);
      }
    });
    
    console.log('✅ Telegram bot initialized with polling');
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

export async function sendSaleApprovalAlert(chatId, sale) {
  if (!bot) {
    console.warn('⚠️  Telegram bot not initialized, skipping alert');
    return false;
  }
  
  if (!chatId) {
    console.warn('⚠️  Telegram chat ID not provided, skipping alert');
    return false;
  }
  
  try {
    const message = `🛍️ *New Sale to Approve*\n\n` +
      `*${sale.company}* - ${sale.percentOff}% off\n` +
      (sale.extraDiscount ? `+ Extra ${sale.extraDiscount}% off${sale.discountCode ? ' with code' : ''}\n` : '') +
      `Confidence: ${sale.confidence}%\n` +
      (sale.discountCode ? `Code: \`${sale.discountCode}\`\n` : '') +
      (sale.saleUrl ? `\n🔗 ${sale.saleUrl}\n` : '') +
      `\n_From: ${sale.emailFrom}_`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '✅ Approve', callback_data: `approve_${sale.id}` },
          { text: '❌ Reject', callback_data: `reject_${sale.id}` }
        ]
      ]
    };
    
    await bot.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
      reply_markup: keyboard
    });
    
    console.log('📱 Sale approval alert sent to Telegram');
    return true;
  } catch (error) {
    console.error('❌ Failed to send Telegram sale alert:', error.message);
    return false;
  }
}

export function getTelegramBot() {
  return bot;
}
