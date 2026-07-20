import { Pool } from 'pg';
import { Database } from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { ENV } from '../../plugins/Environment/const';

export class DatabaseService {
  private static readonly sqliteMigrations = new Map<string, Promise<void>>();
  public _db: Pool | Database;
  private _ready: Promise<void>;

  constructor(dbName: string) {
    if (ENV.APP_MODE === 'web') {
      this._db = new Pool({
        database: dbName,
        host: ENV.TRADING_HOST,
        port: ENV.TRADING_PORT,
        user: ENV.TRADING_USER,
        password: ENV.TRADING_PASSWORD,
      });
      this._ready = this._checkAndInitDatabase(dbName);
    } else if (ENV.APP_MODE === 'desktop') {
      const dbDirectory = this._getDesktopDatabaseDirectory();
      fs.mkdirSync(dbDirectory, { recursive: true });
      const dbPath = path.join(dbDirectory, `${dbName}`);
      this._db = new Database(dbPath);
      let migration = DatabaseService.sqliteMigrations.get(dbPath);
      if (!migration) {
        migration = this._initSqlite(this._db, dbName);
        DatabaseService.sqliteMigrations.set(dbPath, migration);
      }
      this._ready = migration.then(() => this._configureSqliteConnection(this._db as Database));
    } else {
      throw new Error(`Unsupported APP_MODE: ${ENV.APP_MODE}`);
    }
  }

