const db = require('./database');

/**
 * Send notification to admin when a new booking is made.
 * Uses in-app notification stored in database.
 * Can be extended with email (nodemailer) or WhatsApp API.
 */
function notifyAdmin(booking) {
  const { userName, userPhone, treatmentName, treatmentPrice, bookingDate, bookingTime } = booking;

  // Store notification in database
  const createNotifTable = db.prepare(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  createNotifTable.run();

  const timeStr = bookingTime ? ` בשעה ${bookingTime}` : '';
  const message = `תור חדש! ${userName} (${userPhone}) קבע/ה תור ל${treatmentName} (${treatmentPrice} ₪) בתאריך ${bookingDate}${timeStr}`;

  db.prepare('INSERT INTO notifications (message) VALUES (?)').run(message);

  // Log to console for visibility
  console.log(`[NOTIFICATION] ${message}`);

  // Try to send email if configured
  sendEmailNotification(booking).catch(err => {
    console.log('[EMAIL] Email notification skipped:', err.message);
  });

  return message;
}

async function sendEmailNotification(booking) {
  const emailSetting = db.prepare("SELECT value FROM admin_settings WHERE key = 'notification_email'").get();

  if (!emailSetting || !emailSetting.value) {
    throw new Error('No notification email configured');
  }

  const nodemailer = require('nodemailer');

  // Using a test/dev SMTP - admin should configure real SMTP in production
  const smtpSettings = db.prepare("SELECT value FROM admin_settings WHERE key = 'smtp_settings'").get();

  if (!smtpSettings || !smtpSettings.value) {
    throw new Error('SMTP not configured');
  }

  const smtp = JSON.parse(smtpSettings.value);
  const transporter = nodemailer.createTransport(smtp);

  const { userName, userPhone, treatmentName, treatmentPrice, bookingDate, bookingTime } = booking;
  const timeStr = bookingTime ? ` בשעה ${bookingTime}` : '';

  await transporter.sendMail({
    from: smtp.auth?.user || 'noreply@royalcare.co.il',
    to: emailSetting.value,
    subject: `תור חדש - ${userName} - ${treatmentName}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>תור חדש נקבע!</h2>
        <p><strong>לקוחה:</strong> ${userName}</p>
        <p><strong>טלפון:</strong> ${userPhone}</p>
        <p><strong>טיפול:</strong> ${treatmentName}</p>
        <p><strong>מחיר:</strong> ${treatmentPrice} ₪</p>
        <p><strong>תאריך:</strong> ${bookingDate}${timeStr}</p>
      </div>
    `,
  });
}

module.exports = { notifyAdmin };
