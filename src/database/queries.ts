import { Pool } from 'pg';
import { getPool } from './connection';
import { User, Habit, HabitEntry, Notification, WeeklySummary } from '../types';

export class UserQueries {
  private pool: Pool;

  constructor() {
    this.pool = getPool();
  }

  async createUser(telegramId: number, username?: string, firstName?: string, lastName?: string): Promise<User> {
    const query = `
      INSERT INTO users (telegram_id, username, first_name, last_name)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    const result = await this.pool.query(query, [telegramId, username, firstName, lastName]);
    return result.rows[0];
  }

  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE telegram_id = $1';
    const result = await this.pool.query(query, [telegramId]);
    return result.rows[0] || null;
  }

  async getUserById(id: number): Promise<User | null> {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return result.rows[0] || null;
  }

  async updateUserNotifications(telegramId: number, enabled: boolean): Promise<void> {
    const query = 'UPDATE users SET notifications_enabled = $1 WHERE telegram_id = $2';
    await this.pool.query(query, [enabled, telegramId]);
  }

  async getAllActiveUsers(): Promise<User[]> {
    const query = 'SELECT * FROM users WHERE is_active = true AND notifications_enabled = true';
    const result = await this.pool.query(query);
    return result.rows;
  }
}

export class HabitQueries {
  private pool: Pool;

  constructor() {
    this.pool = getPool();
  }

  async createHabit(userId: number, name: string, description?: string): Promise<Habit> {
    const query = `
      INSERT INTO habits (user_id, name, description)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await this.pool.query(query, [userId, name, description]);
    return result.rows[0];
  }

  async getUserHabits(userId: number): Promise<Habit[]> {
    const query = 'SELECT * FROM habits WHERE user_id = $1 AND is_active = true ORDER BY created_at';
    const result = await this.pool.query(query, [userId]);
    return result.rows;
  }

  async deleteHabit(habitId: number, userId: number): Promise<boolean> {
    const query = 'UPDATE habits SET is_active = false WHERE id = $1 AND user_id = $2';
    const result = await this.pool.query(query, [habitId, userId]);
    return (result.rowCount ?? 0) > 0;
  }

  async getHabitById(habitId: number): Promise<Habit | null> {
    const query = 'SELECT * FROM habits WHERE id = $1 AND is_active = true';
    const result = await this.pool.query(query, [habitId]);
    return result.rows[0] || null;
  }
}

export class HabitEntryQueries {
  private pool: Pool;

  constructor() {
    this.pool = getPool();
  }

  async recordHabitEntry(habitId: number, date: Date, completed: boolean): Promise<HabitEntry> {
    const query = `
      INSERT INTO habit_entries (habit_id, date, completed)
      VALUES ($1, $2, $3)
      ON CONFLICT (habit_id, date)
      DO UPDATE SET completed = $3, created_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await this.pool.query(query, [habitId, date, completed]);
    return result.rows[0];
  }

  async getHabitEntriesForWeek(habitId: number, weekStart: Date, weekEnd: Date): Promise<HabitEntry[]> {
    const query = `
      SELECT * FROM habit_entries 
      WHERE habit_id = $1 AND date >= $2 AND date <= $3
      ORDER BY date
    `;
    const result = await this.pool.query(query, [habitId, weekStart, weekEnd]);
    return result.rows;
  }

  async getUserHabitEntriesForDate(userId: number, date: Date): Promise<HabitEntry[]> {
    const query = `
      SELECT he.*, h.name as habit_name
      FROM habit_entries he
      JOIN habits h ON he.habit_id = h.id
      WHERE h.user_id = $1 AND he.date = $2 AND h.is_active = true
    `;
    const result = await this.pool.query(query, [userId, date]);
    return result.rows;
  }

  async hasUserCheckedInToday(userId: number, date: Date): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM habit_entries he
      JOIN habits h ON he.habit_id = h.id
      WHERE h.user_id = $1 AND he.date = $2 AND h.is_active = true
    `;
    const result = await this.pool.query(query, [userId, date]);
    return parseInt(result.rows[0].count) > 0;
  }

  async getUserHabitsWithTodayStatus(userId: number, date: Date): Promise<Array<{
    id: number;
    name: string;
    description?: string;
    checked_in: boolean;
    completed?: boolean;
  }>> {
    const query = `
      SELECT 
        h.id,
        h.name,
        h.description,
        he.completed IS NOT NULL as checked_in,
        he.completed
      FROM habits h
      LEFT JOIN habit_entries he ON h.id = he.habit_id AND he.date = $2
      WHERE h.user_id = $1 AND h.is_active = true
      ORDER BY h.created_at
    `;
    const result = await this.pool.query(query, [userId, date]);
    return result.rows;
  }
}

export class NotificationQueries {
  private pool: Pool;

  constructor() {
    this.pool = getPool();
  }

  async createNotification(userId: number, date: Date): Promise<Notification> {
    const query = `
      INSERT INTO notifications (user_id, date)
      VALUES ($1, $2)
      ON CONFLICT (user_id, date)
      DO UPDATE SET created_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await this.pool.query(query, [userId, date]);
    return result.rows[0];
  }

  async markNotificationSent(userId: number, date: Date): Promise<void> {
    const query = `
      UPDATE notifications 
      SET sent = true, sent_at = CURRENT_TIMESTAMP 
      WHERE user_id = $1 AND date = $2
    `;
    await this.pool.query(query, [userId, date]);
  }

  async markNotificationResponded(userId: number, date: Date): Promise<void> {
    const query = `
      UPDATE notifications 
      SET responded = true, responded_at = CURRENT_TIMESTAMP 
      WHERE user_id = $1 AND date = $2
    `;
    await this.pool.query(query, [userId, date]);
  }

  async getNotificationStatus(userId: number, date: Date): Promise<Notification | null> {
    const query = 'SELECT * FROM notifications WHERE user_id = $1 AND date = $2';
    const result = await this.pool.query(query, [userId, date]);
    return result.rows[0] || null;
  }
}

export class WeeklySummaryQueries {
  private pool: Pool;

  constructor() {
    this.pool = getPool();
  }

  async createWeeklySummary(userId: number, weekStart: Date, weekEnd: Date, summaryData: string): Promise<WeeklySummary> {
    const query = `
      INSERT INTO weekly_summaries (user_id, week_start, week_end, summary_data)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id, week_start)
      DO UPDATE SET summary_data = $4, sent_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await this.pool.query(query, [userId, weekStart, weekEnd, summaryData]);
    return result.rows[0];
  }

  async getWeeklySummary(userId: number, weekStart: Date): Promise<WeeklySummary | null> {
    const query = 'SELECT * FROM weekly_summaries WHERE user_id = $1 AND week_start = $2';
    const result = await this.pool.query(query, [userId, weekStart]);
    return result.rows[0] || null;
  }
}