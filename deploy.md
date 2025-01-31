# Deployment Instructions for Grantmaking Slackbot

## Prerequisites
- A Railway.app account
- A Slack workspace with admin privileges
- Git repository with the bot code
- OpenRouter.ai account and API key

## Step 1: Create Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" and choose "From scratch"
3. Name your app "Grantmaking Bot" and select your workspace
4. Under "OAuth & Permissions", add the following bot token scopes:
   - channels:history
   - channels:read
   - chat:write
   - users:read
   - conversations.replies
5. Install the app to your workspace
6. Copy the following tokens and secrets:
   - Bot User OAuth Token (starts with `xoxb-`)
   - App-Level Token (starts with `xapp-`)
   - Signing Secret

## Step 2: Set Up OpenRouter
1. Create an account at [openrouter.ai](https://openrouter.ai)
2. Generate an API key
3. Note down your site URL and name for the HTTP-Referer and X-Title headers

## Step 3: Create Railway Project
1. Log in to [Railway.app](https://railway.app)
2. Click "New Project"
3. Choose "Deploy from GitHub repo"
4. Select your repository
5. Click "Deploy Now"

## Step 4: Add PostgreSQL Database
1. In your Railway project, click "New"
2. Select "Database" → "PostgreSQL"
3. Wait for the database to be provisioned
4. The `DATABASE_URL` will be automatically added to your environment variables

## Step 5: Configure Environment Variables
Add the following environment variables in Railway:
- `SLACK_BOT_TOKEN` (from Step 1)
- `SLACK_APP_TOKEN` (from Step 1)
- `SLACK_SIGNING_SECRET` (from Step 1)
- `SLACK_CHANNEL_ID` (ID of your #grantmaking-exercise channel)
- `TZ=Europe/London`
- `RAILWAY_ENVIRONMENT=production`
- `OPENROUTER_API_KEY` (from Step 2)
- `SITE_URL` (your website URL for OpenRouter tracking)

## Step 6: Initial Deployment
1. Railway will automatically deploy your application
2. Monitor the deployment logs for any issues
3. Once deployed, the health check endpoint will be available at `/health`
4. Database migrations will run automatically on application startup

## Step 7: Verify Deployment
1. Check the application logs in Railway to verify:
   - Successful database migrations
   - Health check endpoint responding
   - Slack bot connection established
2. Wait for the next scheduled message (9:00 AM London time) or test manually
3. Test thread responses by commenting on the daily update message

## Troubleshooting
- If the bot isn't posting messages, check the Slack token permissions
- For database issues, check the connection string and migration logs
- Monitor Railway's built-in logging for any application errors
- If migrations fail, check the application logs for detailed error messages
- For LLM-related issues, verify OpenRouter API key and rate limits

## Maintenance
- Railway will automatically deploy new changes pushed to the main branch
- Monitor the application's health check endpoint
- Review logs periodically for any issues
- Keep dependencies updated using `npm audit` and `npm update`
- New migrations will be automatically applied on application restart
- Monitor OpenRouter API usage and costs 