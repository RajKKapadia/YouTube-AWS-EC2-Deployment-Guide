export interface User {
  id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  notifications_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Habit {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface HabitEntry {
  id: number;
  habit_id: number;
  date: Date;
  completed: boolean;
  created_at: Date;
}

export interface Notification {
  id: number;
  user_id: number;
  date: Date;
  sent: boolean;
  sent_at?: Date;
  responded: boolean;
  responded_at?: Date;
  created_at: Date;
}

export interface WeeklySummary {
  id: number;
  user_id: number;
  week_start: Date;
  week_end: Date;
  summary_data: string;
  sent_at: Date;
  created_at: Date;
}