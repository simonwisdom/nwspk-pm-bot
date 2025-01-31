import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.SITE_URL,
    "X-Title": "Grantmaking Bot",
  }
});

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
  const channelHistory = await getChannelHistory(app, lastDailyUpdate);
  
  const prompt = `You are a professional project manager for a grantmaking committee working on the following task:

${TASK_CONTEXT}

Based on the following Slack conversation history since the last daily update:

${JSON.stringify(channelHistory, null, 2)}

Generate a daily update that includes:

1. Yesterday's Progress:
   - Key discussions and decisions about project evaluation methods
   - Progress on data collection and algorithm development
   - Important insights about specific projects or project categories
   - Updates on co-budgeting and co-writing efforts

2. Today's Focus:
   - Priority tasks for improving the allocation algorithm
   - Data collection and research needs
   - Required committee decisions or discussions
   - Upcoming pull requests or code reviews

3. Attention Needed:
   - Blocked items requiring committee input
   - Questions about evaluation criteria or process
   - Areas where we need more data or research
   - Upcoming deadlines and milestones

Format the message in Slack-compatible markdown with emojis.
Keep the tone professional but friendly.
If there's limited activity, acknowledge that and suggest specific ways to move the process forward.
Reference the task guide principles when relevant to guide the committee's work.`;

  const completion = await openai.chat.completions.create({
    model: "meta-llama/llama-3.3-70b-instruct",
    messages: [
      {
        role: "system",
        content: "You are a professional project manager for a grantmaking committee, responsible for creating clear, motivating daily updates that keep the team focused on their core objectives and methodology."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  return completion.choices[0].message.content;
}

export async function generateThreadResponse(threadHistory) {
  const prompt = `As a project manager for a grantmaking committee working on the following task:

${TASK_CONTEXT}

Respond to the following conversation thread:
${threadHistory.map(msg => `${msg.user}: ${msg.text}`).join('\n')}

Provide a helpful response that:
1. Addresses questions or concerns raised
2. Connects the discussion to the core objectives (impact evaluation, co-budgeting, co-writing)
3. Suggests specific next steps or action items
4. References relevant parts of the task methodology (data collection, algorithm improvement, etc.)
5. Maintains focus on project evaluation rather than funding or team capability

Keep the tone professional but friendly.
Use Slack-compatible markdown and appropriate emojis.
Ground your response in the task guide principles when relevant.`;

  const completion = await openai.chat.completions.create({
    model: "meta-llama/llama-3.3-70b-instruct",
    messages: [
      {
        role: "system",
        content: "You are a helpful project manager for a grantmaking committee, guiding them through a complex process of evaluating and allocating funds to political technology projects using data-driven methods."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  });

  return completion.choices[0].message.content;
} 