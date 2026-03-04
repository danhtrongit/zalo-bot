const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const DB_PATH = path.join(__dirname, '..', 'data', 'expenses.db');

// Ensure data directory exists
const fs = require('fs');
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
  -- Categories table
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    icon TEXT DEFAULT '📦',
    color TEXT DEFAULT '#00582a',
    budget_limit REAL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Expenses table
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'VND',
    note TEXT,
    image_url TEXT,
    zalo_user_id TEXT,
    zalo_user_name TEXT,
    created_by TEXT DEFAULT 'bot',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );

  -- Budget table
  CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    month TEXT NOT NULL,
    budget_amount REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    UNIQUE(category_id, month)
  );

  -- Chat history for AI context
  CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zalo_user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Settings table
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Allowed users table
  CREATE TABLE IF NOT EXISTS allowed_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zalo_user_id TEXT NOT NULL UNIQUE,
    display_name TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    department TEXT DEFAULT '',
    added_by TEXT DEFAULT 'admin',
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Login tokens for dashboard auth
  CREATE TABLE IF NOT EXISTS login_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    zalo_user_id TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    used INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Active sessions
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL UNIQUE,
    zalo_user_id TEXT NOT NULL,
    display_name TEXT DEFAULT '',
    role TEXT DEFAULT 'user',
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Pending actions (edit/delete requests needing admin approval)
  CREATE TABLE IF NOT EXISTS pending_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    expense_id INTEGER NOT NULL,
    requested_by TEXT NOT NULL,
    requested_by_name TEXT DEFAULT '',
    old_data TEXT,
    new_data TEXT,
    status TEXT DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (expense_id) REFERENCES expenses(id)
  );
`);

// Migrations for existing databases
try { db.prepare('ALTER TABLE expenses ADD COLUMN image_url TEXT').run(); } catch (e) { /* column already exists */ }
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS pending_actions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT NOT NULL,
    expense_id INTEGER NOT NULL,
    requested_by TEXT NOT NULL,
    requested_by_name TEXT DEFAULT '',
    old_data TEXT,
    new_data TEXT,
    status TEXT DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`).run();
} catch (e) { /* table exists */ }

// Seed default categories
const defaultCategories = [
  { name: 'Thiết bị & Công nghệ', icon: '💻', color: '#2196F3' },
  { name: 'Văn phòng phẩm', icon: '📎', color: '#FF9800' },
  { name: 'Di chuyển & Vận chuyển', icon: '🚗', color: '#4CAF50' },
  { name: 'Ăn uống & Tiếp khách', icon: '🍽️', color: '#E91E63' },
  { name: 'Marketing & Quảng cáo', icon: '📢', color: '#9C27B0' },
  { name: 'Nhân sự & Lương', icon: '👥', color: '#00BCD4' },
  { name: 'Thuê mặt bằng', icon: '🏢', color: '#795548' },
  { name: 'Sản xuất phim', icon: '🎬', color: '#F44336' },
  { name: 'Hậu kỳ & Dựng phim', icon: '🎞️', color: '#673AB7' },
  { name: 'Bản quyền & Pháp lý', icon: '📜', color: '#607D8B' },
  { name: 'Điện, nước, Internet', icon: '⚡', color: '#FFEB3B' },
  { name: 'Khác', icon: '📦', color: '#9E9E9E' },
];

const insertCat = db.prepare(`
  INSERT OR IGNORE INTO categories (name, icon, color) VALUES (?, ?, ?)
`);

const insertMany = db.transaction((cats) => {
  for (const cat of cats) {
    insertCat.run(cat.name, cat.icon, cat.color);
  }
});

insertMany(defaultCategories);

// Seed admin user from .env
const ADMIN_ZALO_ID = process.env.ADMIN_ZALO_ID;
if (ADMIN_ZALO_ID) {
  db.prepare(`
    INSERT OR IGNORE INTO allowed_users (zalo_user_id, display_name, role, added_by)
    VALUES (?, 'Admin', 'admin', 'system')
  `).run(ADMIN_ZALO_ID);
}

