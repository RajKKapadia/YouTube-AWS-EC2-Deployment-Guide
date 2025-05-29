import { Bot, Context } from 'grammy';
import { BotContext, createKeyboard, bot } from './bot';
import { UserQueries, HabitQueries, HabitEntryQueries, NotificationQueries } from '../database/queries';
import moment from 'moment-timezone';

let userQueries: UserQueries;
let habitQueries: HabitQueries;
let habitEntryQueries: HabitEntryQueries;
let notificationQueries: NotificationQueries;

const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

export function setupHandlers(bot: Bot<BotContext>): void {
  userQueries = new UserQueries();
  habitQueries = new HabitQueries();
  habitEntryQueries = new HabitEntryQueries();
  notificationQueries = new NotificationQueries();
  bot.on('message:text', handleTextMessage);
  bot.on('callback_query:data', handleCallbackQuery);
}

async function handleTextMessage(ctx: Context & BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  const text = ctx.message?.text;
  
  if (!telegramId || !text) return;

  // Check if user wants to cancel
  if (text === '/cancel' && ctx.session.awaitingHabitName) {
    ctx.session.awaitingHabitName = false;
    await ctx.reply('❌ Habit creation cancelled.', {
      reply_markup: createKeyboard([
        { text: '🏠 Main Menu', data: 'main_menu' }
      ])
    });
    return;
  }

  // Check if user is in habit creation mode
  if (ctx.session.awaitingHabitName) {
    await handleNewHabitName(ctx, text);
    return;
  }

  // Default response for unrecognized commands
  await ctx.reply(
    'I didn\'t understand that command. Use /help to see available commands or /start to return to the main menu.',
    {
      reply_markup: createKeyboard([
        { text: '🏠 Main Menu', data: 'main_menu' },
        { text: '🆘 Help', data: 'help' }
      ])
    }
  );
}

async function handleNewHabitName(ctx: Context & BotContext, habitName: string): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const user = await userQueries.getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply('Please use /start first to register.');
      return;
    }

    if (habitName.length > 100) {
      await ctx.reply('Habit name is too long. Please keep it under 100 characters.');
      return;
    }

    await habitQueries.createHabit(user.id, habitName);
    
    // Clear the session state
    ctx.session.awaitingHabitName = false;
    
    await ctx.reply(
      `✅ Great! I've added "${habitName}" to your habits.\n\n` +
      `You'll start receiving daily reminders at 8 PM IST to track this habit along with your others.\n\n` +
      `Want to add another habit or view all your habits?`,
      {
        reply_markup: createKeyboard([
          { text: '📋 View My Habits', data: 'view_habits' },
          { text: '➕ Add Another Habit', data: 'add_habit' },
          { text: '🏠 Main Menu', data: 'main_menu' }
        ])
      }
    );
  } catch (error) {
    console.error('Error adding habit:', error);
    await ctx.reply('Sorry, something went wrong while adding your habit. Please try again.');
  }
}

async function handleCallbackQuery(ctx: Context & BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  const telegramId = ctx.from?.id;
  
  if (!telegramId || !data) return;

  try {
    await ctx.answerCallbackQuery();

    switch (data) {
      case 'main_menu':
        await handleMainMenu(ctx);
        break;
      case 'view_habits':
        await handleViewHabits(ctx);
        break;
      case 'add_habit':
        await handleAddHabitCallback(ctx);
        break;
      case 'delete_habit':
        await handleDeleteHabitCallback(ctx);
        break;
      case 'settings':
        await handleSettings(ctx);
        break;
      case 'toggle_notifications':
        await handleToggleNotifications(ctx);
        break;
      case 'checkin':
        await handleCheckinCallback(ctx);
        break;
      case 'help':
        await handleHelpCallback(ctx);
        break;
      case 'cancel':
        await handleCancel(ctx);
        break;
      default:
        if (data.startsWith('delete_habit_')) {
          await handleDeleteSpecificHabit(ctx, data);
        } else if (data.startsWith('checkin_habit_')) {
          await handleCheckinHabitResponse(ctx, data);
        } else if (data.startsWith('habit_')) {
          await handleHabitResponse(ctx, data);
        } else if (data === 'noop') {
          // Do nothing for spacer buttons
        } else {
          await ctx.editMessageText('Unknown action. Please try again.');
        }
    }
  } catch (error) {
    console.error('Error handling callback query:', error);
    await ctx.answerCallbackQuery('Something went wrong. Please try again.');
  }
}