  public async query<T>(queryText: string, params: unknown[] = []): Promise<T[]> {
    await this._ready;

    if (ENV.APP_MODE === 'web') {
      return (await (this._db as Pool).query(queryText, params)).rows as T[];
    }

    if (ENV.APP_MODE === 'desktop') {
      return new Promise((resolve, reject) => {
        (this._db as Database).all(queryText, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows as T[]);
          }
        });
      });
    }

    return [] as T[];
  }

  private async _checkAndInitDatabase(dbName: string): Promise<void> {
    const dbExists = await this._databaseExists(dbName);
    console.log('_checkAndInitDatabase => ', dbExists);
    if (!dbExists) {
      await this._initDatabase(dbName);
    }
  }

  private async _databaseExists(dbName: string): Promise<boolean> {
    if (ENV.APP_MODE === 'web') {
      const result = await (this._db as Pool).query('SELECT 1 FROM pg_database WHERE datname = $1;', [dbName]);
      return result.rowCount! > 0;
    }

    return false;
  }

  private _getDesktopDatabaseDirectory(): string {
    return path.join(ENV.DATA_DIR, 'databases');
  }

  private async _initDatabase(dbName: string): Promise<void> {
    if (ENV.APP_MODE === 'web') {
      await this._createPostgresDatabase(dbName);
      await this._initPostgres(this._db as Pool, dbName);
    }
  }

  private async _createPostgresDatabase(dbName: string): Promise<void> {
    if (!/^[a-zA-Z0-9_-]+$/.test(dbName)) throw new Error('Invalid database name.');
    const client = new Pool({
      host: ENV.TRADING_HOST,
      port: ENV.TRADING_PORT,
      user: ENV.TRADING_USER,
      password: ENV.TRADING_PASSWORD,
    });

    await client.query(`CREATE DATABASE "${dbName}";`);
    await client.end();
  }

  private async _initPostgres(db: Pool, dbName: string): Promise<void> {
    if (dbName === 'trading-config-db') {
      await db.query(`
        CREATE TABLE IF NOT EXISTS instance_identity (
          create_at TIMESTAMP DEFAULT now(),
          update_at TIMESTAMP DEFAULT now(),
          client_id TEXT
        );

        CREATE TABLE IF NOT EXISTS trade_config (
          id SERIAL PRIMARY KEY,
          position_size DOUBLE PRECISION DEFAULT 0.1,
          count_grid_size INTEGER DEFAULT 1,
          grid_size INTEGER DEFAULT 1,
          percent_buy_back DOUBLE PRECISION DEFAULT 0.001,
          take_profit DOUBLE PRECISION,
          stop_loss DOUBLE PRECISION,
          is_emergency_stop SMALLINT DEFAULT 0,
          percent_profit DOUBLE PRECISION DEFAULT 0.02,
          percent_from_balance DOUBLE PRECISION DEFAULT 0.01,
          candle_price_range TEXT DEFAULT '1h',
          symbol TEXT,
          percent_target_after_take_profit DOUBLE PRECISION DEFAULT 0.01,
          balance_distribution SMALLINT DEFAULT 0,
          exchange TEXT DEFAULT 'okx',
          is_percent_target_after_take_profit SMALLINT DEFAULT 1,
          api_key TEXT,
          private_key TEXT,
          password TEXT,
          is_only_buy SMALLINT DEFAULT 0,
          is_fibonacci SMALLINT DEFAULT 0,
          is_capitalize_delta_from_sale SMALLINT DEFAULT 0,
          is_coin_accumulation SMALLINT DEFAULT 0,
          is_auto_start_trading SMALLINT DEFAULT 0,
          is_stop_trading SMALLINT DEFAULT 0,
          logger_event TEXT
        );

        CREATE TABLE IF NOT EXISTS balance_history (
          usdt DOUBLE PRECISION,
          profit_all DOUBLE PRECISION,
          exchange_name TEXT,
          update_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
          profit_usdt DOUBLE PRECISION,
          id SERIAL PRIMARY KEY,
          balance_object JSON
        );
      `);
    } else {
      await db.query(`
      CREATE TABLE IF NOT EXISTS trade_operation (
        id SERIAL PRIMARY KEY,
        create_at TIMESTAMP DEFAULT now(),
        price DOUBLE PRECISION NOT NULL,
        side TEXT NOT NULL,
        symbol TEXT NOT NULL,
        is_active SMALLINT DEFAULT 1,
        is_delete SMALLINT DEFAULT 0,
        order_id TEXT,
        "order" JSON,
        index_operation TEXT,
        amount DOUBLE PRECISION
      );

      CREATE TABLE IF NOT EXISTS trade_session (
        id SERIAL PRIMARY KEY,
        index_session TEXT NOT NULL,
        is_active SMALLINT DEFAULT 1,
        profit_session DOUBLE PRECISION DEFAULT 0,
        config_id INTEGER
      );
    `);
    }
  }

  private async _initSqlite(db: Database, dbName: string): Promise<void> {
    const migration =
      dbName === 'trading-config-db.sqlite'
        ? `
          CREATE TABLE IF NOT EXISTS trade_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            position_size REAL DEFAULT 0.1,
            count_grid_size INTEGER DEFAULT 1,
            grid_size INTEGER DEFAULT 1,
            percent_buy_back REAL DEFAULT 0.001,
            take_profit REAL,
            stop_loss REAL,
            is_emergency_stop INTEGER DEFAULT 0,
            percent_profit REAL DEFAULT 0.02,
            percent_from_balance REAL DEFAULT 0.01,
            candle_price_range TEXT DEFAULT '1h',
            symbol TEXT,
            percent_target_after_take_profit REAL DEFAULT 0.01,
            balance_distribution INTEGER DEFAULT 0,
            exchange TEXT DEFAULT 'okx',
            is_percent_target_after_take_profit INTEGER DEFAULT 1,
            api_key TEXT,
            private_key TEXT,
            password TEXT,
            is_only_buy INTEGER DEFAULT 0,
            is_fibonacci INTEGER DEFAULT 0,
            is_capitalize_delta_from_sale INTEGER DEFAULT 0,
            is_coin_accumulation INTEGER DEFAULT 0,
            is_auto_start_trading INTEGER DEFAULT 0,
            is_stop_trading INTEGER DEFAULT 0,
            logger_event TEXT
          );
          CREATE TABLE IF NOT EXISTS instance_identity (
            create_at TEXT DEFAULT CURRENT_TIMESTAMP,
            update_at TEXT DEFAULT CURRENT_TIMESTAMP,
            client_id TEXT
          );
          CREATE TABLE IF NOT EXISTS balance_history (
            usdt REAL,
            profit_all REAL,
            exchange_name TEXT,
            update_date TEXT DEFAULT CURRENT_TIMESTAMP,
            profit_usdt REAL,
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            balance_object TEXT
          );
        `
        : `
          CREATE TABLE IF NOT EXISTS trade_operation (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            create_at TEXT DEFAULT CURRENT_TIMESTAMP,
            price REAL NOT NULL,
            side TEXT NOT NULL,
            symbol TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            is_delete INTEGER DEFAULT 0,
            order_id TEXT,
            "order" TEXT,
            index_operation TEXT,
            amount REAL
          );
          CREATE TABLE IF NOT EXISTS trade_session (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            index_session TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            profit_session REAL DEFAULT 0,
            config_id INTEGER
          );
        `;

    await this._execSqlite(
      db,
      `
        PRAGMA journal_mode = WAL;
        PRAGMA busy_timeout = 5000;
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        BEGIN;
        ${migration}
        INSERT OR IGNORE INTO schema_migrations(version) VALUES (1);
        COMMIT;
      `,
    );
  }

  private _execSqlite(db: Database, sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      db.exec(sql, (error) => (error ? reject(error) : resolve()));
    });
  }

  private _configureSqliteConnection(db: Database): Promise<void> {
    return this._execSqlite(db, 'PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  }
}