// Migration: add department column if missing
try { db.prepare('ALTER TABLE allowed_users ADD COLUMN department TEXT DEFAULT ""').run(); } catch (e) { /* already exists */ }

// Migration: soft delete for expenses
try { db.prepare('ALTER TABLE expenses ADD COLUMN is_deleted INTEGER DEFAULT 0').run(); } catch (e) { }
try { db.prepare('ALTER TABLE expenses ADD COLUMN deleted_at DATETIME').run(); } catch (e) { }
try { db.prepare('ALTER TABLE expenses ADD COLUMN deleted_by TEXT').run(); } catch (e) { }
try { db.prepare('ALTER TABLE expenses ADD COLUMN delete_reason TEXT').run(); } catch (e) { }
// Payment status: unpaid / requested / paid
try { db.prepare('ALTER TABLE expenses ADD COLUMN payment_status TEXT DEFAULT "unpaid"').run(); } catch (e) { }

// Migration: reason field for pending_actions
try { db.prepare('ALTER TABLE pending_actions ADD COLUMN reason TEXT DEFAULT ""').run(); } catch (e) { }

// Edit history table
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS edit_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT NOT NULL,
    changed_by_name TEXT DEFAULT '',
    change_reason TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
} catch (e) { }

// Payment requests table (tách riêng quản lý thanh toán)
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS payment_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requested_by TEXT NOT NULL,
    requested_by_name TEXT DEFAULT '',
    from_date TEXT,
    to_date TEXT,
    total_amount REAL DEFAULT 0,
    expense_count INTEGER DEFAULT 0,
    expense_ids TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    approved_by TEXT,
    approved_at DATETIME,
    paid_at DATETIME,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
} catch (e) { }

// Advances table (tạm ứng)
try {
  db.prepare(`CREATE TABLE IF NOT EXISTS advances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zalo_user_id TEXT NOT NULL,
    zalo_user_name TEXT DEFAULT '',
    amount REAL NOT NULL,
    purpose TEXT DEFAULT '',
    status TEXT DEFAULT 'pending',
    approved_by TEXT,
    approved_at DATETIME,
    settled_at DATETIME,
    settled_amount REAL DEFAULT 0,
    note TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`).run();
} catch (e) { }

// =============  DAO Functions =============