async function handleMainMenu(ctx: Context & BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userQueries.getUserByTelegramId(telegramId);
  if (!user) return;

  const habits = await habitQueries.getUserHabits(user.id);
  const habitCount = habits.length;

  await ctx.editMessageText(
    `🏠 **Main Menu**\n\n` +
    `You have ${habitCount} active habit${habitCount !== 1 ? 's' : ''}.\n\n` +
    `What would you like to do?`,
    {
      parse_mode: 'Markdown',
      reply_markup: createKeyboard([
        { text: '📋 View My Habits', data: 'view_habits' },
        { text: '➕ Add New Habit', data: 'add_habit' },
        { text: '📝 Check In Today', data: 'checkin' },
        { text: '⚙️ Settings', data: 'settings' },
        { text: '🆘 Help', data: 'help' }
      ])
    }
  );
}

async function handleViewHabits(ctx: Context & BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userQueries.getUserByTelegramId(telegramId);
  if (!user) return;

  const habits = await habitQueries.getUserHabits(user.id);
  
  if (habits.length === 0) {
    await ctx.editMessageText(
      'You don\'t have any habits yet! Add your first habit to get started.',
      {
        reply_markup: createKeyboard([
          { text: '➕ Add First Habit', data: 'add_habit' },
          { text: '🏠 Main Menu', data: 'main_menu' }
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

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: createKeyboard([
      { text: '➕ Add New Habit', data: 'add_habit' },
      { text: '🗑️ Delete Habit', data: 'delete_habit' },
      { text: '🏠 Main Menu', data: 'main_menu' }
    ])
  });
}

async function handleAddHabitCallback(ctx: Context & BotContext): Promise<void> {
  await ctx.editMessageText(
    '➕ **Add New Habit**\n\n' +
    'Please send me the name of the habit you want to track.\n\n' +
    '💡 *Examples:*\n' +
    '• "Drink 8 glasses of water"\n' +
    '• "Exercise for 30 minutes"\n' +
    '• "Read for 20 minutes"\n' +
    '• "Meditate"\n\n' +
    'Keep it clear and specific!\n\n' +
    'Send /cancel to stop adding a habit.',
    {
      parse_mode: 'Markdown',
      reply_markup: createKeyboard([
        { text: '❌ Cancel', data: 'main_menu' }
      ])
    }
  );
  
  ctx.session.awaitingHabitName = true;
}

async function handleDeleteHabitCallback(ctx: Context & BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userQueries.getUserByTelegramId(telegramId);
  if (!user) return;

  const habits = await habitQueries.getUserHabits(user.id);
  
  if (habits.length === 0) {
    await ctx.editMessageText(
      'You don\'t have any habits to delete.',
      {
        reply_markup: createKeyboard([
          { text: '🏠 Main Menu', data: 'main_menu' }
        ])
      }
    );
    return;
  }

  let message = '🗑️ **Delete Habit**\n\nSelect the habit you want to delete:\n\n';
  
  const keyboard = createKeyboard(
    habits.map((habit, index) => ({
      text: `${index + 1}. ${habit.name}`,
      data: `delete_habit_${habit.id}`
    }))
  );
  
  keyboard.text('❌ Cancel', 'main_menu');

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

async function handleDeleteSpecificHabit(ctx: Context & BotContext, data: string): Promise<void> {
  const habitId = parseInt(data.split('_')[2]);
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userQueries.getUserByTelegramId(telegramId);
  if (!user) return;

  const habit = await habitQueries.getHabitById(habitId);
  if (!habit) {
    await ctx.editMessageText('Habit not found.');
    return;
  }

  const success = await habitQueries.deleteHabit(habitId, user.id);
  
  if (success) {
    await ctx.editMessageText(
      `✅ Successfully deleted "${habit.name}" from your habits.\n\n` +
      `Your remaining habits will continue to be tracked as usual.`,
      {
        reply_markup: createKeyboard([
          { text: '📋 View Remaining Habits', data: 'view_habits' },
          { text: '🏠 Main Menu', data: 'main_menu' }
        ])
      }
    );
  } else {
    await ctx.editMessageText('Failed to delete habit. Please try again.');
  }
}

async function handleSettings(ctx: Context & BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userQueries.getUserByTelegramId(telegramId);
  if (!user) return;

  const notificationStatus = user.notifications_enabled ? 'enabled' : 'disabled';
  const emoji = user.notifications_enabled ? '🔔' : '🔕';

  await ctx.editMessageText(
    `⚙️ **Settings**\n\n` +
    `${emoji} Notifications: **${notificationStatus}**\n` +
    `📅 Daily reminder time: 8:00 PM IST\n` +
    `📊 Weekly summary: Sundays at 10:00 AM IST\n\n` +
    `Adjust your preferences below:`,
    {
      parse_mode: 'Markdown',
      reply_markup: createKeyboard([
        { 
          text: user.notifications_enabled ? '🔕 Disable Notifications' : '🔔 Enable Notifications', 
          data: 'toggle_notifications' 
        },
        { text: '🏠 Main Menu', data: 'main_menu' }
      ])
    }
  );
}

async function handleToggleNotifications(ctx: Context & BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await userQueries.getUserByTelegramId(telegramId);
  if (!user) return;

  const newStatus = !user.notifications_enabled;
  await userQueries.updateUserNotifications(telegramId, newStatus);

  const statusText = newStatus ? 'enabled' : 'disabled';
  const emoji = newStatus ? '🔔' : '🔕';

  await ctx.editMessageText(
    `${emoji} **Notifications ${statusText}**\n\n` +
    `${newStatus ? 
      'You will now receive daily reminders at 8 PM IST to check in on your habits.' : 
      'You will no longer receive daily habit reminders. You can still manually check in anytime.'
    }`,
    {
      parse_mode: 'Markdown',
      reply_markup: createKeyboard([
        { text: '⚙️ Back to Settings', data: 'settings' },
        { text: '🏠 Main Menu', data: 'main_menu' }
      ])
    }
  );
}

async function handleHelpCallback(ctx: Context & BotContext): Promise<void> {
  const helpText = `
🆘 **Help - Habit Tracker Bot**

**Available Commands:**
/start - Start using the bot
/habits - View your current habits
/addhabit - Add a new habit
/deletehabit - Delete a habit
/notifications - Enable/disable notifications
/summary - Get your weekly summary

**How Daily Tracking Works:**
• You'll get a reminder at 8 PM IST each day
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
  
  await ctx.editMessageText(helpText, {
    parse_mode: 'Markdown',
    reply_markup: createKeyboard([
      { text: '🏠 Main Menu', data: 'main_menu' }
    ])
  });
}

async function handleCheckinCallback(ctx: Context & BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  try {
    const user = await userQueries.getUserByTelegramId(telegramId);
    if (!user) return;

    const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');
    const todayDate = new Date(today);

    const habitsWithStatus = await habitEntryQueries.getUserHabitsWithTodayStatus(user.id, todayDate);

    if (habitsWithStatus.length === 0) {
      await ctx.editMessageText(
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

      await ctx.editMessageText(message, {
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

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error('Error in checkin callback:', error);
    await ctx.editMessageText('Sorry, something went wrong. Please try again.');
  }
}

async function handleCancel(ctx: Context & BotContext): Promise<void> {
  ctx.session = {};
  await handleMainMenu(ctx);
}

async function handleHabitResponse(ctx: Context & BotContext, data: string): Promise<void> {
  const parts = data.split('_');
  const habitId = parseInt(parts[1]);
  const completed = parts[2] === 'yes';
  const telegramId = ctx.from?.id;
  
  if (!telegramId) return;

  const user = await userQueries.getUserByTelegramId(telegramId);
  if (!user) return;

  const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');
  const todayDate = new Date(today);

  await habitEntryQueries.recordHabitEntry(habitId, todayDate, completed);
  await notificationQueries.markNotificationResponded(user.id, todayDate);

  const habit = await habitQueries.getHabitById(habitId);
  const responseEmoji = completed ? '✅' : '❌';
  const responseText = completed ? 'completed' : 'not completed';

  await ctx.editMessageText(
    `${responseEmoji} **Response Recorded**\n\n` +
    `You marked "${habit?.name}" as ${responseText} for today.\n\n` +
    `Keep up the great work! 💪`,
    {
      parse_mode: 'Markdown',
      reply_markup: createKeyboard([
        { text: '📋 View All Habits', data: 'view_habits' },
        { text: '🏠 Main Menu', data: 'main_menu' }
      ])
    }
  );
}

async function handleCheckinHabitResponse(ctx: Context & BotContext, data: string): Promise<void> {
  const parts = data.split('_');
  const habitId = parseInt(parts[2]);
  const completed = parts[3] === 'yes';
  const telegramId = ctx.from?.id;
  
  if (!telegramId) return;

  try {
    const user = await userQueries.getUserByTelegramId(telegramId);
    if (!user) return;

    const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');
    const todayDate = new Date(today);

    // Record the habit entry
    await habitEntryQueries.recordHabitEntry(habitId, todayDate, completed);
    
    // Mark that user has responded today (this will prevent notification)
    await notificationQueries.markNotificationResponded(user.id, todayDate);

    const habit = await habitQueries.getHabitById(habitId);
    const responseEmoji = completed ? '✅' : '❌';
    const responseText = completed ? 'completed' : 'not completed';

    // Check if user has now checked in for all habits
    const hasCheckedInAll = await habitEntryQueries.hasUserCheckedInToday(user.id, todayDate);
    
    let message = `${responseEmoji} **Habit Updated**\n\n`;
    message += `You marked "${habit?.name}" as ${responseText} for today.\n\n`;
    
    if (hasCheckedInAll) {
      message += `🎉 **Great job!** You've checked in for all your habits today. You won't receive a notification reminder since you've completed your daily check-in.\n\n`;
      message += `Keep up the excellent work! 💪`;
    } else {
      message += `You can continue checking in for your remaining habits using /checkin or wait for the evening reminder.`;
    }

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: createKeyboard([
        { text: '📝 Continue Check-in', data: 'checkin' },
        { text: '📋 View All Habits', data: 'view_habits' },
        { text: '🏠 Main Menu', data: 'main_menu' }
      ])
    });
  } catch (error) {
    console.error('Error in checkin habit response:', error);
    await ctx.editMessageText('Sorry, something went wrong. Please try again.');
  }
}

