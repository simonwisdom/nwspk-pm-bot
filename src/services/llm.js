import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
dotenv.config();

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is required");
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

// Cache for channel members
let channelMembersCache = null;
let lastCacheUpdate = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function getChannelMembers(app) {
  // Return cached data if available and fresh
  if (channelMembersCache && lastCacheUpdate && (Date.now() - lastCacheUpdate < CACHE_DURATION)) {
    return channelMembersCache;
  }

  try {
    // Get channel members
    const result = await app.client.conversations.members({
      channel: process.env.SLACK_CHANNEL_ID
    });

    // Get user info for each member
    const memberPromises = result.members.map(async (userId) => {
      const userInfo = await app.client.users.info({ user: userId });
      return {
        id: userId,
        name: userInfo.user.name,
        real_name: userInfo.user.real_name,
        is_bot: userInfo.user.is_bot,
        is_active: !userInfo.user.deleted
      };
    });

    const members = await Promise.all(memberPromises);
    
    // Filter out bots and inactive users
    const activeHumanMembers = members.filter(member => 
      !member.is_bot && member.is_active
    );

    // Update cache
    channelMembersCache = activeHumanMembers;
    lastCacheUpdate = Date.now();

    return activeHumanMembers;
  } catch (error) {
    console.error('Error fetching channel members:', error);
    return [];
  }
}

async function callOpenRouter(messages, systemMessage = null) {
  const requestMessages = systemMessage 
    ? [{ role: "system", content: systemMessage }, ...messages]
    : messages;

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.SITE_URL || "http://localhost:3000",
      "X-Title": "Grantmaking Bot",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "meta-llama/llama-3.3-70b-instruct",
      messages: requestMessages,
      temperature: 1.5
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenRouter API error: ${error.message || response.statusText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

const TASK_CONTEXT = `This is a grantmaking exercise where a committee must allocate £5,000,000 across 293 political technology projects. Key points:

- Focus on evaluating project design, goals, and theory of change
- Don't consider current funding or team capability
- Emphasis on three activities: impact evaluation, co-budgeting, and co-writing
- Committee must use data-driven approaches and research
- Process is as important as the final allocation
- Deadline: April 4th 2025 for allocation and justification
- Committee members will reflect on process, learnings, and standout projects

The exercise involves:
1. Collecting data about projects
2. Applying algorithms to determine allocation
3. Continuous deployment of improvements
4. Handling partial data effectively
5. Considering multiple data sources beyond just committee opinions
6. Starting with MVP (equal allocation) and iteratively improving
7. Using pull requests and commit messages to document justification`;

async function getChannelHistory(app, lastDailyUpdate = null) {
  try {
    // If no lastDailyUpdate, get messages from the last 24 hours
    const oldest = lastDailyUpdate || Math.floor(Date.now()/1000) - 86400;
    
    // Get all messages since the last daily update
    const result = await app.client.conversations.history({
      channel: process.env.SLACK_CHANNEL_ID,
      oldest: oldest,
      limit: 100,
      inclusive: true
    });

    // Get all thread replies for messages in this timeframe
    const threadPromises = result.messages
      .filter(msg => msg.thread_ts)
      .map(async msg => {
        const replies = await app.client.conversations.replies({
          channel: process.env.SLACK_CHANNEL_ID,
          ts: msg.thread_ts,
          limit: 100
        });
        return replies.messages;
      });

    const threadReplies = await Promise.all(threadPromises);
    
    // Combine main channel messages and thread replies
    const allMessages = [
      ...result.messages,
      ...threadReplies.flat()
    ].sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

    // Format messages for the LLM
    return allMessages.map(msg => ({
      timestamp: new Date(parseFloat(msg.ts) * 1000).toISOString(),
      user: msg.user,
      text: msg.text,
      thread_ts: msg.thread_ts || null,
      is_thread_reply: !!msg.thread_ts
    }));
  } catch (error) {
    console.error('Error fetching channel history:', error);
    return [];
  }
}

async function loadReferenceDoc(filename) {
  try {
    const filePath = path.join(process.cwd(), 'src', 'reference_docs', filename);
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    console.error(`Error loading reference doc ${filename}:`, error);
    return null;
  }
}

async function loadAllReferenceDocs() {
  try {
    const docsDir = path.join(process.cwd(), 'src', 'reference_docs');
    const files = await fs.readdir(docsDir);
    const docs = await Promise.all(
      files.map(async file => {
        const content = await loadReferenceDoc(file);
        return { name: file, content };
      })
    );
    return docs.filter(doc => doc.content !== null);
  } catch (error) {
    console.error('Error loading reference docs:', error);
    return [];
  }
}

export async function generateDailyUpdate(app, lastDailyUpdate) {
  const [channelHistory, channelMembers] = await Promise.all([
    getChannelHistory(app, lastDailyUpdate),
    getChannelMembers(app)
  ]);
  
  const messages = [{
    role: "user",
    content: `You're a witty project manager for a grantmaking committee. Generate a daily update based on:
  
  ${TASK_CONTEXT}
  Channel Members: ${JSON.stringify(channelMembers, null, 2)}
  Slack History: ${JSON.stringify(channelHistory, null, 2)}
  
  Use Slack formatting: *bold*, _italic_, <@U123456789> for user tags, • bullets, > quotes, \`code\`, and emojis
  
  Daily Update :coffee:
  
  Progress:
  - Summarize what's been discussed since the last update, be specific. Mention the names of the people who have spoken and the content of their messages.
  
  Keep it concise but witty. Use exact Slack IDs for tagging.`
  }];

  const systemMessage = "You are a delightfully unfiltered project manager for a grantmaking committee. You maintain just enough professionalism to avoid HR incidents while serving brutal honesty with a side of snark, treating mediocrity like that mysterious break room leftover. You're direct about task delegation and aren't afraid to call out issues with the kind of sting that makes people want to work harder. Use Slack's native formatting and proper user tagging.";

  return await callOpenRouter(messages, systemMessage);
}

export async function generateThreadResponse(threadHistory) {
  const referenceDocs = await loadAllReferenceDocs();
  const originalMessage = threadHistory[0];
  const replies = threadHistory.slice(1);
  
  const messages = [{
    role: "user",
    content: `As a snarky project manager for a grantmaking committee:

Original message:
<@${originalMessage.user}>: ${originalMessage.text}

Thread:
${replies.map(msg => `<@${msg.user}>: ${msg.text}`).join('\n')}

Provide a brief, focused response (2-3 sentences max) that:
• Answers questions directly with a touch of sarcasm, and addresses the person who asked the question
• Proposes helpful, actionable suggestions
• Ask an open ended question that stimulates divergent thinking

Use Slack formatting (*bold*, _italic_, <@user>) sparingly. Use one to three emojis per response. Do not tag users in your response.`
  }];

  const systemMessage = "You are a delightfully unfiltered project manager for a grantmaking committee. You maintain just enough professionalism to avoid HR incidents while serving brutal honesty with a side of snark, treating mediocrity like that mysterious break room leftover. You're direct about task delegation and aren't afraid to call out issues with the kind of sting that makes people want to work harder. Use Slack's native formatting and proper user tagging. Keep responses to a sentence or two, and use bullet points.";

  return await callOpenRouter(messages, systemMessage);
} 