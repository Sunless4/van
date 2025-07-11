const fetch = require('node-fetch');

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

async function sendWebhook(title, description) {
  const webhookUrl = process.env.WEBHOOK_URL;
  
  if (!webhookUrl) {
    log('⚠️ No webhook URL configured, skipping notification');
    return;
  }
  
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        embeds: [{
          title,
          description,
          color: title.includes('Successfully') || title.includes('🎉') ? 0x00FF00 : 
                 title.includes('Failed') ? 0xFF0000 : 
                 title.includes('Dropped') ? 0xFFAA00 : 
                 title.includes('Set') ? 0x0099FF :
                 0x9932CC,
          timestamp: new Date().toISOString(),
          footer: {
            text: 'Discord Vanity Monitor • Speed Tracking Enabled'
          }
        }]
      })
    });

    if (response.ok) {
      log(`📢 Webhook sent: ${title}`);
    } else {
      log(`❌ Webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    log(`❌ Webhook error: ${error.message}`);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  log,
  sendWebhook,
  sleep
};