export async function sendDailyCheckIn(telegramId: number): Promise<void> {
  try {
    const user = await userQueries.getUserByTelegramId(telegramId);
    if (!user || !user.notifications_enabled) return;

    const habits = await habitQueries.getUserHabits(user.id);
    if (habits.length === 0) return;

    const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');
    const todayDate = new Date(today);

    // Check if user has already checked in today - if so, skip notification
    const hasCheckedIn = await habitEntryQueries.hasUserCheckedInToday(user.id, todayDate);
    if (hasCheckedIn) {
      console.log(`Skipping notification for user ${telegramId} - already checked in today`);
      return;
    }

    await notificationQueries.createNotification(user.id, todayDate);
    await notificationQueries.markNotificationSent(user.id, todayDate);

    let message = `🌟 **Daily Habit Check-In**\n\n`;
    message += `Time to check in on your habits for ${moment().tz(TIMEZONE).format('MMMM Do, YYYY')}!\n\n`;
    
    for (const habit of habits) {
      message += `📍 **${habit.name}**\n`;
      if (habit.description) {
        message += `   _${habit.description}_\n`;
      }
      message += '\n';
    }

    message += `Please respond to each habit individually:\n\n`;

    const keyboard = createKeyboard(
      habits.flatMap(habit => [
        { text: `✅ ${habit.name} - Yes`, data: `habit_${habit.id}_yes` },
        { text: `❌ ${habit.name} - No`, data: `habit_${habit.id}_no` }
      ])
    );

    await bot.api.sendMessage(telegramId, message, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } catch (error) {
    console.error(`Error sending daily check-in to ${telegramId}:`, error);
  }
}