const dao = {
  // ---- Categories ----
  getAllCategories() {
    return db.prepare('SELECT * FROM categories ORDER BY name').all();
  },

  getCategoryById(id) {
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  },

  getCategoryByName(name) {
    return db.prepare('SELECT * FROM categories WHERE name = ?').get(name);
  },

  createCategory(name, icon = '📦', color = '#00582a') {
    const result = db.prepare('INSERT INTO categories (name, icon, color) VALUES (?, ?, ?)').run(name, icon, color);
    return result.lastInsertRowid;
  },

  updateCategory(id, { name, icon, color, budget_limit }) {
    const sets = [];
    const params = [];
    if (name !== undefined) { sets.push('name = ?'); params.push(name); }
    if (icon !== undefined) { sets.push('icon = ?'); params.push(icon); }
    if (color !== undefined) { sets.push('color = ?'); params.push(color); }
    if (budget_limit !== undefined) { sets.push('budget_limit = ?'); params.push(budget_limit); }
    if (sets.length === 0) return;
    params.push(id);
    db.prepare(`UPDATE categories SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },

  deleteCategory(id) {
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  },

  // ---- Expenses ----
  addExpense({ category_id, description, amount, currency = 'VND', note, image_url, zalo_user_id, zalo_user_name, created_by = 'bot', created_at }) {
    const cols = ['category_id', 'description', 'amount', 'currency', 'note', 'image_url', 'zalo_user_id', 'zalo_user_name', 'created_by'];
    const vals = [category_id, description, amount, currency, note, image_url || null, zalo_user_id, zalo_user_name, created_by];
    if (created_at) { cols.push('created_at'); vals.push(created_at); }
    const placeholders = cols.map(() => '?').join(', ');
    const result = db.prepare(`INSERT INTO expenses (${cols.join(', ')}) VALUES (${placeholders})`).run(...vals);
    return result.lastInsertRowid;
  },

  updateExpenseImage(expenseId, imageUrl) {
    db.prepare('UPDATE expenses SET image_url = ? WHERE id = ?').run(imageUrl, expenseId);
  },

  // Check for duplicate expense (same user, similar amount & description within 10 min)
  findDuplicateExpense(userId, amount, description, minutesWindow = 10) {
    const expense = db.prepare(`
      SELECT * FROM expenses 
      WHERE zalo_user_id = ? 
        AND amount = ? 
        AND created_at >= datetime('now', '-${minutesWindow} minutes')
      ORDER BY created_at DESC LIMIT 1
    `).get(userId, amount);

    if (!expense) return null;

    // Check description similarity (simple)
    const descA = (expense.description || '').toLowerCase().trim();
    const descB = (description || '').toLowerCase().trim();
    if (descA === descB || descA.includes(descB) || descB.includes(descA)) {
      return expense;
    }
    // Same amount within window is enough
    if (Math.abs(expense.amount - amount) < 1) {
      return expense;
    }
    return null;
  },

  // Append additional image to existing expense (multi-image invoice)
  appendExpenseImage(expenseId, newImageUrl) {
    const expense = db.prepare('SELECT image_url FROM expenses WHERE id = ?').get(expenseId);
    if (!expense) return;
    const current = expense.image_url || '';
    const updated = current ? `${current},${newImageUrl}` : newImageUrl;
    db.prepare('UPDATE expenses SET image_url = ? WHERE id = ?').run(updated, expenseId);
  },

  getExpenses({ limit = 50, offset = 0, category_id, from_date, to_date, search, user_id } = {}) {
    let where = [];
    let params = [];

    where.push('(e.is_deleted = 0 OR e.is_deleted IS NULL)');
    if (user_id) { where.push('e.zalo_user_id = ?'); params.push(user_id); }
    if (category_id) { where.push('e.category_id = ?'); params.push(category_id); }
    if (from_date) { where.push("e.created_at >= ?"); params.push(from_date); }
    if (to_date) { where.push("e.created_at <= ?"); params.push(to_date + ' 23:59:59'); }
    if (search) { where.push("(e.description LIKE ? OR e.note LIKE ?)"); params.push(`%${search}%`, `%${search}%`); }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    const rows = db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const countRow = db.prepare(`SELECT COUNT(*) as total FROM expenses e ${whereClause}`).get(...params);

    return { rows, total: countRow.total };
  },

  getExpenseById(id) {
    return db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(id);
  },

  updateExpense(id, { category_id, description, amount, note }) {
    const sets = ['updated_at = CURRENT_TIMESTAMP'];
    const params = [];
    if (category_id !== undefined) { sets.push('category_id = ?'); params.push(category_id); }
    if (description !== undefined) { sets.push('description = ?'); params.push(description); }
    if (amount !== undefined) { sets.push('amount = ?'); params.push(amount); }
    if (note !== undefined) { sets.push('note = ?'); params.push(note); }
    params.push(id);
    db.prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },

  deleteExpense(id) {
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
  },

  // Soft delete
  softDeleteExpense(id, deletedBy, reason = '') {
    db.prepare(`UPDATE expenses SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, deleted_by = ?, delete_reason = ? WHERE id = ?`)
      .run(deletedBy, reason, id);
  },

  restoreExpense(id) {
    db.prepare(`UPDATE expenses SET is_deleted = 0, deleted_at = NULL, deleted_by = NULL, delete_reason = NULL WHERE id = ?`)
      .run(id);
  },

  getDeletedExpenses(userId) {
    let sql = `SELECT e.*, c.name as category_name, c.icon as category_icon
      FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.is_deleted = 1`;
    const params = [];
    if (userId) { sql += ' AND e.zalo_user_id = ?'; params.push(userId); }
    sql += ' ORDER BY e.deleted_at DESC LIMIT 100';
    return db.prepare(sql).all(...params);
  },

  // Edit history
  addEditHistory(expenseId, fieldName, oldValue, newValue, changedBy, changedByName = '', reason = '') {
    db.prepare(`INSERT INTO edit_history (expense_id, field_name, old_value, new_value, changed_by, changed_by_name, change_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(expenseId, fieldName, String(oldValue ?? ''), String(newValue ?? ''), changedBy, changedByName, reason);
  },

  getEditHistory(expenseId) {
    return db.prepare('SELECT * FROM edit_history WHERE expense_id = ? ORDER BY created_at DESC').all(expenseId);
  },

  // ---- Statistics ----
  getExpenseSummary({ from_date, to_date, zalo_user_id } = {}) {
    let where = ['(e.is_deleted = 0 OR e.is_deleted IS NULL)'];
    let params = [];
    if (from_date) { where.push("e.created_at >= ?"); params.push(from_date); }
    if (to_date) { where.push("e.created_at <= ?"); params.push(to_date + ' 23:59:59'); }
    if (zalo_user_id) { where.push("e.zalo_user_id = ?"); params.push(zalo_user_id); }
    const whereClause = 'WHERE ' + where.join(' AND ');

    const total = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses e ${whereClause}`).get(...params);
    const count = db.prepare(`SELECT COUNT(*) as count FROM expenses e ${whereClause}`).get(...params);

    const byCategory = db.prepare(`
      SELECT c.id, c.name, c.icon, c.color, 
             COALESCE(SUM(e.amount), 0) as total,
             COUNT(e.id) as count
      FROM categories c
      LEFT JOIN expenses e ON c.id = e.category_id ${where.length > 0 ? 'AND ' + where.join(' AND ') : ''}
      GROUP BY c.id
      HAVING total > 0
      ORDER BY total DESC
    `).all(...params);

    return {
      total_amount: total.total,
      total_count: count.count,
      by_category: byCategory
    };
  },

  getMonthlyTrend(months = 12, zalo_user_id) {
    let userFilter = '';
    const params = [];
    if (zalo_user_id) {
      userFilter = ' AND zalo_user_id = ?';
      params.push(zalo_user_id);
    }
    return db.prepare(`
      SELECT strftime('%Y-%m', created_at) as month,
             SUM(amount) as total,
             COUNT(*) as count
      FROM expenses
      WHERE created_at >= date('now', '-${months} months')${userFilter}
      GROUP BY month
      ORDER BY month ASC
    `).all(...params);
  },

  getDailyTrend(days = 30, zalo_user_id) {
    let userFilter = '';
    const params = [];
    if (zalo_user_id) {
      userFilter = ' AND zalo_user_id = ?';
      params.push(zalo_user_id);
    }
    return db.prepare(`
      SELECT strftime('%Y-%m-%d', created_at) as day,
             SUM(amount) as total,
             COUNT(*) as count
      FROM expenses
      WHERE created_at >= date('now', '-${days} days')${userFilter}
      GROUP BY day
      ORDER BY day ASC
    `).all(...params);
  },

  getTopExpenses(limit = 10, from_date, to_date, zalo_user_id) {
    let where = [];
    let params = [];
    if (from_date) { where.push("e.created_at >= ?"); params.push(from_date); }
    if (to_date) { where.push("e.created_at <= ?"); params.push(to_date + ' 23:59:59'); }
    if (zalo_user_id) { where.push("e.zalo_user_id = ?"); params.push(zalo_user_id); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

    return db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      ${whereClause}
      ORDER BY e.amount DESC
      LIMIT ?
    `).all(...params, limit);
  },



  // ---- Chat History ----
  addChatMessage(zalo_user_id, role, content) {
    db.prepare('INSERT INTO chat_history (zalo_user_id, role, content) VALUES (?, ?, ?)').run(zalo_user_id, role, content);
  },

  getChatHistory(zalo_user_id, limit = 10) {
    return db.prepare(`
      SELECT * FROM chat_history 
      WHERE zalo_user_id = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `).all(zalo_user_id, limit).reverse();
  },

  // ---- Settings ----
  getSetting(key) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? row.value : null;
  },

  setSetting(key, value) {
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  },

  getDashboardStats(userId) {
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);
    const userFilter = userId ? ' AND zalo_user_id = ?' : '';
    const userParams = userId ? [userId] : [];

    const todayTotal = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses WHERE strftime('%Y-%m-%d', created_at) = ?${userFilter}
    `).get(today, ...userParams);

    const monthTotal = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses WHERE strftime('%Y-%m', created_at) = ?${userFilter}
    `).get(month, ...userParams);

    const allWhere = userId ? ' WHERE zalo_user_id = ?' : '';
    const allTimeTotal = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses${allWhere}
    `).get(...userParams);

    const recentWhere = userId ? 'WHERE e.zalo_user_id = ?' : '';
    const recentExpenses = db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      ${recentWhere}
      ORDER BY e.created_at DESC LIMIT 10
    `).all(...userParams);

    return {
      today: todayTotal,
      month: monthTotal,
      all_time: allTimeTotal,
      recent: recentExpenses
    };
  },

  // ---- Allowed Users ----
  isUserAllowed(zaloUserId) {
    const user = db.prepare('SELECT * FROM allowed_users WHERE zalo_user_id = ? AND is_active = 1').get(zaloUserId);
    return !!user;
  },

  getUserRole(zaloUserId) {
    const user = db.prepare('SELECT role FROM allowed_users WHERE zalo_user_id = ? AND is_active = 1').get(zaloUserId);
    return user ? user.role : null;
  },

  getAllowedUser(zaloUserId) {
    return db.prepare('SELECT * FROM allowed_users WHERE zalo_user_id = ?').get(zaloUserId);
  },

  getAllAllowedUsers() {
    return db.prepare('SELECT * FROM allowed_users ORDER BY created_at DESC').all();
  },

  addAllowedUser(zaloUserId, displayName = '', role = 'user', addedBy = 'admin', department = '') {
    const result = db.prepare(`
      INSERT OR IGNORE INTO allowed_users (zalo_user_id, display_name, role, added_by, department)
      VALUES (?, ?, ?, ?, ?)
    `).run(zaloUserId, displayName, role, addedBy, department);
    return result.lastInsertRowid;
  },

  updateAllowedUser(id, { display_name, role, is_active, department }) {
    const sets = [];
    const params = [];
    if (display_name !== undefined) { sets.push('display_name = ?'); params.push(display_name); }
    if (role !== undefined) { sets.push('role = ?'); params.push(role); }
    if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (department !== undefined) { sets.push('department = ?'); params.push(department); }
    if (sets.length === 0) return;
    params.push(id);
    db.prepare(`UPDATE allowed_users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  },

  updateUserName(zaloUserId, displayName) {
    db.prepare('UPDATE allowed_users SET display_name = ? WHERE zalo_user_id = ?').run(displayName, zaloUserId);
  },

  removeAllowedUser(id) {
    db.prepare('DELETE FROM allowed_users WHERE id = ?').run(id);
  },

  // ---- Login Tokens ----
  createLoginToken(zaloUserId) {
    // Invalidate old tokens for this user
    db.prepare('DELETE FROM login_tokens WHERE zalo_user_id = ?').run(zaloUserId);

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

    db.prepare(`
      INSERT INTO login_tokens (token, zalo_user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(token, zaloUserId, expiresAt);

    return token;
  },

  validateLoginToken(token) {
    const row = db.prepare(`
      SELECT * FROM login_tokens 
      WHERE token = ? AND used = 0 AND expires_at > datetime('now')
    `).get(token);

    if (row) {
      // Mark as used
      db.prepare('UPDATE login_tokens SET used = 1 WHERE id = ?').run(row.id);
      return row;
    }
    return null;
  },

  // ---- Sessions ----
  createSession(zaloUserId, displayName = '', role = 'user') {
    const sessionToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

    db.prepare(`
      INSERT INTO sessions (session_token, zalo_user_id, display_name, role, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(sessionToken, zaloUserId, displayName, role, expiresAt);

    return sessionToken;
  },

  validateSession(sessionToken) {
    return db.prepare(`
      SELECT * FROM sessions 
      WHERE session_token = ? AND expires_at > datetime('now')
    `).get(sessionToken);
  },

  deleteSession(sessionToken) {
    db.prepare('DELETE FROM sessions WHERE session_token = ?').run(sessionToken);
  },

  cleanExpiredSessions() {
    db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
    db.prepare("DELETE FROM login_tokens WHERE expires_at < datetime('now')").run();
  },

  // ---- Pending Actions ----
  getExpenseById(id) {
    return db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon
      FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
      WHERE e.id = ?
    `).get(id);
  },

  createPendingAction({ action_type, expense_id, requested_by, requested_by_name, old_data, new_data, reason }) {
    const result = db.prepare(`
      INSERT INTO pending_actions (action_type, expense_id, requested_by, requested_by_name, old_data, new_data, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(action_type, expense_id, requested_by, requested_by_name,
      old_data ? JSON.stringify(old_data) : null,
      new_data ? JSON.stringify(new_data) : null,
      reason || '');
    return result.lastInsertRowid;
  },

  getPendingActions(status = 'pending') {
    return db.prepare(`
      SELECT pa.*, e.description as expense_description, e.amount as expense_amount
      FROM pending_actions pa
      LEFT JOIN expenses e ON pa.expense_id = e.id
      WHERE pa.status = ?
      ORDER BY pa.created_at DESC
    `).all(status);
  },

  getPendingActionById(id) {
    return db.prepare('SELECT * FROM pending_actions WHERE id = ?').get(id);
  },

  countPendingActions() {
    const row = db.prepare("SELECT COUNT(*) as count FROM pending_actions WHERE status = 'pending'").get();
    return row.count;
  },

  approvePendingAction(actionId, reviewedBy) {
    const action = db.prepare('SELECT * FROM pending_actions WHERE id = ? AND status = ?').get(actionId, 'pending');
    if (!action) return null;

    if (action.action_type === 'delete') {
      this.softDeleteExpense(action.expense_id, reviewedBy, action.reason || '');
    } else if (action.action_type === 'edit') {
      const newData = JSON.parse(action.new_data);
      const oldExpense = this.getExpenseById(action.expense_id);
      const sets = [];
      const vals = [];
      for (const [key, val] of Object.entries(newData)) {
        if (val !== undefined && oldExpense && oldExpense[key] !== val) {
          this.addEditHistory(action.expense_id, key, oldExpense[key], val, action.requested_by, action.requested_by_name, action.reason || '');
          if (['description', 'amount', 'category_id', 'note'].includes(key)) {
            sets.push(`${key} = ?`); vals.push(val);
          }
        }
      }
      if (sets.length > 0) {
        sets.push("updated_at = CURRENT_TIMESTAMP");
        vals.push(action.expense_id);
        db.prepare(`UPDATE expenses SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
      }
    }

    db.prepare(`UPDATE pending_actions SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(reviewedBy, actionId);
    return action;
  },

  rejectPendingAction(actionId, reviewedBy) {
    db.prepare(`UPDATE pending_actions SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(reviewedBy, actionId);
  },

  // ---- Payment Requests ----
  createPaymentRequest({ requested_by, requested_by_name, from_date, to_date, total_amount, expense_count, expense_ids, note }) {
    if (expense_ids) {
      const ids = expense_ids.split(',').map(Number).filter(n => n > 0);
      for (const eid of ids) {
        db.prepare('UPDATE expenses SET payment_status = ? WHERE id = ?').run('requested', eid);
      }
    }
    const result = db.prepare(`
      INSERT INTO payment_requests (requested_by, requested_by_name, from_date, to_date, total_amount, expense_count, expense_ids, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(requested_by, requested_by_name || '', from_date || '', to_date || '', total_amount, expense_count, expense_ids || '', note || '');
    return result.lastInsertRowid;
  },

  getPaymentRequests({ userId, from_date, to_date } = {}) {
    let where = [];
    let params = [];
    if (userId) { where.push('requested_by = ?'); params.push(userId); }
    if (from_date) { where.push('created_at >= ?'); params.push(from_date); }
    if (to_date) { where.push('created_at <= ?'); params.push(to_date + ' 23:59:59'); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    return db.prepare(`SELECT * FROM payment_requests ${whereClause} ORDER BY created_at DESC`).all(...params);
  },
  getPaymentRequestById(id) {
    return db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(id);
  },

  approvePaymentRequest(id, approvedBy) {
    db.prepare(`UPDATE payment_requests SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(approvedBy, id);
  },

  markPaymentRequestPaid(id) {
    const pr = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(id);
    if (!pr) return;
    db.prepare(`UPDATE payment_requests SET status = 'paid', paid_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    if (pr.expense_ids) {
      const ids = pr.expense_ids.split(',').map(Number).filter(n => n > 0);
      for (const eid of ids) {
        db.prepare('UPDATE expenses SET payment_status = ? WHERE id = ?').run('paid', eid);
      }
    }
  },

  markPaymentRequestPrinted(id) {
    db.prepare(`UPDATE payment_requests SET status = 'printed' WHERE id = ?`).run(id);
  },

  markPaymentRequestSubmitted(id) {
    db.prepare(`UPDATE payment_requests SET status = 'submitted' WHERE id = ?`).run(id);
  },

  rejectPaymentRequest(id) {
    const pr = db.prepare('SELECT * FROM payment_requests WHERE id = ?').get(id);
    if (!pr) return;
    db.prepare(`UPDATE payment_requests SET status = 'rejected' WHERE id = ?`).run(id);
    if (pr.expense_ids) {
      const ids = pr.expense_ids.split(',').map(Number).filter(n => n > 0);
      for (const eid of ids) {
        db.prepare('UPDATE expenses SET payment_status = ? WHERE id = ?').run('unpaid', eid);
      }
    }
  },

  // ---- Advances (Tạm ứng) ----
  createAdvance({ zalo_user_id, zalo_user_name, amount, purpose, note }) {
    const result = db.prepare(`
      INSERT INTO advances (zalo_user_id, zalo_user_name, amount, purpose, note)
      VALUES (?, ?, ?, ?, ?)
    `).run(zalo_user_id, zalo_user_name || '', amount, purpose || '', note || '');
    return result.lastInsertRowid;
  },

  getAdvances(userId) {
    let sql = `SELECT * FROM advances`;
    const params = [];
    if (userId) { sql += ' WHERE zalo_user_id = ?'; params.push(userId); }
    sql += ' ORDER BY created_at DESC';
    return db.prepare(sql).all(...params);
  },

  approveAdvance(id, approvedBy) {
    db.prepare(`UPDATE advances SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(approvedBy, id);
  },

  rejectAdvance(id) {
    db.prepare(`UPDATE advances SET status = 'rejected' WHERE id = ?`).run(id);
  },

  settleAdvance(id, settledAmount, note) {
    db.prepare(`UPDATE advances SET status = 'settled', settled_at = CURRENT_TIMESTAMP, settled_amount = ?, note = COALESCE(note || ' | ' || ?, note) WHERE id = ?`)
      .run(settledAmount, note || '', id);
  },

  // ---- Data Management (Admin) ----
  clearAllData() {
    db.prepare('DELETE FROM edit_history').run();
    db.prepare('DELETE FROM pending_actions').run();
    db.prepare('DELETE FROM payment_requests').run();
    db.prepare('DELETE FROM advances').run();
    db.prepare('DELETE FROM expenses').run();
    return { ok: true };
  },

  clearUserData(zaloUserId) {
    // Get user expense IDs first
    const expenses = db.prepare('SELECT id FROM expenses WHERE zalo_user_id = ?').all(zaloUserId);
    const expenseIds = expenses.map(e => e.id);
    if (expenseIds.length > 0) {
      const placeholders = expenseIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM edit_history WHERE expense_id IN (${placeholders})`).run(...expenseIds);
      db.prepare(`DELETE FROM pending_actions WHERE expense_id IN (${placeholders})`).run(...expenseIds);
    }
    db.prepare('DELETE FROM payment_requests WHERE requested_by = ?').run(zaloUserId);
    db.prepare('DELETE FROM advances WHERE zalo_user_id = ?').run(zaloUserId);
    db.prepare('DELETE FROM expenses WHERE zalo_user_id = ?').run(zaloUserId);
    return { ok: true, deleted_expenses: expenseIds.length };
  },
};

module.exports = { db, dao };
