import { Bot, CommandContext } from 'grammy';
import { BotContext, createKeyboard } from './bot';
import { UserQueries, HabitQueries, HabitEntryQueries } from '../database/queries';
import moment from 'moment-timezone';

let userQueries: UserQueries;
let habitQueries: HabitQueries;
let habitEntryQueries: HabitEntryQueries;

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

export async function setupCommands(bot: Bot<BotContext>): Promise<void> {
  userQueries = new UserQueries();
  habitQueries = new HabitQueries();
  habitEntryQueries = new HabitEntryQueries();
  bot.command('start', handleStart);
  bot.command('help', handleHelp);
  bot.command('habits', handleHabits);
  bot.command('addhabit', handleAddHabit);
  bot.command('deletehabit', handleDeleteHabit);
  bot.command('checkin', handleCheckin);
  bot.command('notifications', handleNotifications);
  bot.command('summary', handleSummary);

  try {
    await bot.api.setMyCommands([
      { command: 'start', description: 'Start using the habit tracker bot' },
      { command: 'help', description: 'Show help information' },
      { command: 'habits', description: 'View your current habits' },
      { command: 'addhabit', description: 'Add a new habit to track' },
      { command: 'deletehabit', description: 'Delete an existing habit' },
      { command: 'checkin', description: 'Check in on your habits for today' },
      { command: 'notifications', description: 'Manage daily notifications' },
      { command: 'summary', description: 'Get your weekly habit summary' },
    ]);

    await bot.api.setMyShortDescription('Track daily habits with reminders and weekly summaries');
    
    // Optimized description within 512 character limit - no emojis for compatibility
    await bot.api.setMyDescription(
      'Habit Tracker Bot - Your Personal Habit Companion\n\n' +
      'Build lasting routines with daily tracking and automated reminders.\n\n' +
      'Features:\n' +
      '- Track unlimited custom habits\n' +
      '- Daily check-in reminders at 8 PM IST\n' +
      '- Weekly progress summaries every Sunday\n' +
      '- Interactive buttons for easy responses\n' +
      '- Personalized notification settings\n\n' +
      'How it works:\n' +
      '1. Add habits using /addhabit\n' +
      '2. Get daily reminders to check in\n' +
      '3. Mark completed with Yes/No buttons\n' +
      '4. Receive weekly progress reports\n\n' +
      'Start building better habits today!'
    );
  } catch (error) {
    console.error('Error setting up bot commands and descriptions:', error);
  }
}

async function handleStart(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    let user = await userQueries.getUserByTelegramId(telegramId);

    if (!user) {
      user = await userQueries.createUser(
        telegramId,
        ctx.from?.username,
        ctx.from?.first_name,
        ctx.from?.last_name
      );

      await ctx.reply(
        `🎉 Welcome to Habit Tracker! I'm here to help you build and maintain positive daily habits.\n\n` +
        `Let's start by setting up your first habit. Use /addhabit to add a habit you want to track daily.\n\n` +
        `💡 *Tips:*\n` +
        `• Start with 1-3 simple habits\n` +
        `• Use clear, specific names (e.g., "Drink 8 glasses of water")\n` +
        `• I'll remind you daily at 8 PM IST\n\n` +
        `Use /help to see all available commands.`,
        { parse_mode: 'Markdown' }
      );
    } else {
      const habits = await habitQueries.getUserHabits(user.id);
      const habitCount = habits.length;

      await ctx.reply(
        `👋 Welcome back! You currently have ${habitCount} active habit${habitCount !== 1 ? 's' : ''}.\n\n` +
        `Use /habits to view them or /addhabit to add more.\n\n` +
        `Need help? Use /help to see all commands.`,
        {
          reply_markup: createKeyboard([
            { text: '📋 View My Habits', data: 'view_habits' },
            { text: '➕ Add New Habit', data: 'add_habit' },
            { text: '📝 Check In Today', data: 'checkin' },
            { text: '⚙️ Settings', data: 'settings' }
          ])
        }
      );
    }
  } catch (error) {
    console.error('Error in start command:', error);
    await ctx.reply('Sorry, something went wrong. Please try again.');
  }
}

