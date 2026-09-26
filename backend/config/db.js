const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// SQLite setup with configurable persistence path (Docker volumes / Cloud Disks)
const rawDbPath = process.env.DATABASE_PATH || process.env.DB_PATH;
let dbPath;

if (rawDbPath === ':memory:') {
  dbPath = ':memory:';
} else if (rawDbPath) {
  dbPath = path.resolve(rawDbPath);
} else {
  dbPath = path.join(__dirname, '..', 'app_data.db');
}

if (dbPath !== ':memory:') {
  try {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
  } catch (dirErr) {
    console.warn(`⚠️ Warning: Could not create directory for DATABASE_PATH (${dbPath}): ${dirErr.message}. Falling back to local app_data.db`);
    dbPath = path.join(__dirname, '..', 'app_data.db');
  }
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error('Database opening error: ', err);
  else console.log(`🗄️ SQLite database loaded from: ${dbPath}`);
});

// Initialize Database with foreign keys and performance indexes
db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON;");
  db.run("CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY, name TEXT)");
  db.run("CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, group_id TEXT, name TEXT, payment_key TEXT, payment_qr TEXT)");
  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY, 
    group_id TEXT, 
    profile_id TEXT, 
    amount REAL, 
    description TEXT,
    category TEXT DEFAULT 'general',
    type TEXT DEFAULT 'expense',
    to_profile_id TEXT,
    date TEXT
  )`);

  // Safe migration for existing databases missing 'category' column
  db.run("ALTER TABLE expenses ADD COLUMN category TEXT DEFAULT 'general'", () => {
    // Silently ignore if column already exists
  });

  // Bills tables for itemized invoice splitting
  db.run(`CREATE TABLE IF NOT EXISTS bills (
    id TEXT PRIMARY KEY,
    group_id TEXT,
    payer_profile_id TEXT,
    total_amount REAL,
    subtotal REAL,
    tax REAL DEFAULT 0,
    tip REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    description TEXT,
    date TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bill_items (
    id TEXT PRIMARY KEY,
    bill_id TEXT,
    name TEXT,
    quantity INTEGER DEFAULT 1,
    unit_price REAL,
    subtotal REAL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS bill_splits (
    id TEXT PRIMARY KEY,
    bill_id TEXT,
    profile_id TEXT,
    amount REAL,
    items_summary TEXT
  )`);

  // Active live bill sessions for real-time collaborative bill splitting
  db.run(`CREATE TABLE IF NOT EXISTS active_bill_sessions (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL,
    title TEXT,
    store_name TEXT,
    host_profile_id TEXT,
    host_name TEXT,
    subtotal REAL DEFAULT 0,
    tax REAL DEFAULT 0,
    tip REAL DEFAULT 0,
    discount REAL DEFAULT 0,
    total_amount REAL DEFAULT 0,
    tax_distribution TEXT DEFAULT 'proportional',
    items TEXT,
    assignments TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Performance indexes
  db.run("CREATE INDEX IF NOT EXISTS idx_profiles_group ON profiles(group_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_expenses_group ON expenses(group_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)");
  db.run("CREATE INDEX IF NOT EXISTS idx_bills_group ON bills(group_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_bill_splits_bill ON bill_splits(bill_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_active_bill_sessions_group ON active_bill_sessions(group_id)");
});

module.exports = db;
