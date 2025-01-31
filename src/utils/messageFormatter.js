import { queries } from '../db/index.js';

const formatDate = (date) => {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

export async function formatDailyUpdate() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Fetch data from database
  const [
    yesterdayReviews,
    newApplications,
    blockedReviews,
    pendingTasks
  ] = await Promise.all([
    queries.getGrantReviews(yesterday),
    queries.getNewApplications(yesterday),
    queries.getBlockedReviews(),
    queries.getPendingTasks()
  ]);

  // Format the message blocks
  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `🌅 Good morning grantmaking team! Here's your daily update for ${formatDate(today)}`
      }
    },
    {
      type: "divider"
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📋 Yesterday's Progress:*\n" +
          `• ${yesterdayReviews.length} grant reviews completed\n` +
          `• ${newApplications.length} new grant applications processed\n` +
          "• Key discussions on evaluation criteria and process improvements"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*📝 Today's Focus:*\n" +
          pendingTasks.map(task => `• <@${task.assigned_to}>: ${task.description}`).join('\n')
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: "*❗ Attention Needed:*\n" +
          (blockedReviews.length > 0 
            ? blockedReviews.map(review => `• ${review.application_id}: ${review.blocker_reason}`).join('\n')
            : "No blocked reviews at the moment! 🎉")
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "💬 Reply in this thread with updates or questions!"
        }
      ]
    }
  ];

  return {
    blocks,
    text: `Daily Grantmaking Update for ${formatDate(today)}` // Fallback text
  };
} 