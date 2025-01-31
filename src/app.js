import { App } from '@slack/bolt';
import express from 'express';
import cron from 'node-cron';
import dotenv from 'dotenv';
import winston from 'winston';
import { db } from './db/index.js';
import { formatDailyUpdate } from './utils/messageFormatter.js';

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

// Start the Express server
const port = process.env.PORT || 3000;
expressApp.listen(port, () => {
  logger.info(`Health check server listening on port ${port}`);
});

// Start the Slack app
(async () => {
  try {
    await app.start();
    logger.info('⚡️ Bolt app is running!');
    
    // Test database connection
    await db.connect();
    logger.info('📦 Database connected successfully');
  } catch (error) {
    logger.error('Failed to start app:', error);
    process.exit(1);
  }
})(); 