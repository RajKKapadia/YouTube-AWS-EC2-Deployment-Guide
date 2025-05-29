import { Pool, Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'habit_tracker',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
};

let pool: Pool;

export async function initializeDatabase(): Promise<void> {
  const adminClient = new Client({
    ...dbConfig,
    database: 'postgres',
  });

  try {
    await adminClient.connect();
    
    const dbCheckQuery = `SELECT 1 FROM pg_database WHERE datname = $1`;
    const result = await adminClient.query(dbCheckQuery, [dbConfig.database]);
    
    if (result.rows.length === 0) {
      console.log(`Database '${dbConfig.database}' does not exist. Creating...`);
      await adminClient.query(`CREATE DATABASE ${dbConfig.database}`);
      console.log(`Database '${dbConfig.database}' created successfully.`);
    } else {
      console.log(`Database '${dbConfig.database}' already exists.`);
    }
  } catch (error) {
    console.error('Error checking/creating database:', error);
    throw error;
  } finally {
    await adminClient.end();
  }

  pool = new Pool(dbConfig);
  
  try {
    await pool.connect();
    console.log('Connected to PostgreSQL database successfully.');
    await createTables();
  } catch (error) {
    console.error('Error connecting to database:', error);
    throw error;
  }
}

async function createTables(): Promise<void> {
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username VARCHAR(255),
      first_name VARCHAR(255),
      last_name VARCHAR(255),
      is_active BOOLEAN DEFAULT true,
      notifications_enabled BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createHabitsTable = `
    CREATE TABLE IF NOT EXISTS habits (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  const createHabitEntriesTable = `
    CREATE TABLE IF NOT EXISTS habit_entries (
      id SERIAL PRIMARY KEY,
      habit_id INTEGER REFERENCES habits(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      completed BOOLEAN NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(habit_id, date)
    );
  `;

  const createNotificationsTable = `
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      sent BOOLEAN DEFAULT false,
      sent_at TIMESTAMP WITH TIME ZONE,
      responded BOOLEAN DEFAULT false,
      responded_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, date)
    );
  `;

  const createWeeklySummariesTable = `
    CREATE TABLE IF NOT EXISTS weekly_summaries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      summary_data TEXT NOT NULL,
      sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, week_start)
    );
  `;

  const createUpdatedAtTrigger = `
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ language 'plpgsql';

    DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

    DROP TRIGGER IF EXISTS update_habits_updated_at ON habits;
    CREATE TRIGGER update_habits_updated_at BEFORE UPDATE ON habits FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  `;

  try {
    await pool.query(createUsersTable);
    await pool.query(createHabitsTable);
    await pool.query(createHabitEntriesTable);
    await pool.query(createNotificationsTable);
    await pool.query(createWeeklySummariesTable);
    await pool.query(createUpdatedAtTrigger);
    console.log('Database tables created/verified successfully.');
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    console.log('Database connection pool closed.');
  }
}