async function handleHelp(ctx: CommandContext<BotContext>): Promise<void> {
  const helpText = `
🆘 **Help - Habit Tracker Bot**

**Available Commands:**
/start - Start using the bot
/habits - View your current habits
/addhabit - Add a new habit
/deletehabit - Delete a habit
/checkin - Check in on your habits for today
/notifications - Enable/disable notifications
/summary - Get your weekly summary

**How Daily Tracking Works:**
• Use /checkin anytime to check in on your habits
• You'll get a reminder at 8 PM IST if you haven't checked in
• Respond with Yes/No buttons for each habit
• Missing responses count as "not completed"

**Weekly Summaries:**
• Sent every Sunday at 10 AM IST
• Shows your completion rate for each habit
• Helps you track your progress

**Tips for Success:**
1. Start small with 1-3 habits
2. Be specific with habit names
3. Respond to daily check-ins promptly
4. Review your weekly summaries

Need more help? Contact support or check the bot description.
  `;

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
}

async function handleHabits(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const user = await userQueries.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start first to register.');
      return;
    }

    const habits = await habitQueries.getUserHabits(user.id);

    if (habits.length === 0) {
      await ctx.reply(
        'You don\'t have any habits yet! Use /addhabit to create your first habit.',
        {
          reply_markup: createKeyboard([
            { text: '➕ Add First Habit', data: 'add_habit' }
          ])
        }
      );
      return;
    }

    let message = `📋 **Your Current Habits** (${habits.length})\n\n`;
    habits.forEach((habit, index) => {
      message += `${index + 1}. ${habit.name}\n`;
      if (habit.description) {
        message += `   _${habit.description}_\n`;
      }
      message += '\n';
    });

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: createKeyboard([
        { text: '➕ Add New Habit', data: 'add_habit' },
        { text: '🗑️ Delete Habit', data: 'delete_habit' },
        { text: '⚙️ Settings', data: 'settings' }
      ])
    });
  } catch (error) {
    console.error('Error in habits command:', error);
    await ctx.reply('Sorry, something went wrong. Please try again.');
  }
}

async function handleAddHabit(ctx: CommandContext<BotContext>): Promise<void> {
  await ctx.reply(
    '➕ **Add New Habit**\n\n' +
    'Please send me the name of the habit you want to track.\n\n' +
    '💡 *Examples:*\n' +
    '• "Drink 8 glasses of water"\n' +
    '• "Exercise for 30 minutes"\n' +
    '• "Read for 20 minutes"\n' +
    '• "Meditate"\n\n' +
    'Keep it clear and specific!\n\n' +
    'Send /cancel to stop adding a habit.',
    { parse_mode: 'Markdown' }
  );

  ctx.session.awaitingHabitName = true;
}

async function handleDeleteHabit(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const user = await userQueries.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start first to register.');
      return;
    }

    const habits = await habitQueries.getUserHabits(user.id);

    if (habits.length === 0) {
      await ctx.reply('You don\'t have any habits to delete.');
      return;
    }

    let message = '🗑️ **Delete Habit**\n\nSelect the habit you want to delete:\n\n';

    const keyboard = createKeyboard(
      habits.map((habit, index) => ({
        text: `${index + 1}. ${habit.name}`,
        data: `delete_habit_${habit.id}`
      }))
    );

    keyboard.text('❌ Cancel', 'cancel');

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error in delete habit command:', error);
    await ctx.reply('Sorry, something went wrong. Please try again.');
  }
}

