import { CronJob } from 'cron';
import moment from 'moment-timezone';
import { UserQueries, HabitQueries, HabitEntryQueries, WeeklySummaryQueries } from '../database/queries';
import { sendDailyCheckIn } from '../bot/handlers';
import { bot } from '../bot/bot';

let userQueries: UserQueries;
let habitQueries: HabitQueries;
let habitEntryQueries: HabitEntryQueries;
let weeklySummaryQueries: WeeklySummaryQueries;

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

export function setupScheduler(): void {
  userQueries = new UserQueries();
  habitQueries = new HabitQueries();
  habitEntryQueries = new HabitEntryQueries();
  weeklySummaryQueries = new WeeklySummaryQueries();
  const dailyNotificationJob = new CronJob(
    '0 20 * * *',
    sendDailyNotifications,
    null,
    true,
    TIMEZONE
  );

  const weeklySummaryJob = new CronJob(
    '0 10 * * 0',
    sendWeeklySummaries,
    null,
    true,
    TIMEZONE
  );

  console.log('✅ Scheduler initialized:');
  console.log('   📅 Daily notifications: Every day at 8:00 PM IST');
  console.log('   📊 Weekly summaries: Every Sunday at 10:00 AM IST');
}

async function sendDailyNotifications(): Promise<void> {
  console.log(`🔔 Starting daily notifications at ${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}`);

  try {
    const activeUsers = await userQueries.getAllActiveUsers();
    console.log(`📤 Sending notifications to ${activeUsers.length} users`);

    let successCount = 0;
    let errorCount = 0;

    for (const user of activeUsers) {
      try {
        await sendDailyCheckIn(user.telegram_id);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to send notification to user ${user.telegram_id}:`, error);
        errorCount++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`✅ Daily notifications completed: ${successCount} sent, ${errorCount} failed`);
  } catch (error) {
    console.error('❌ Error in daily notifications:', error);
  }
}

async function sendWeeklySummaries(): Promise<void> {
  console.log(`📊 Starting weekly summaries at ${moment().tz(TIMEZONE).format('YYYY-MM-DD HH:mm:ss')}`);

  try {
    const activeUsers = await userQueries.getAllActiveUsers();
    console.log(`📤 Generating summaries for ${activeUsers.length} users`);

    const weekStart = moment().tz(TIMEZONE).startOf('week').toDate();
    const weekEnd = moment().tz(TIMEZONE).endOf('week').toDate();

    let successCount = 0;
    let errorCount = 0;

    for (const user of activeUsers) {
      try {
        const summary = await generateWeeklySummary(user.id, weekStart, weekEnd);
        if (summary) {
          await weeklySummaryQueries.createWeeklySummary(
            user.id,
            weekStart,
            weekEnd,
            JSON.stringify(summary)
          );
          
          await sendWeeklySummaryMessage(user.telegram_id, summary);
          successCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to send weekly summary to user ${user.telegram_id}:`, error);
        errorCount++;
      }
      
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`✅ Weekly summaries completed: ${successCount} sent, ${errorCount} failed`);
  } catch (error) {
    console.error('❌ Error in weekly summaries:', error);
  }
}

interface HabitSummary {
  name: string;
  completedDays: number;
  totalDays: number;
  completionRate: number;
  streak: number;
}

interface WeeklySummaryData {
  weekRange: string;
  habits: HabitSummary[];
  overallCompletion: number;
  totalHabits: number;
}

async function generateWeeklySummary(userId: number, weekStart: Date, weekEnd: Date): Promise<WeeklySummaryData | null> {
  try {
    const habits = await habitQueries.getUserHabits(userId);
    
    if (habits.length === 0) {
      return null;
    }

    const habitSummaries: HabitSummary[] = [];
    let totalCompletions = 0;
    let totalPossible = 0;

    for (const habit of habits) {
      const entries = await habitEntryQueries.getHabitEntriesForWeek(habit.id, weekStart, weekEnd);
      
      const completedDays = entries.filter(entry => entry.completed).length;
      const totalDays = 7;
      const completionRate = (completedDays / totalDays) * 100;

      let streak = 0;
      const today = moment().tz(TIMEZONE);
      let checkDate = moment(today);
      
      for (let i = 0; i < 30; i++) {
        const dateStr = checkDate.format('YYYY-MM-DD');
        const dayEntry = entries.find(entry => 
          moment(entry.date).format('YYYY-MM-DD') === dateStr
        );
        
        if (dayEntry && dayEntry.completed) {
          streak++;
        } else {
          break;
        }
        
        checkDate.subtract(1, 'day');
      }

      habitSummaries.push({
        name: habit.name,
        completedDays,
        totalDays,
        completionRate,
        streak
      });

      totalCompletions += completedDays;
      totalPossible += totalDays;
    }

    const overallCompletion = totalPossible > 0 ? (totalCompletions / totalPossible) * 100 : 0;

    return {
      weekRange: `${moment(weekStart).format('MMM Do')} - ${moment(weekEnd).format('MMM Do, YYYY')}`,
      habits: habitSummaries,
      overallCompletion,
      totalHabits: habits.length
    };
  } catch (error) {
    console.error('Error generating weekly summary:', error);
    return null;
  }
}

async function sendWeeklySummaryMessage(telegramId: number, summary: WeeklySummaryData): Promise<void> {
  try {
    let message = `📊 **Weekly Habit Summary**\n`;
    message += `📅 ${summary.weekRange}\n\n`;

    message += `🎯 **Overall Progress**\n`;
    message += `${getProgressBar(summary.overallCompletion)} ${summary.overallCompletion.toFixed(1)}%\n\n`;

    message += `📈 **Individual Habits:**\n\n`;

    for (const habit of summary.habits) {
      const emoji = getHabitEmoji(habit.completionRate);
      message += `${emoji} **${habit.name}**\n`;
      message += `   ✅ ${habit.completedDays}/${habit.totalDays} days (${habit.completionRate.toFixed(1)}%)\n`;
      if (habit.streak > 0) {
        message += `   🔥 ${habit.streak} day streak\n`;
      }
      message += `\n`;
    }

    message += `💡 **Tips for next week:**\n`;
    
    const lowPerformingHabits = summary.habits.filter(h => h.completionRate < 70);
    if (lowPerformingHabits.length > 0) {
      message += `• Focus on: ${lowPerformingHabits.map(h => h.name).join(', ')}\n`;
    }
    
    const highPerformingHabits = summary.habits.filter(h => h.completionRate >= 90);
    if (highPerformingHabits.length > 0) {
      message += `• Keep up the excellent work with: ${highPerformingHabits.map(h => h.name).join(', ')}\n`;
    }

    message += `\nKeep building those positive habits! 💪`;

    await bot.api.sendMessage(telegramId, message, {
      parse_mode: 'Markdown'
    });
  } catch (error) {
    console.error(`Error sending weekly summary message to ${telegramId}:`, error);
  }
}

function getProgressBar(percentage: number): string {
  const filled = Math.round(percentage / 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function getHabitEmoji(completionRate: number): string {
  if (completionRate >= 90) return '🏆';
  if (completionRate >= 70) return '⭐';
  if (completionRate >= 50) return '👍';
  if (completionRate >= 30) return '📈';
  return '🎯';
}