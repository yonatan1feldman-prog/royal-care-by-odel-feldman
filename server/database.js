const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'booking.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS treatments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    name_he TEXT NOT NULL,
    price REAL NOT NULL,
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    treatment_id INTEGER NOT NULL,
    booking_date TEXT NOT NULL,
    booking_time TEXT,
    status TEXT DEFAULT 'pending',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (treatment_id) REFERENCES treatments(id)
  );

  CREATE TABLE IF NOT EXISTS promotions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    discount_percent INTEGER,
    discount_amount REAL,
    treatment_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (treatment_id) REFERENCES treatments(id)
  );

  CREATE TABLE IF NOT EXISTS admin_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Insert default treatments if not exist
const treatmentCount = db.prepare('SELECT COUNT(*) as count FROM treatments').get();
if (treatmentCount.count === 0) {
  const insertTreatment = db.prepare(
    'INSERT INTO treatments (name, name_he, price, sort_order) VALUES (?, ?, ?, ?)'
  );

  const defaultTreatments = [
    ['medical_pedicure', 'פדיקור רפואי', 200, 1],
    ['aesthetic_pedicure', 'פדיקור אסטתי', 160, 2],
    ['ingrown_nail', 'הוצאת ציפורן חודרנית', 110, 3],
    ['gel_manicure', 'מניקור לק ג\'ל', 160, 4],
    ['gel_building', 'בנייה בג\'ל', 185, 5],
  ];

  const insertMany = db.transaction((treatments) => {
    for (const t of treatments) {
      insertTreatment.run(...t);
    }
  });

  insertMany(defaultTreatments);
}

// Insert default admin code if not exist
const adminCode = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_code'").get();
if (!adminCode) {
  db.prepare("INSERT INTO admin_settings (key, value) VALUES ('admin_code', 'ROYAL2024')").run();
}

// Insert default admin notification email if not exist
const notifEmail = db.prepare("SELECT value FROM admin_settings WHERE key = 'notification_email'").get();
if (!notifEmail) {
  db.prepare("INSERT INTO admin_settings (key, value) VALUES ('notification_email', '')").run();
}

module.exports = db;
