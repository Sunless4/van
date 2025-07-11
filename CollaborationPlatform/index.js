const dotenv = require('dotenv');
const Monitor = require('./lib/monitor');
const { log, sendWebhook } = require('./lib/utils');

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = ['LISTENER_TOKEN', 'CLAIMER_TOKEN'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('Please check your .env file and ensure all required variables are set.');
  process.exit(1);
}

// Optional environment variables with warnings
if (!process.env.CLAIMER_PASSWORD) {
  log('⚠️ No CLAIMER_PASSWORD set - MFA authentication will not be available');
}

if (!process.env.WEBHOOK_URL) {
  log('⚠️ No WEBHOOK_URL set - notifications will only appear in console');
}

// Initialize the monitor
async function main() {
  try {
    log('🚀 Starting Discord Vanity Monitor and Claimer');
    log(`📊 Monitoring with listener token: ${process.env.LISTENER_TOKEN.substring(0, 20)}...`);
    log(`🎯 Claiming with claimer token: ${process.env.CLAIMER_TOKEN.substring(0, 20)}...`);
    
    if (process.env.GUILD_IDS) {
      const targetGuilds = process.env.GUILD_IDS.split(',').map(id => id.trim());
      log(`🏰 Target guilds for claiming: ${targetGuilds.join(', ')}`);
    } else {
      log('🏰 No specific target guilds - will attempt to claim on all accessible guilds');
    }

    const monitor = new Monitor();
    await monitor.start();
    
    // Keep the process alive
    process.on('SIGINT', () => {
      log('🛑 Received SIGINT, shutting down gracefully...');
      monitor.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      log('🛑 Received SIGTERM, shutting down gracefully...');
      monitor.stop();
      process.exit(0);
    });

  } catch (error) {
    log(`❌ Failed to start application: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log(`💥 Uncaught Exception: ${error.message}`);
  console.error(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log(`💥 Unhandled Rejection at: ${promise}, reason: ${reason}`);
  console.error(reason);
  process.exit(1);
});

// Start the application
main();
