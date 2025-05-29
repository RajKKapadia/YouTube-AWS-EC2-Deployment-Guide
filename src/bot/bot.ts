import { Bot, InlineKeyboard, Context, session } from 'grammy';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.BOT_TOKEN) {
  throw new Error('BOT_TOKEN environment variable is required');
}

export interface SessionData {
  userId?: number;
  awaitingHabitName?: boolean;
  currentHabitIndex?: number;
  habits?: string[];
}

export type BotContext = Context & {
  session: SessionData;
};

export const bot = new Bot<BotContext>(process.env.BOT_TOKEN);

// Setup session middleware
bot.use(session({ initial: (): SessionData => ({}) }));

export function createKeyboard(buttons: Array<{ text: string; data: string }>): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  buttons.forEach(button => {
    keyboard.text(button.text, button.data).row();
  });
  return keyboard;
}

export function createInlineKeyboard(buttons: Array<Array<{ text: string; data: string }>>): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  buttons.forEach(row => {
    row.forEach((button, index) => {
      keyboard.text(button.text, button.data);
      if (index < row.length - 1) keyboard.text(' ', 'noop');
    });
    keyboard.row();
  });
  return keyboard;
}