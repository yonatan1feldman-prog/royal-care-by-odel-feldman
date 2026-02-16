// ============ State ============
let currentUser = null;
let treatments = [];
let promotions = [];
let myBookings = [];
let calendarDate = new Date();
let selectedDate = null;

// ============ DOM Elements ============
const $ = (id) => document.getElementById(id);

// Screens
const loginScreen = $('loginScreen');
const calendarScreen = $('calendarScreen');
const adminScreen = $('adminScreen');

// ============ Init ============
document.addEventListener('DOMContentLoaded', () => {
  // Check saved session
  const saved = localStorage.getItem('royalcare_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    onLoginSuccess();
  }

  setupEventListeners();
});

// ============ Event Listeners ============
function setupEventListeners() {
  // Login
  $('loginForm').addEventListener('submit', handleLogin);
  $('logoutBtn').addEventListener('click', handleLogout);

  // Admin
  $('adminDots').addEventListener('click', () => {
    $('adminModal').style.display = 'flex';
  });
  $('closeAdminModal').addEventListener('click', () => {
    $('adminModal').style.display = 'none';
  });
  $('adminLoginForm').addEventListener('submit', handleAdminLogin);

  // Calendar navigation
  $('prevMonth').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar('calendarGrid', 'calendarTitle');
  });
  $('nextMonth').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar('calendarGrid', 'calendarTitle');
  });

  // Admin calendar navigation
  $('adminPrevMonth').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar('adminCalendarGrid', 'adminCalendarTitle', true);
  });
  $('adminNextMonth').addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar('adminCalendarGrid', 'adminCalendarTitle', true);
  });

  // Treatment modal
  $('closeTreatmentModal').addEventListener('click', () => {
    $('treatmentModal').style.display = 'none';
  });

  // Confirm modal
  $('confirmOk').addEventListener('click', () => {
    $('confirmModal').style.display = 'none';
  });

  // Admin tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      $(btn.dataset.tab).classList.add('active');

      // Refresh tab data
      if (btn.dataset.tab === 'adminBookings') loadAllBookings();
      if (btn.dataset.tab === 'adminNotifs') loadNotifications();
      if (btn.dataset.tab === 'adminPromos') loadPromotions().then(renderActivePromos);
    });
  });

  // Add promotion form
  $('addPromoForm').addEventListener('submit', handleAddPromotion);

  // Mark all notifications read
  $('markAllRead').addEventListener('click', markAllRead);

  // Settings form
  $('settingsForm').addEventListener('submit', handleSaveSettings);

  // Notification badge click
  $('notifBadge').addEventListener('click', () => {
    // Switch to admin notifications tab
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector('[data-tab="adminNotifs"]').classList.add('active');
    $('adminNotifs').classList.add('active');
    loadNotifications();
  });

  // Close modals on backdrop click
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });
}

