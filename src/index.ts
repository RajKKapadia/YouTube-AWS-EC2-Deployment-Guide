import dotenv from 'dotenv';
import { bot } from './bot/bot';
import { setupCommands } from './bot/commands';
import { setupHandlers } from './bot/handlers';
import { initializeDatabase, closeDatabase } from './database/connection';
import { setupScheduler } from './services/scheduler';

dotenv.config();

async function main(): Promise<void> {
  try {
    console.log('🚀 Starting Habit Tracker Telegram Bot...');

    console.log('📊 Initializing database...');
    await initializeDatabase();

    console.log('🤖 Setting up bot commands and handlers...');
    await setupCommands(bot);
    setupHandlers(bot);

    console.log('⏰ Setting up scheduler...');
    setupScheduler();

    console.log('🔗 Starting bot...');
    await bot.start();

    console.log('✅ Habit Tracker Bot is running successfully!');
    console.log('🎯 Ready to help users track their habits');
  } catch (error) {
    console.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

process.once('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await bot.stop();
  await closeDatabase();
  console.log('👋 Bot stopped successfully');
  process.exit(0);
});

process.once('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await bot.stop();
  await closeDatabase();
  console.log('👋 Bot stopped successfully');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

if (require.main === module) {
  main();
}