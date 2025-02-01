# Deployment Instructions for Grantmaking Slackbot

## Prerequisites
- A Railway.app account
- A Slack workspace with admin privileges
- Git repository with the bot code
- OpenRouter.ai account and API key
- Node.js 18 or higher

## Step 1: Create Slack App
1. Go to [api.slack.com/apps](https://api.slack.com/apps)
2. Click "Create New App" and choose "From scratch"
3. Name your app "Grantmaking Bot" and select your workspace
4. Under "OAuth & Permissions", add the following bot token scopes:
   - app_mentions:read
   - channels:history
   - channels:read
   - chat:write
   - users:read
   - groups:history
   - im:history
   - mpim:history
You will also need to enable 'Socket Mode', add the scope below, and copy the SLACK_APP_TOKEN
   - connections:write
5. Install the app to your workspace
6. Copy the following tokens and secrets:
   - Bot User OAuth Token (starts with `xoxb-`)
   - App-Level Token (starts with `xapp-`)
   - Signing Secret

## Step 2: Set Up OpenRouter
1. Create an account at [openrouter.ai](https://openrouter.ai)
2. Generate an API key
3. Note down your site URL and name for the HTTP-Referer and X-Title headers
4. The bot uses the `meta-llama/llama-3.3-70b-instruct` model by default

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
- `LOG_LEVEL` (optional, defaults to 'info')

## Step 6: Initial Deployment
1. Railway will automatically deploy your application using the Dockerfile
2. The deployment process includes:
   - Building the Node.js application
   - Installing dependencies
   - Running database migrations automatically
   - Starting the Express server
3. Monitor the deployment logs for any issues
4. The health check endpoint will be available at `/health`

## Step 7: Verify Deployment
1. Check the application logs in Railway to verify:
   - Express server started successfully
   - Database connection established
   - Migrations completed
   - Slack bot connection established
2. The bot will automatically post daily updates at 9:00 AM London time
3. Test thread responses by commenting on the daily update message
4. Verify the health check endpoint is responding at `/health`

## Troubleshooting
- If the bot isn't posting messages, check the Slack token scopes and permissions
- For database issues, check the connection string and migration logs
- Monitor Railway's built-in logging for application errors
- If migrations fail, check the application logs for detailed error messages
- For LLM-related issues, verify OpenRouter API key and rate limits
- Check Winston logs for detailed error information with timestamps


## Development
- Use `npm run dev` for local development with nodemon
- Run `npm run test` to execute the test suite
- Use `npm run lint` to check code quality
- Set up `.env` file locally with required environment variables
- Migrations can be run manually using `npm run migrate`

For reference, see the following files in the codebase:
- Dockerfile for build configuration
- railway.toml for Railway-specific settings
- package.json for scripts and dependencies 