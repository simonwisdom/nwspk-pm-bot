import { App } from '@slack/bolt';
import express from 'express';
import cron from 'node-cron';
import dotenv from 'dotenv';
import winston from 'winston';
import { db } from './db/index.js';
import { formatDailyUpdate } from './utils/messageFormatter.js';
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

// Schedule daily updates (9:00 AM London time)
cron.schedule('0 9 * * *', async () => {
  try {
    const update = await formatDailyUpdate();
    await app.client.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID,
      text: update,
      blocks: update.blocks,
    });
  } catch (error) {
    logger.error('Failed to send daily update:', error);
  }
}, {
  timezone: "Europe/London"
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
    // First, run migrations
    logger.info('Running database migrations...');
    await runMigrations();
    
    // Then start the Express server
    const port = process.env.PORT || 3000;
    expressApp.listen(port, () => {
      logger.info(`Health check server listening on port ${port}`);
    });

    // Finally start the Slack app
    await app.start();
    logger.info('⚡️ Bolt app is running!');
    logger.info('📦 Database connected and migrations completed successfully');
  } catch (error) {
    logger.error('Failed to start app:', error);
    process.exit(1);
  }
})(); 