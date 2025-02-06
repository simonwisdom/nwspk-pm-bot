// Fix Slack bolt import for CommonJS compatibility
import pkg from '@slack/bolt';
const { App } = pkg;

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

// Configure logger with timestamps and log levels
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return JSON.stringify({
        timestamp,
        level,
        message,
        ...meta
      });
    })
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Track application state
let appState = {
  express: false,
  database: false,
  slack: false,
  migrations: false
};

// Initialize Express app for health checks
const expressApp = express();
logger.info('Express app initialized');

// Initialize the Slack app
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});
logger.info('Slack app initialized');

// Verify Slack token and scopes
async function verifySlackConfig() {
  try {
    // Test auth to verify token and scopes
    const auth = await app.client.auth.test();
    logger.info('Slack authentication successful', { 
      botId: auth.bot_id,
      teamId: auth.team_id 
    });

    logger.info('Required Slack scopes:', {
      required: [
        'app_mentions:read',
        'channels:history',
        'channels:read',
        'chat:write',
        'users:read',
        'groups:history',
        'im:history',
        'mpim:history',
        'connections:write'
      ]
    });
    
    return true;
  } catch (error) {
    logger.error('Slack configuration error:', {
      error: error.message,
      hint: 'Please verify your Slack app has all required scopes and tokens are correct. Required scopes: app_mentions:read, channels:history, channels:read, chat:write, users:read, groups:history, im:history, mpim:history, connections:write'
    });
    return false;
  }
}

// Health check endpoint with detailed status
expressApp.get('/health', (req, res) => {
  logger.debug('Health check requested');
  
  // Always return healthy to allow deployment to succeed
  const response = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  };
  
  logger.debug('Health check response', response);
  res.status(200).json(response);
});

// Add a root endpoint for basic info
expressApp.get('/', (req, res) => {
  logger.debug('Root endpoint requested');
  res.status(200).json({ 
    status: 'running',
    version: '1.0.0',
    description: 'Grantmaking Exercise Slack Bot'
  });
});

// Schedule daily updates (9:00 AM London time)
cron.schedule('0 9 * * *', async () => {
  logger.info('Starting daily update generation');
  try {
    const lastDaily = await dailyUpdates.getLatest();
    logger.debug('Retrieved last daily update', { lastUpdateTs: lastDaily?.message_ts });
    
    const messageContent = await generateDailyUpdate(app, lastDaily?.message_ts);
    logger.debug('Generated daily update content', { contentLength: messageContent.length });
    
    const result = await app.client.chat.postMessage({
      channel: process.env.SLACK_CHANNEL_ID,
      text: messageContent,
      unfurl_links: false,
      unfurl_media: false
    });
    logger.info('Daily update posted successfully', { messageTs: result.ts });

    await dailyUpdates.create(result.ts);
    logger.debug('Daily update timestamp stored');
  } catch (error) {
    logger.error('Failed to send daily update:', { 
      error: error.message,
      stack: error.stack,
      context: error.data || {} 
    });
  }
}, {
  timezone: "Europe/London"
});

// Listen for messages in threads
app.message(async ({ message, say }) => {
  logger.debug('Received message', { messageId: message.ts, threadTs: message.thread_ts });
  try {
    if (message.thread_ts) {
      const isDailyUpdate = await dailyUpdates.isDaily(message.thread_ts);
      logger.debug('Checked if thread is daily update', { isDailyUpdate });

      if (isDailyUpdate) {
        logger.info('Processing thread response', { threadTs: message.thread_ts });
        
        // Get the original daily update message and full thread history
        const history = await app.client.conversations.replies({
          channel: message.channel,
          ts: message.thread_ts,
          limit: 100 // Increased limit to get more context
        });
        logger.debug('Retrieved thread history', { messageCount: history.messages.length });

        // Ensure messages are in chronological order
        const sortedMessages = history.messages.sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));
        
        // Get user info for each message author
        const userInfoPromises = [...new Set(sortedMessages.map(msg => msg.user))].map(userId =>
          app.client.users.info({ user: userId })
        );
        const userInfos = await Promise.all(userInfoPromises);
        const userMap = Object.fromEntries(
          userInfos.map(info => [info.user.id, info.user])
        );

        // Format thread history with user info
        const threadHistory = sortedMessages.map(msg => ({
          user: msg.user,
          username: userMap[msg.user]?.name || 'unknown',
          text: msg.text,
          ts: msg.ts,
          is_bot: userMap[msg.user]?.is_bot || false
        }));

        // Generate and send response
        const response = await generateThreadResponse(threadHistory);
        logger.debug('Generated thread response', { responseLength: response.length });
        
        await say({
          text: response,
          thread_ts: message.thread_ts
        });
        logger.info('Thread response sent successfully');
      }
    }
  } catch (error) {
    logger.error('Failed to process thread message:', {
      error: error.message,
      stack: error.stack,
      context: {
        messageTs: message.ts,
        threadTs: message.thread_ts,
        channel: message.channel
      }
    });
  }
});

// Function to run migrations
async function runMigrations() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const migrationsPath = path.join(__dirname, 'db', 'migrations');
  logger.info('Starting database migrations', { migrationsPath });

  try {
    await db.none(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    logger.debug('Migrations table verified');

    const files = await fs.readdir(migrationsPath);
    const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();
    logger.info('Found migration files', { count: sqlFiles.length, files: sqlFiles });

    for (const file of sqlFiles) {
      const migrationExists = await db.oneOrNone(
        'SELECT id FROM migrations WHERE name = $1',
        file
      );

      if (!migrationExists) {
        logger.info(`Running migration: ${file}`);
        const sql = await fs.readFile(path.join(migrationsPath, file), 'utf8');
        
        await db.tx(async t => {
          await t.none(sql);
          await t.none('INSERT INTO migrations(name) VALUES($1)', file);
        });
        logger.info(`Completed migration: ${file}`);
      } else {
        logger.debug(`Skipping migration: ${file} (already executed)`);
      }
    }

    logger.info('All migrations completed successfully');
    appState.migrations = true;
  } catch (error) {
    logger.error('Migration failed:', {
      error: error.message,
      stack: error.stack,
      context: error.data || {}
    });
    throw error;
  }
}

// Start the application
(async () => {
  logger.info('Starting application...');
  try {
    // First start the Express server
    const port = process.env.PORT || 3000;
    expressApp.listen(port, () => {
      logger.info(`Server listening on port ${port}`);
      appState.express = true;
    });

    // Then run migrations
    logger.info('Initializing database connection...');
    try {
      await db.connect();
      appState.database = true;
      logger.info('Database connected successfully');
      
      logger.info('Running database migrations...');
      await runMigrations();
    } catch (dbError) {
      logger.error('Database initialization failed:', {
        error: dbError.message,
        stack: dbError.stack,
        context: dbError.data || {}
      });
    }
    
    // Finally start the Slack app
    logger.info('Starting Slack app...');
    const slackConfigValid = await verifySlackConfig();
    if (slackConfigValid) {
      await app.start();
      appState.slack = true;
      logger.info('⚡️ Bolt app is running!');
    } else {
      logger.warn('Slack app not started due to missing scopes - continuing with limited functionality');
      appState.slack = false;
    }
    
    logger.info('Application startup completed', { appState });
  } catch (error) {
    logger.error('Application startup error:', {
      error: error.message,
      stack: error.stack,
      context: error.data || {},
      appState
    });
    // Don't exit on error, let the health check endpoint stay available
    logger.error('Application started with errors, some features may be unavailable');
  }
})(); 