async function handleCheckin(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const user = await userQueries.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start first to register.');
      return;
    }

    const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');
    const todayDate = new Date(today);

    const habitsWithStatus = await habitEntryQueries.getUserHabitsWithTodayStatus(user.id, todayDate);

    if (habitsWithStatus.length === 0) {
      await ctx.reply(
        'You don\'t have any habits to check in for! Use /addhabit to create your first habit.',
        {
          reply_markup: createKeyboard([
            { text: '➕ Add First Habit', data: 'add_habit' },
            { text: '🏠 Main Menu', data: 'main_menu' }
          ])
        }
      );
      return;
    }

    // Check if user has already checked in for all habits today
    const allCheckedIn = habitsWithStatus.every(habit => habit.checked_in);
    
    if (allCheckedIn) {
      let message = `✅ **Daily Check-in Complete**\n\n`;
      message += `You've already checked in for all your habits today (${moment().tz(TIMEZONE).format('MMMM Do, YYYY')})!\n\n`;
      
      habitsWithStatus.forEach((habit, index) => {
        const status = habit.completed ? '✅' : '❌';
        message += `${status} ${habit.name}\n`;
      });

      message += `\n🎉 Great job staying on track! You won't receive a notification reminder today since you've already checked in.`;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: createKeyboard([
          { text: '📋 View My Habits', data: 'view_habits' },
          { text: '🏠 Main Menu', data: 'main_menu' }
        ])
      });
      return;
    }

    // Show check-in interface for remaining habits
    let message = `📝 **Daily Habit Check-in**\n\n`;
    message += `Time to check in on your habits for ${moment().tz(TIMEZONE).format('MMMM Do, YYYY')}!\n\n`;
    
    const uncheckedHabits = habitsWithStatus.filter(habit => !habit.checked_in);
    const checkedHabits = habitsWithStatus.filter(habit => habit.checked_in);

    if (checkedHabits.length > 0) {
      message += `✅ **Already completed:**\n`;
      checkedHabits.forEach(habit => {
        const status = habit.completed ? '✅' : '❌';
        message += `${status} ${habit.name}\n`;
      });
      message += `\n`;
    }

    message += `📋 **Remaining habits to check:**\n`;
    uncheckedHabits.forEach((habit, index) => {
      message += `• ${habit.name}\n`;
    });

    message += `\nSelect each habit to mark as completed or not completed:`;

    // Create buttons for unchecked habits
    const keyboard = createKeyboard(
      uncheckedHabits.flatMap(habit => [
        { text: `✅ ${habit.name} - Yes`, data: `checkin_habit_${habit.id}_yes` },
        { text: `❌ ${habit.name} - No`, data: `checkin_habit_${habit.id}_no` }
      ])
    );

    await ctx.reply(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error in checkin command:', error);
    await ctx.reply('Sorry, something went wrong. Please try again.');
  }
}

async function handleNotifications(ctx: CommandContext<BotContext>): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const user = await userQueries.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start first to register.');
      return;
    }

    const status = user.notifications_enabled ? 'enabled' : 'disabled';
    const emoji = user.notifications_enabled ? '🔔' : '🔕';

    await ctx.reply(
      `${emoji} **Notification Settings**\n\n` +
      `Daily notifications are currently **${status}**.\n\n` +
      `When enabled, you'll receive daily reminders at 8 PM IST to check in on your habits.`,
      {
        parse_mode: 'Markdown',
        reply_markup: createKeyboard([
          {
            text: user.notifications_enabled ? '🔕 Disable Notifications' : '🔔 Enable Notifications',
            data: 'toggle_notifications'
          },
          { text: '⬅️ Back to Menu', data: 'main_menu' }
        ])
      }
    );
  } catch (error) {
    console.error('Error in notifications command:', error);
    await ctx.reply('Sorry, something went wrong. Please try again.');
  }
}

async function handleSummary(ctx: CommandContext<BotContext>): Promise<void> {
  await ctx.reply(
    '📊 **Weekly Summary**\n\n' +
    'Weekly summaries are automatically sent every Sunday at 10 AM IST.\n\n' +
    'The summary includes:\n' +
    '• Completion rate for each habit\n' +
    '• Streak information\n' +
    '• Progress compared to previous week\n\n' +
    'Keep tracking your habits daily to get detailed insights!',
    { parse_mode: 'Markdown' }
  );
}