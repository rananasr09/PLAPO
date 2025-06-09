import Database from 'better-sqlite3';
import path from 'path';

export interface Account {
  username: string;
  password: string;
  email: string;
  emailPassword: string;
  status: 'success' | 'failed' | 'in_progress';
  timestamp: string;
}

export class DatabaseService {
  private db: Database.Database;

  constructor() {
    const dbPath = path.join(process.cwd(), 'accounts.db');
    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        password TEXT NOT NULL,
        email TEXT NOT NULL,
        emailPassword TEXT NOT NULL,
        status TEXT NOT NULL,
        timestamp TEXT NOT NULL
      )
    `);
  }

  async storeAccount(account: Account): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO accounts (username, password, email, emailPassword, status, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      account.username,
      account.password,
      account.email,
      account.emailPassword,
      account.status,
      account.timestamp
    );
  }

  async getAccounts(limit: number = 100): Promise<Account[]> {
    const stmt = this.db.prepare(`
      SELECT username, password, email, emailPassword, status, timestamp
      FROM accounts
      ORDER BY timestamp DESC
      LIMIT ?
    `);

    return stmt.all(limit) as Account[];
  }

  async getAccountByUsername(username: string): Promise<Account | null> {
    const stmt = this.db.prepare(`
      SELECT username, password, email, emailPassword, status, timestamp
      FROM accounts
      WHERE username = ?
      LIMIT 1
    `);

    const result = stmt.get(username) as Account | undefined;
    return result || null;
  }

  close() {
    this.db.close();
  }
} 