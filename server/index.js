const express = require('express');
const path = require('path');
const db = require('./database');
const { notifyAdmin } = require('./notify');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ============ AUTH ROUTES ============

// Register / Login (same endpoint - upsert by phone)
app.post('/api/auth/login', (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'שם ומספר טלפון נדרשים' });
  }

  const cleanPhone = phone.replace(/[^0-9+]/g, '');

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);

  if (!user) {
    // Register new user
    const result = db.prepare('INSERT INTO users (name, phone) VALUES (?, ?)').run(name, cleanPhone);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  } else {
    // Update name if different
    if (user.name !== name) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, user.id);
      user.name = name;
    }
  }

  res.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
    is_admin: !!user.is_admin,
  });
});

// Admin login with code
app.post('/api/auth/admin', (req, res) => {
  const { name, phone, adminCode } = req.body;
  if (!name || !phone || !adminCode) {
    return res.status(400).json({ error: 'כל השדות נדרשים' });
  }

  const savedCode = db.prepare("SELECT value FROM admin_settings WHERE key = 'admin_code'").get();
  if (!savedCode || savedCode.value !== adminCode) {
    return res.status(403).json({ error: 'קוד מנהל שגוי' });
  }

  const cleanPhone = phone.replace(/[^0-9+]/g, '');

  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(cleanPhone);

  if (!user) {
    const result = db.prepare('INSERT INTO users (name, phone, is_admin) VALUES (?, ?, 1)').run(name, cleanPhone);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  } else {
    db.prepare('UPDATE users SET is_admin = 1, name = ? WHERE id = ?').run(name, user.id);
    user.is_admin = 1;
    user.name = name;
  }

  res.json({
    id: user.id,
    name: user.name,
    phone: user.phone,
    is_admin: true,
  });
});

// ============ TREATMENT ROUTES ============

app.get('/api/treatments', (req, res) => {
  const treatments = db.prepare('SELECT * FROM treatments ORDER BY sort_order').all();
  res.json(treatments);
});

// ============ PROMOTION ROUTES ============

app.get('/api/promotions', (req, res) => {
  const promotions = db.prepare(`
    SELECT p.*, t.name_he as treatment_name
    FROM promotions p
    LEFT JOIN treatments t ON p.treatment_id = t.id
    WHERE p.date >= date('now')
    ORDER BY p.date
  `).all();
  res.json(promotions);
});

app.post('/api/promotions', (req, res) => {
  const { date, description, discount_percent, discount_amount, treatment_id } = req.body;

  if (!date || !description) {
    return res.status(400).json({ error: 'תאריך ותיאור נדרשים' });
  }

  const result = db.prepare(`
    INSERT INTO promotions (date, description, discount_percent, discount_amount, treatment_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(date, description, discount_percent || null, discount_amount || null, treatment_id || null);

  const promo = db.prepare('SELECT * FROM promotions WHERE id = ?').get(result.lastInsertRowid);
  res.json(promo);
});

app.delete('/api/promotions/:id', (req, res) => {
  db.prepare('DELETE FROM promotions WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ BOOKING ROUTES ============

app.post('/api/bookings', (req, res) => {
  const { user_id, treatment_id, booking_date, booking_time, notes } = req.body;

  if (!user_id || !treatment_id || !booking_date) {
    return res.status(400).json({ error: 'חסרים פרטים נדרשים' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(user_id);
  const treatment = db.prepare('SELECT * FROM treatments WHERE id = ?').get(treatment_id);

  if (!user || !treatment) {
    return res.status(404).json({ error: 'משתמש או טיפול לא נמצאו' });
  }

  // Check for promotion on this date
  let finalPrice = treatment.price;
  const promo = db.prepare(`
    SELECT * FROM promotions
    WHERE date = ? AND (treatment_id IS NULL OR treatment_id = ?)
    ORDER BY discount_percent DESC, discount_amount DESC
    LIMIT 1
  `).get(booking_date, treatment_id);

  if (promo) {
    if (promo.discount_percent) {
      finalPrice = treatment.price * (1 - promo.discount_percent / 100);
    } else if (promo.discount_amount) {
      finalPrice = Math.max(0, treatment.price - promo.discount_amount);
    }
  }

  const result = db.prepare(`
    INSERT INTO bookings (user_id, treatment_id, booking_date, booking_time, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(user_id, treatment_id, booking_date, booking_time || null, notes || null);

  // Notify admin
  notifyAdmin({
    userName: user.name,
    userPhone: user.phone,
    treatmentName: treatment.name_he,
    treatmentPrice: finalPrice,
    bookingDate: booking_date,
    bookingTime: booking_time,
  });

  res.json({
    id: result.lastInsertRowid,
    treatment_name: treatment.name_he,
    original_price: treatment.price,
    final_price: finalPrice,
    promotion: promo ? promo.description : null,
    booking_date,
    booking_time,
  });
});

// Get bookings for a user
app.get('/api/bookings/user/:userId', (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, t.name_he as treatment_name, t.price as treatment_price
    FROM bookings b
    JOIN treatments t ON b.treatment_id = t.id
    WHERE b.user_id = ?
    ORDER BY b.booking_date DESC
  `).all(req.params.userId);
  res.json(bookings);
});

// Get all bookings (admin)
app.get('/api/bookings/all', (req, res) => {
  const bookings = db.prepare(`
    SELECT b.*, t.name_he as treatment_name, t.price as treatment_price,
           u.name as user_name, u.phone as user_phone
    FROM bookings b
    JOIN treatments t ON b.treatment_id = t.id
    JOIN users u ON b.user_id = u.id
    ORDER BY b.booking_date DESC
  `).all();
  res.json(bookings);
});

// Update booking status (admin)
app.patch('/api/bookings/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE bookings SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ success: true });
});

// Delete booking
app.delete('/api/bookings/:id', (req, res) => {
  db.prepare('DELETE FROM bookings WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ============ NOTIFICATION ROUTES (admin) ============

app.get('/api/notifications', (req, res) => {
  // Ensure table exists
  db.prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  const notifications = db.prepare(
    'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 50'
  ).all();
  res.json(notifications);
});

app.patch('/api/notifications/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1').run();
  res.json({ success: true });
});

app.get('/api/notifications/unread-count', (req, res) => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  const result = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE is_read = 0').get();
  res.json({ count: result.count });
});

// ============ ADMIN SETTINGS ============

app.get('/api/admin/settings', (req, res) => {
  const settings = db.prepare('SELECT * FROM admin_settings').all();
  const result = {};
  settings.forEach(s => { result[s.key] = s.value; });
  res.json(result);
});

app.put('/api/admin/settings', (req, res) => {
  const { key, value } = req.body;
  db.prepare(`
    INSERT INTO admin_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = ?
  `).run(key, value, value);
  res.json({ success: true });
});

// ============ SERVE SPA ============

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Royal Care Booking App running on http://localhost:${PORT}`);
});
