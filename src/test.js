import dotenv from 'dotenv';
import { generateDailyUpdate, generateThreadResponse } from './services/llm.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

// Get the directory path of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
try {
  const envPath = join(__dirname, '..', '.env');
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
  console.log("Environment variables loaded from .env file");
} catch (error) {
  console.warn("Warning: Could not load .env file:", error.message);
}

// Verify environment variables
console.log("\nEnvironment Configuration:");
console.log("OPENROUTER_API_KEY:", process.env.OPENROUTER_API_KEY ? "✓ Present" : "✗ Missing");
console.log("SITE_URL:", process.env.SITE_URL ? "✓ Present" : "✗ Missing");

// Check required environment variables
const requiredEnvVars = ['OPENROUTER_API_KEY', 'SITE_URL'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error("\nError: Missing required environment variables:");
  missingEnvVars.forEach(varName => console.error(`- ${varName}`));
  process.exit(1);
}

// Mock Slack app for testing
const mockApp = {
  client: {
    conversations: {
      history: async () => ({
        messages: [
          {
            user: "U123",
            text: "I think we should focus on data collection for the civic tech projects first",
            ts: "1709913600.000000"
          },
          {
            user: "U124",
            text: "Agreed. I've started looking at GitHub metrics for open source projects",
            ts: "1709913700.000000",
            thread_ts: "1709913600.000000"
          }
        ]
      }),
      replies: async () => ({
        messages: [
          {
            user: "U123",
            text: "I think we should focus on data collection for the civic tech projects first",
            ts: "1709913600.000000"
          },
          {
            user: "U124",
            text: "Agreed. I've started looking at GitHub metrics for open source projects",
            ts: "1709913700.000000",
            thread_ts: "1709913600.000000"
          }
        ]
      }),
      members: async () => ({
        members: ["U123", "U124", "U125", "U126"]
      })
    },
    users: {
      info: async ({ user }) => {
        const mockUsers = {
          U123: {
            name: "alice",
            real_name: "Alice Johnson",
            is_bot: false,
            deleted: false
          },
          U124: {
            name: "bob",
            real_name: "Bob Smith",
            is_bot: false,
            deleted: false
          },
          U125: {
            name: "charlie",
            real_name: "Charlie Brown",
            is_bot: false,
            deleted: false
          },
          U126: {
            name: "dana",
            real_name: "Dana White",
            is_bot: false,
            deleted: false
          }
        };
        return { user: mockUsers[user] || { is_bot: true, deleted: true } };
      }
    }
  }
};

// Test daily update generation
async function testDailyUpdate() {
  console.log("\n=== Testing Daily Update Generation ===\n");
  try {
    const update = await generateDailyUpdate(mockApp, null);
    console.log("Daily Update Output:");
    console.log(update);
  } catch (error) {
    console.error("Error generating daily update:", error);
    if (error.response) {
      console.error("API Response:", error.response.data);
    }
    throw error;
  }
}

// Test thread response generation
async function testThreadResponse() {
  console.log("\n=== Testing Thread Response Generation ===\n");
  try {
    const threadHistory = [
      {
        user: "U123",
        text: "How should we evaluate projects that don't have public GitHub repositories?"
      },
      {
        user: "U124",
        text: "Maybe we could look at their documentation and public impact reports?"
      }
    ];
    
    const response = await generateThreadResponse(threadHistory);
    console.log("Thread Response Output:");
    console.log(response);
  } catch (error) {
    console.error("Error generating thread response:", error);
    if (error.response) {
      console.error("API Response:", error.response.data);
    }
    throw error;
  }
}

// Run tests
async function runTests() {
  try {
    await testDailyUpdate();
    await testThreadResponse();
    console.log("\nAll tests completed successfully! ✨");
  } catch (error) {
    console.error("\nTests failed! 💥");
    process.exit(1);
  }
}

runTests(); 