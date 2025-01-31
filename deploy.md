# Deployment Instructions for Grantmaking Slackbot

## Prerequisites
- A Railway.app account
- A Slack workspace with admin privileges
- Git repository with the bot code

## Step 1: Create Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" and choose "From scratch"
3. Name your app "Grantmaking Bot" and select your workspace
4. Under "OAuth & Permissions", add the following bot token scopes:
   - channels:history
   - channels:read
   - chat:write
   - users:read
5. Install the app to your workspace
6. Copy the following tokens and secrets:
   - Bot User OAuth Token (starts with `xoxb-`)
   - App-Level Token (starts with `xapp-`)
   - Signing Secret

## Step 2: Create Railway Project
1. Log in to [Railway.app](https://railway.app)
2. Click "New Project"
3. Choose "Deploy from GitHub repo"
4. Select your repository
5. Click "Deploy Now"

## Step 3: Add PostgreSQL Database
1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Wait for the database to be provisioned
4. The `DATABASE_URL` will be automatically added to your environment variables

## Step 4: Configure Environment Variables
Add the following environment variables in Railway:
- `SLACK_BOT_TOKEN` (from Step 1)
- `SLACK_APP_TOKEN` (from Step 1)
- `SLACK_SIGNING_SECRET` (from Step 1)
- `SLACK_CHANNEL_ID` (ID of your #grantmaking-exercise channel)
- `TZ=Europe/London`
- `RAILWAY_ENVIRONMENT=production`

## Step 5: Initial Deployment
1. Railway will automatically deploy your application
2. Monitor the deployment logs for any issues
3. Once deployed, the health check endpoint will be available at `/health`

## Step 6: Database Migration
1. In Railway's dashboard, go to "Settings" → "Shell"
2. Run the migration command:
   ```bash
   npm run migrate
   ```

## Step 7: Verify Deployment
1. Check the application logs in Railway
2. Verify the health check endpoint is responding
3. Wait for the next scheduled message (9:00 AM London time) or test manually

## Troubleshooting
- If the bot isn't posting messages, check the Slack token permissions
- For database issues, check the connection string and migration logs
- Monitor Railway's built-in logging for any application errors

## Maintenance
- Railway will automatically deploy new changes pushed to the main branch
- Monitor the application's health check endpoint
- Review logs periodically for any issues
- Keep dependencies updated using `npm audit` and `npm update` 