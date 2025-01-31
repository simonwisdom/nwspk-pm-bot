import { App } from '@slack/bolt';
import express from 'express';
import cron from 'node-cron';
import dotenv from 'dotenv';
import winston from 'winston';
import { db, dailyUpdates } from './db/index.js';
import { generateDailyUpdate, generateThreadResponse } from './services/llm.js';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

// Initialize Express app for health checks
const expressApp = express();

// Initialize the Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

// Health check endpoint
expressApp.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Add a root endpoint for basic info
expressApp.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'running',
    version: '1.0.0',
    description: 'Grantmaking Exercise Slack Bot'
  });
});

// Schedule daily updates (9:00 AM London time)
cron.schedule('0 9 * * *', async () => {
  try {
    const lastDaily = await dailyUpdates.getLatest();
    const messageContent = await generateDailyUpdate(app, lastDaily?.message_ts);
    const result = await app.client.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID,
      text: messageContent,
      unfurl_links: false,
      unfurl_media: false
    });

    // Store the timestamp for tracking thread responses
    await dailyUpdates.create(result.ts);
  } catch (error) {
    logger.error('Failed to send daily update:', error);
  }
}, {
  timezone: "Europe/London"
});

// Listen for messages in threads
app.message(async ({ message, say }) => {
  try {
    // Only respond to messages in threads
    if (message.thread_ts) {
      // Check if this is a thread of a daily update
      const isDailyUpdate = await dailyUpdates.isDaily(message.thread_ts);

      if (isDailyUpdate) {
        // Get thread history
        const history = await app.client.conversations.replies({
          channel: message.channel,
          ts: message.thread_ts,
          limit: 10 // Get last 10 messages in thread
        });

        // Format thread history for LLM
        const threadHistory = history.messages.map(msg => ({
          user: msg.user,
          text: msg.text
        }));

        // Generate and send response
        const response = await generateThreadResponse(threadHistory);
        await say({
          text: response,
          thread_ts: message.thread_ts
        });
      }
    }
  } catch (error) {
    logger.error('Failed to process thread message:', error);
  }
});

// Function to run migrations
async function runMigrations() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsPath = path.join(__dirname, 'db', 'migrations');

  try {
    // Create migrations table if it doesn't exist
    await db.none(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Get all SQL files in the migrations directory
    const files = await fs.readdir(migrationsPath);
    const sqlFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Run each migration
    for (const file of sqlFiles) {
      const migrationExists = await db.oneOrNone(
        'SELECT id FROM migrations WHERE name = $1',
        file
      );

      if (!migrationExists) {
        logger.info(`Running migration: ${file}`);
        const sql = await fs.readFile(
          path.join(migrationsPath, file),
          'utf8'
        );

        await db.tx(async t => {
          await t.none(sql);
          await t.none(
            'INSERT INTO migrations(name) VALUES($1)',
            file
          );
        });

        logger.info(`Completed migration: ${file}`);
      } else {
        logger.info(`Skipping migration: ${file} (already executed)`);
      }
    }

    logger.info('All migrations completed successfully');
  } catch (error) {
    logger.error('Migration failed:', error);
    throw error; // Re-throw to be caught by the startup process
  }
}

// Start the application
(async () => {
  try {
    // First start the Express server
    const port = process.env.PORT || 3000;
    expressApp.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
    });

    // Then run migrations
    logger.info('Running database migrations...');
    await runMigrations();
    
    // Finally start the Slack app
    await app.start();
    logger.info('⚡️ Bolt app is running!');
    logger.info('📦 Database connected and migrations completed successfully');
  } catch (error) {
    logger.error('Failed to start app:', error);
    // Don't exit on error, let the health check endpoint stay available
    logger.error('Application started with errors, some features may be unavailable');
  }
})(); 