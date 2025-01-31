import dotenv from 'dotenv';
dotenv.config();

if (!process.env.OPENROUTER_API_KEY) {
  throw new Error("OPENROUTER_API_KEY is required");
}

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

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
  const channelHistory = await getChannelHistory(app, lastDailyUpdate);
  
  const messages = [{
    role: "user",
    content: `You are a project manager for a grantmaking committee with a mildly sarcastic sense of humor. You're good at your job, but you can't help adding a touch of wit to keep things entertaining. You need to generate a daily update based on this context:

${TASK_CONTEXT}

And this Slack conversation history since the last daily update:

${JSON.stringify(channelHistory, null, 2)}

Generate a daily update that includes:

1. Yesterday's Progress:
   - Key discussions and decisions (with a dash of playful commentary)
   - Progress on data collection and algorithm development
   - Important insights about projects (feel free to be mildly sarcastic about obvious oversights)
   - Updates on co-budgeting and co-writing efforts

2. Today's Focus:
   - Assign specific tasks to team members using @mentions
   - Add witty comments about the tasks while keeping them actionable
   - Include priority levels with a touch of humor
   - Make sure each task has a clear owner and deadline

3. Attention Needed:
   - Call out blockers with a hint of "we all saw this coming"
   - Tag specific people who need to take action
   - Highlight approaching deadlines with mild urgency
   - Point out any "elephant in the room" issues that need addressing

Format the message in Slack-compatible markdown with emojis.
Keep the tone professional but with a dash of wit and mild sarcasm.
If there's limited activity, call it out with a playful nudge.
Make sure to delegate tasks clearly using @mentions.
Reference the task guide principles when relevant, but don't be afraid to point out when we're obviously not following them.`
  }];

  const systemMessage = "You are a witty project manager for a grantmaking committee. You maintain professionalism while adding just enough sarcasm to keep things entertaining. You're direct about task delegation and aren't afraid to call out issues with a touch of humor.";

  return await callOpenRouter(messages, systemMessage);
}

export async function generateThreadResponse(threadHistory) {
  const messages = [{
    role: "user",
    content: `As a mildly sarcastic but effective project manager for a grantmaking committee working on this task:

${TASK_CONTEXT}

Respond to this conversation thread with your characteristic wit:
${threadHistory.map(msg => `${msg.user}: ${msg.text}`).join('\n')}

Provide a response that:
1. Addresses the questions/concerns with a touch of playful commentary
2. Connects to core objectives while pointing out any obvious oversights
3. Delegates specific tasks to people using @mentions
4. Suggests next steps with clear owners and deadlines
5. Maintains focus on project evaluation (while possibly noting when we're getting off track)

Keep the tone professional but witty.
Use Slack-compatible markdown and emojis creatively.
Ground your response in the task guide principles, but feel free to point out when we're clearly ignoring them.
Make sure to assign clear action items to specific people.`
  }];

  const systemMessage = "You are a witty project manager who keeps the team on track with a mix of clear direction and mild sarcasm. You're good at delegating tasks and aren't afraid to point out issues with a touch of humor.";

  return await callOpenRouter(messages, systemMessage);
} 