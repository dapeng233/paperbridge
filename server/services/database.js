const Database = require('better-sqlite3');
const path = require('path');
const config = require('../config');
const fs = require('fs');

// 确保 data 目录存在
const dataDir = config.dataDir;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'scitools.db');
const db = new Database(dbPath);

// 开启 WAL 模式，提升并发性能
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 创建表
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nickname TEXT DEFAULT '',
    email_verified INTEGER DEFAULT 0,
    balance REAL DEFAULT 0,
    total_recharge REAL DEFAULT 0,
    total_spent REAL DEFAULT 0,
    image_count INTEGER DEFAULT 0,
    api_key TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount REAL NOT NULL,
    api_cost REAL DEFAULT 0,
    balance_after REAL NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    mode TEXT DEFAULT 'text2img',
    prompt TEXT DEFAULT '',
    translated_prompt TEXT DEFAULT '',
    model TEXT DEFAULT '',
    size TEXT DEFAULT '',
    image_filename TEXT DEFAULT '',
    cost REAL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS email_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT DEFAULT 'register',
    expires_at TEXT NOT NULL,
    used INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id);
  CREATE INDEX IF NOT EXISTS idx_email_codes_email ON email_codes(email);

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_no TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    pay_type TEXT DEFAULT '',
    trade_no TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    paid_at TEXT DEFAULT '',
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_no ON orders(order_no);

  CREATE TABLE IF NOT EXISTS recharge_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    amount REAL NOT NULL,
    used INTEGER DEFAULT 0,
    used_by INTEGER DEFAULT NULL,
    used_at TEXT DEFAULT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (used_by) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_recharge_codes_code ON recharge_codes(code);

  -- 文献管理：文件夹
  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER DEFAULT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
  );

  -- 文献管理：题录
  CREATE TABLE IF NOT EXISTS refs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    folder_id INTEGER,
    title TEXT DEFAULT '',
    authors TEXT DEFAULT '[]',
    journal TEXT DEFAULT '',
    year INTEGER,
    volume TEXT DEFAULT '',
    issue TEXT DEFAULT '',
    pages TEXT DEFAULT '',
    doi TEXT DEFAULT '',
    abstract TEXT DEFAULT '',
    keywords TEXT DEFAULT '[]',
    ref_type TEXT DEFAULT 'journal',
    pdf_filename TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_refs_folder ON refs(folder_id);
  CREATE INDEX IF NOT EXISTS idx_refs_doi ON refs(doi);

  -- 文献管理：笔记
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_id INTEGER NOT NULL,
    content TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (ref_id) REFERENCES refs(id) ON DELETE CASCADE
  );

  -- 设置
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- 引用样式
  CREATE TABLE IF NOT EXISTS citation_styles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    is_preset INTEGER DEFAULT 0,
    inline_template TEXT DEFAULT '',
    bibliography_template TEXT DEFAULT '',
    sort_by TEXT DEFAULT 'author',
    config TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Word Add-in 插入队列
  CREATE TABLE IF NOT EXISTS insert_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref_ids TEXT NOT NULL,
    style_id INTEGER NOT NULL,
    type TEXT DEFAULT 'inline',
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

module.exports = db;

// 插入预设样式（仅首次）
const presetCount = db.prepare('SELECT COUNT(*) as c FROM citation_styles WHERE is_preset = 1').get();
if (presetCount.c === 0) {
  const insert = db.prepare('INSERT INTO citation_styles (name, is_preset, inline_template, bibliography_template, sort_by, config) VALUES (?, 1, ?, ?, ?, ?)');
  insert.run('APA 7th',
    '({authors_short}, {year})',
    '{authors} ({year}). {title}. {journal}, {volume}({issue}), {pages}. https://doi.org/{doi}',
    'author',
    JSON.stringify({ authors_sep: ', ', authors_short_max: 2, et_al: 'et al.', year_parens: true })
  );
  insert.run('GB/T 7714-2015',
    '[{index}]',
    '[{index}] {authors}. {title}[J]. {journal}, {year}, {volume}({issue}): {pages}.',
    'order',
    JSON.stringify({ authors_sep: ', ', index_based: true })
  );
  insert.run('Vancouver',
    '({index})',
    '{index}. {authors}. {title}. {journal}. {year};{volume}({issue}):{pages}.',
    'order',
    JSON.stringify({ authors_sep: ', ', index_based: true })
  );
  insert.run('Harvard',
    '({authors_short} {year})',
    "{authors} {year}, '{title}', {journal}, vol. {volume}, no. {issue}, pp. {pages}.",
    'author',
    JSON.stringify({ authors_sep: ' & ', authors_short_max: 3, et_al: 'et al.' })
  );
}
