import dotenv from 'dotenv';
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
      messages: requestMessages
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

export async function generateDailyUpdate(app, lastDailyUpdate) {
  const [channelHistory, channelMembers] = await Promise.all([
    getChannelHistory(app, lastDailyUpdate),
    getChannelMembers(app)
  ]);
  
  const messages = [{
    role: "user",
    content: `You are a project manager for a grantmaking committee with a mildly sarcastic sense of humor. You're good at your job, but you can't help adding a touch of wit to keep things entertaining. You need to generate a daily update based on this context:

${TASK_CONTEXT}

Channel Members (for task delegation):
${JSON.stringify(channelMembers, null, 2)}

And this Slack conversation history since the last daily update:
${JSON.stringify(channelHistory, null, 2)}

Generate a daily update using Slack's native formatting:

1. Use *bold* with asterisks
2. Use _italic_ with underscores
3. Tag users with their exact ID like <@U123456789>
4. Create bullet points with •
5. Use > for quotes or emphasis
6. Use \`code\` for technical terms
7. Use emojis directly

Structure the update as:

*### Daily Update: Because We Need to Stay on Track* :coffee:

*#### Yesterday's Progress:*
• Key discussions and decisions (with a dash of playful commentary)
• Progress on data collection and algorithm development
• Important insights about projects (feel free to be mildly sarcastic about obvious oversights)
• Updates on co-budgeting and co-writing efforts

*#### Today's Focus:*
• Assign specific tasks using proper Slack user IDs from the member list (e.g., <@U123456789>)
• Try to distribute tasks evenly among available members
• Add witty comments about the tasks while keeping them actionable
• Include priority levels with a touch of humor
• Make sure each task has a clear owner and deadline

*#### Attention Needed:*
• Call out blockers with a hint of "we all saw this coming"
• Tag specific people using their Slack user IDs
• Highlight approaching deadlines with mild urgency
• Point out any "elephant in the room" issues that need addressing

Keep the tone professional but with a dash of wit and mild sarcasm.
If there's limited activity, call it out with a playful nudge.
Make sure to use the exact Slack user IDs from the channel members list for tagging.
Reference the task guide principles when relevant, but don't be afraid to point out when we're obviously not following them.`
  }];

  const systemMessage = "You are a witty project manager for a grantmaking committee. You maintain professionalism while adding just enough sarcasm to keep things entertaining. You're direct about task delegation and aren't afraid to call out issues with a touch of humor. Use Slack's native formatting and proper user tagging.";

  return await callOpenRouter(messages, systemMessage);
}

export async function generateThreadResponse(threadHistory) {
  // Separate the original message from the replies
  const originalMessage = threadHistory[0];
  const replies = threadHistory.slice(1);
  
  const messages = [{
    role: "user",
    content: `As a mildly sarcastic but effective project manager for a grantmaking committee working on this task:

${TASK_CONTEXT}

The original daily update was:
<@${originalMessage.user}>: ${originalMessage.text}

The conversation thread so far:
${replies.map(msg => `<@${msg.user}>: ${msg.text}`).join('\n')}

Provide a response using Slack's native formatting:
1. Use *bold* with asterisks
2. Use _italic_ with underscores
3. Tag users with their exact ID like <@U123456789>
4. Create bullet points with •
5. Use > for quotes or emphasis
6. Use \`code\` for technical terms
7. Use emojis directly

Your response should:
• Address the questions/concerns raised in the thread
• Reference relevant parts of the original daily update
• Connect the discussion to our core objectives
• Delegate specific tasks using proper Slack user IDs
• Suggest next steps with clear owners and deadlines
• Keep the conversation focused on project evaluation
• Point out if we're getting off track (with a touch of humor)

Keep the tone professional but witty.
Use Slack's native formatting consistently.
Ground your response in the task guide principles.
Make sure to use the exact Slack user IDs for tagging people.
Feel free to reference earlier messages in the thread when relevant.`
  }];

  const systemMessage = "You are a witty project manager who keeps the team on track with a mix of clear direction and mild sarcasm. You're good at delegating tasks and aren't afraid to point out issues with a touch of humor. Use Slack's native formatting and proper user tagging. Consider both the original message and the full thread context when responding.";

  return await callOpenRouter(messages, systemMessage);
} 