// ============ Auth ============
async function handleLogin(e) {
  e.preventDefault();
  const name = $('loginName').value.trim();
  const phone = $('loginPhone').value.trim();

  if (!name || !phone) {
    showToast('נא להזין שם ומספר טלפון', 'error');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentUser = data;
    localStorage.setItem('royalcare_user', JSON.stringify(data));
    onLoginSuccess();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const name = $('adminName').value.trim();
  const phone = $('adminPhone').value.trim();
  const adminCode = $('adminCode').value.trim();

  try {
    const res = await fetch('/api/auth/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, adminCode }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    currentUser = data;
    localStorage.setItem('royalcare_user', JSON.stringify(data));
    $('adminModal').style.display = 'none';
    onLoginSuccess();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function handleLogout() {
  currentUser = null;
  localStorage.removeItem('royalcare_user');
  showScreen('login');
  $('userGreeting').style.display = 'none';
  $('logoutBtn').style.display = 'none';
  $('notifBadge').style.display = 'none';
  $('loginForm').reset();
}

async function onLoginSuccess() {
  $('userGreeting').textContent = `שלום, ${currentUser.name}`;
  $('userGreeting').style.display = 'inline';
  $('logoutBtn').style.display = 'inline';

  await loadTreatments();
  await loadPromotions();

  if (currentUser.is_admin) {
    showScreen('admin');
    $('notifBadge').style.display = 'inline';
    loadAllBookings();
    loadNotifications();
    loadAdminSettings();
    populatePromoTreatments();
    renderCalendar('adminCalendarGrid', 'adminCalendarTitle', true);
    pollNotifications();
  } else {
    showScreen('calendar');
    await loadMyBookings();
    renderCalendar('calendarGrid', 'calendarTitle');
  }
}

// ============ Screen Management ============
function showScreen(name) {
  loginScreen.classList.remove('active');
  calendarScreen.classList.remove('active');
  adminScreen.classList.remove('active');

  if (name === 'login') loginScreen.classList.add('active');
  if (name === 'calendar') calendarScreen.classList.add('active');
  if (name === 'admin') adminScreen.classList.add('active');
}

// ============ Data Loading ============
async function loadTreatments() {
  const res = await fetch('/api/treatments');
  treatments = await res.json();
}

async function loadPromotions() {
  const res = await fetch('/api/promotions');
  promotions = await res.json();
}

async function loadMyBookings() {
  if (!currentUser) return;
  const res = await fetch(`/api/bookings/user/${currentUser.id}`);
  myBookings = await res.json();
  renderMyBookings();
}

async function loadAllBookings() {
  const res = await fetch('/api/bookings/all');
  const bookings = await res.json();
  renderAllBookings(bookings);
}

async function loadNotifications() {
  const res = await fetch('/api/notifications');
  const notifs = await res.json();
  renderNotifications(notifs);
  updateNotifCount();
}

async function updateNotifCount() {
  const res = await fetch('/api/notifications/unread-count');
  const { count } = await res.json();
  $('notifCount').textContent = count;
  $('notifBadge').style.display = currentUser?.is_admin ? 'inline' : 'none';
}

async function loadAdminSettings() {
  const res = await fetch('/api/admin/settings');
  const settings = await res.json();
  $('settingEmail').value = settings.notification_email || '';
  $('settingAdminCode').value = settings.admin_code || '';
}

// ============ Calendar ============
function renderCalendar(gridId, titleId, isAdmin = false) {
  const grid = $(gridId);
  const title = $(titleId);

  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  const hebrewMonths = [
    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
  ];
  title.textContent = `${hebrewMonths[month]} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build promo map for this month
  const promoMap = {};
  promotions.forEach(p => {
    const pDate = new Date(p.date);
    if (pDate.getFullYear() === year && pDate.getMonth() === month) {
      if (!promoMap[pDate.getDate()]) promoMap[pDate.getDate()] = [];
      promoMap[pDate.getDate()].push(p);
    }
  });

  // Build booking map for this month
  const bookingMap = {};
  const bookingsToCheck = isAdmin ? [] : myBookings;
  bookingsToCheck.forEach(b => {
    const bDate = new Date(b.booking_date);
    if (bDate.getFullYear() === year && bDate.getMonth() === month) {
      bookingMap[bDate.getDate()] = true;
    }
  });

  grid.innerHTML = '';

  // Empty cells for days before first day
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day empty';
    grid.appendChild(empty);
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.className = 'cal-day';

    const dateObj = new Date(year, month, day);
    const dateStr = formatDate(dateObj);

    if (dateObj < today) {
      cell.classList.add('past');
    }

    if (dateObj.toDateString() === today.toDateString()) {
      cell.classList.add('today');
    }

    if (promoMap[day]) {
      cell.classList.add('has-promo');
    }

    if (bookingMap[day]) {
      cell.classList.add('has-booking');
    }

    const dayNum = document.createElement('span');
    dayNum.className = 'day-number';
    dayNum.textContent = day;
    cell.appendChild(dayNum);

    // Click handler
    if (dateObj >= today) {
      cell.addEventListener('click', () => {
        selectedDate = dateStr;
        if (isAdmin) {
          // Admin clicks date to see bookings for that day
          showAdminDayBookings(dateStr);
        } else {
          openTreatmentModal(dateStr, promoMap[day] || []);
        }
      });
    }

    grid.appendChild(cell);
  }

  // Render promo legend
  renderPromoLegend();
}

function renderPromoLegend() {
  const legend = $('promoLegend');
  const list = $('promoList');

  if (promotions.length === 0) {
    legend.style.display = 'none';
    return;
  }

  legend.style.display = 'block';
  list.innerHTML = '';

  promotions.forEach(p => {
    const div = document.createElement('div');
    div.className = 'promo-item';
    const date = new Date(p.date);
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}`;
    div.innerHTML = `
      <span class="promo-date">${dateStr}</span>
      <span class="promo-desc">${escapeHtml(p.description)}</span>
    `;
    list.appendChild(div);
  });
}

// ============ Treatment Selection ============
function openTreatmentModal(dateStr, promos) {
  $('treatmentModal').style.display = 'flex';

  const date = new Date(dateStr);
  $('selectedDateDisplay').textContent = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

  // Show promo info
  const promoDiv = $('promoOnDate');
  if (promos.length > 0) {
    promoDiv.style.display = 'block';
    promoDiv.innerHTML = promos.map(p =>
      `🎉 ${escapeHtml(p.description)}${p.discount_percent ? ` (${p.discount_percent}% הנחה)` : ''}${p.discount_amount ? ` (${p.discount_amount}₪ הנחה)` : ''}`
    ).join('<br>');
  } else {
    promoDiv.style.display = 'none';
  }

  // Reset time and notes
  $('bookingTime').value = '';
  $('bookingNotes').value = '';

  // Render treatments
  const list = $('treatmentsList');
  list.innerHTML = '';

  treatments.forEach(t => {
    const card = document.createElement('div');
    card.className = 'treatment-card';

    // Calculate discounted price
    let finalPrice = t.price;
    let hasDiscount = false;
    const matchingPromo = promos.find(p => !p.treatment_id || p.treatment_id === t.id);

    if (matchingPromo) {
      hasDiscount = true;
      if (matchingPromo.discount_percent) {
        finalPrice = t.price * (1 - matchingPromo.discount_percent / 100);
      } else if (matchingPromo.discount_amount) {
        finalPrice = Math.max(0, t.price - matchingPromo.discount_amount);
      }
    }

    let priceHtml;
    if (hasDiscount) {
      priceHtml = `<span class="original-price">${t.price} ₪</span> <span class="discounted">${Math.round(finalPrice)} ₪</span>`;
    } else {
      priceHtml = `${t.price} ₪`;
    }

    card.innerHTML = `
      <span class="treatment-name">${escapeHtml(t.name_he)}</span>
      <span class="treatment-price">${priceHtml}</span>
    `;

    card.addEventListener('click', () => bookTreatment(t.id, dateStr));
    list.appendChild(card);
  });
}

async function bookTreatment(treatmentId, dateStr) {
  const time = $('bookingTime').value;
  const notes = $('bookingNotes').value.trim();

  try {
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: currentUser.id,
        treatment_id: treatmentId,
        booking_date: dateStr,
        booking_time: time || null,
        notes: notes || null,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    // Close treatment modal
    $('treatmentModal').style.display = 'none';

    // Show confirmation
    const date = new Date(dateStr);
    const formattedDate = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    $('confirmDetails').innerHTML = `
      <p><strong>טיפול:</strong> ${escapeHtml(data.treatment_name)}</p>
      <p><strong>תאריך:</strong> ${formattedDate}</p>
      ${data.booking_time ? `<p><strong>שעה:</strong> ${data.booking_time}</p>` : ''}
      <p><strong>מחיר:</strong> ${data.final_price} ₪</p>
      ${data.promotion ? `<p><strong>מבצע:</strong> ${escapeHtml(data.promotion)}</p>` : ''}
      ${data.original_price !== data.final_price ? `<p><strong>מחיר מקורי:</strong> ${data.original_price} ₪</p>` : ''}
    `;
    $('confirmModal').style.display = 'flex';

    // Refresh bookings and calendar
    await loadMyBookings();
    renderCalendar('calendarGrid', 'calendarTitle');

  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ============ My Bookings ============
function renderMyBookings() {
  const container = $('myBookings');

  if (myBookings.length === 0) {
    container.innerHTML = '<p class="empty-state">אין תורים קבועים</p>';
    return;
  }

  container.innerHTML = '';
  myBookings.forEach(b => {
    const date = new Date(b.booking_date);
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const statusText = { pending: 'ממתין', confirmed: 'אושר', cancelled: 'בוטל' };

    const div = document.createElement('div');
    div.className = 'booking-item';
    div.innerHTML = `
      <div class="booking-info">
        <div class="booking-treatment">${escapeHtml(b.treatment_name)}</div>
        <div class="booking-date">${dateStr}${b.booking_time ? ` | ${b.booking_time}` : ''} | ${b.treatment_price} ₪</div>
      </div>
      <span class="booking-status ${b.status}">${statusText[b.status] || b.status}</span>
    `;
    container.appendChild(div);
  });
}

// ============ Admin Bookings ============
function renderAllBookings(bookings) {
  const container = $('allBookingsList');

  if (bookings.length === 0) {
    container.innerHTML = '<p class="empty-state">אין תורים</p>';
    return;
  }

  container.innerHTML = '';
  bookings.forEach(b => {
    const date = new Date(b.booking_date);
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
    const statusText = { pending: 'ממתין', confirmed: 'אושר', cancelled: 'בוטל' };

    const div = document.createElement('div');
    div.className = 'booking-item';
    div.innerHTML = `
      <div class="booking-info">
        <div class="booking-treatment">${escapeHtml(b.treatment_name)}</div>
        <div class="booking-client">${escapeHtml(b.user_name)} - ${escapeHtml(b.user_phone)}</div>
        <div class="booking-date">${dateStr}${b.booking_time ? ` | ${b.booking_time}` : ''} | ${b.treatment_price} ₪</div>
        <div class="booking-actions">
          <button class="btn-success" onclick="updateBookingStatus(${b.id}, 'confirmed')">אשר</button>
          <button class="btn-danger" onclick="updateBookingStatus(${b.id}, 'cancelled')">בטל</button>
          <button onclick="deleteBooking(${b.id})" style="background:#999;color:white">מחק</button>
        </div>
      </div>
      <span class="booking-status ${b.status}">${statusText[b.status] || b.status}</span>
    `;
    container.appendChild(div);
  });
}

async function updateBookingStatus(id, status) {
  await fetch(`/api/bookings/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  showToast(status === 'confirmed' ? 'התור אושר' : 'התור בוטל', 'success');
  loadAllBookings();
}

async function deleteBooking(id) {
  if (!confirm('למחוק את התור?')) return;
  await fetch(`/api/bookings/${id}`, { method: 'DELETE' });
  showToast('התור נמחק', 'success');
  loadAllBookings();
}

function showAdminDayBookings(dateStr) {
  // Filter to show bookings for specific date
  fetch('/api/bookings/all')
    .then(res => res.json())
    .then(bookings => {
      const dayBookings = bookings.filter(b => b.booking_date === dateStr);
      renderAllBookings(dayBookings);
      // Switch to bookings tab
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="adminBookings"]').classList.add('active');
      $('adminBookings').classList.add('active');

      if (dayBookings.length === 0) {
        const date = new Date(dateStr);
        $('allBookingsList').innerHTML = `<p class="empty-state">אין תורים ב-${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}</p>`;
      }
    });
}

// ============ Promotions ============
async function handleAddPromotion(e) {
  e.preventDefault();
  const date = $('promoDate').value;
  const description = $('promoDesc').value.trim();
  const discount_percent = parseInt($('promoPercent').value) || null;
  const discount_amount = parseFloat($('promoAmount').value) || null;
  const treatment_id = parseInt($('promoTreatment').value) || null;

  try {
    const res = await fetch('/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, description, discount_percent, discount_amount, treatment_id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('המבצע נוסף בהצלחה!', 'success');
    $('addPromoForm').reset();
    await loadPromotions();
    renderActivePromos();
    renderCalendar('adminCalendarGrid', 'adminCalendarTitle', true);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderActivePromos() {
  const container = $('activePromosList');
  if (promotions.length === 0) {
    container.innerHTML = '<p class="empty-state">אין מבצעים פעילים</p>';
    return;
  }

  container.innerHTML = '';
  promotions.forEach(p => {
    const date = new Date(p.date);
    const dateStr = `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;

    const div = document.createElement('div');
    div.className = 'promo-item';
    div.innerHTML = `
      <span class="promo-date">${dateStr}</span>
      <span class="promo-desc">${escapeHtml(p.description)}</span>
      <button class="promo-delete" onclick="deletePromo(${p.id})">✕</button>
    `;
    container.appendChild(div);
  });
}

async function deletePromo(id) {
  await fetch(`/api/promotions/${id}`, { method: 'DELETE' });
  showToast('המבצע נמחק', 'success');
  await loadPromotions();
  renderActivePromos();
  renderCalendar('adminCalendarGrid', 'adminCalendarTitle', true);
}

function populatePromoTreatments() {
  const select = $('promoTreatment');
  select.innerHTML = '<option value="">כל הטיפולים</option>';
  treatments.forEach(t => {
    const option = document.createElement('option');
    option.value = t.id;
    option.textContent = t.name_he;
    select.appendChild(option);
  });
}

// ============ Notifications ============
function renderNotifications(notifs) {
  const container = $('notifList');
  if (notifs.length === 0) {
    container.innerHTML = '<p class="empty-state">אין התראות</p>';
    return;
  }

  container.innerHTML = '';
  notifs.forEach(n => {
    const div = document.createElement('div');
    div.className = `notif-item ${n.is_read ? '' : 'unread'}`;
    const time = new Date(n.created_at + 'Z');
    div.innerHTML = `
      <div>${escapeHtml(n.message)}</div>
      <div class="notif-time">${time.toLocaleString('he-IL')}</div>
    `;
    container.appendChild(div);
  });
}

async function markAllRead() {
  await fetch('/api/notifications/read-all', { method: 'PATCH' });
  loadNotifications();
  showToast('כל ההתראות סומנו כנקראו', 'success');
}

// Poll for new notifications every 30 seconds
let notifInterval;
function pollNotifications() {
  if (notifInterval) clearInterval(notifInterval);
  notifInterval = setInterval(() => {
    if (currentUser?.is_admin) {
      updateNotifCount();
    }
  }, 30000);
}

// ============ Admin Settings ============
async function handleSaveSettings(e) {
  e.preventDefault();
  const email = $('settingEmail').value.trim();
  const adminCode = $('settingAdminCode').value.trim();

  try {
    await fetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'notification_email', value: email }),
    });

    if (adminCode) {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'admin_code', value: adminCode }),
      });
    }

    showToast('ההגדרות נשמרו בהצלחה!', 'success');
  } catch (err) {
    showToast('שגיאה בשמירת ההגדרות', 'error');
  }
}

// ============ Utilities ============
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showToast(message, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

// Make admin functions globally accessible
window.updateBookingStatus = updateBookingStatus;
window.deleteBooking = deleteBooking;
window.deletePromo = deletePromo;
