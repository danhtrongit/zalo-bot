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
`);

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
  addExpense({ category_id, description, amount, currency = 'VND', note, zalo_user_id, zalo_user_name, created_by = 'bot', created_at }) {
    if (created_at) {
      const result = db.prepare(`
        INSERT INTO expenses (category_id, description, amount, currency, note, zalo_user_id, zalo_user_name, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(category_id, description, amount, currency, note, zalo_user_id, zalo_user_name, created_by, created_at);
      return result.lastInsertRowid;
    }
    const result = db.prepare(`
      INSERT INTO expenses (category_id, description, amount, currency, note, zalo_user_id, zalo_user_name, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(category_id, description, amount, currency, note, zalo_user_id, zalo_user_name, created_by);
    return result.lastInsertRowid;
  },

  getExpenses({ limit = 50, offset = 0, category_id, from_date, to_date, search } = {}) {
    let where = [];
    let params = [];

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

  // ---- Statistics ----
  getExpenseSummary({ from_date, to_date, zalo_user_id } = {}) {
    let where = [];
    let params = [];
    if (from_date) { where.push("e.created_at >= ?"); params.push(from_date); }
    if (to_date) { where.push("e.created_at <= ?"); params.push(to_date + ' 23:59:59'); }
    if (zalo_user_id) { where.push("e.zalo_user_id = ?"); params.push(zalo_user_id); }
    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';

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

  // ---- Dashboard Stats ----
  getDashboardStats() {
    const today = new Date().toISOString().split('T')[0];
    const month = today.substring(0, 7);

    const todayTotal = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses WHERE strftime('%Y-%m-%d', created_at) = ?
    `).get(today);

    const monthTotal = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses WHERE strftime('%Y-%m', created_at) = ?
    `).get(month);

    const allTimeTotal = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
      FROM expenses
    `).get();

    const recentExpenses = db.prepare(`
      SELECT e.*, c.name as category_name, c.icon as category_icon, c.color as category_color
      FROM expenses e
      LEFT JOIN categories c ON e.category_id = c.id
      ORDER BY e.created_at DESC LIMIT 10
    `).all();

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

  addAllowedUser(zaloUserId, displayName = '', role = 'user', addedBy = 'admin') {
    const result = db.prepare(`
      INSERT OR IGNORE INTO allowed_users (zalo_user_id, display_name, role, added_by)
      VALUES (?, ?, ?, ?)
    `).run(zaloUserId, displayName, role, addedBy);
    return result.lastInsertRowid;
  },

  updateAllowedUser(id, { display_name, role, is_active }) {
    const sets = [];
    const params = [];
    if (display_name !== undefined) { sets.push('display_name = ?'); params.push(display_name); }
    if (role !== undefined) { sets.push('role = ?'); params.push(role); }
    if (is_active !== undefined) { sets.push('is_active = ?'); params.push(is_active ? 1 : 0); }
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
  }
};

module.exports = { db, dao };
