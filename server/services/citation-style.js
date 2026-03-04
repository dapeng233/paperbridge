const db = require('./database');

// === 样式 CRUD ===
function getStyles() {
  return db.prepare('SELECT * FROM citation_styles ORDER BY is_preset DESC, name').all();
}

function getStyleById(id) {
  return db.prepare('SELECT * FROM citation_styles WHERE id = ?').get(id);
}

function createStyle(data) {
  const r = db.prepare(
    'INSERT INTO citation_styles (name, inline_template, bibliography_template, sort_by, config) VALUES (?, ?, ?, ?, ?)'
  ).run(data.name, data.inline_template || '', data.bibliography_template || '', data.sort_by || 'author', JSON.stringify(data.config || {}));
  return { id: r.lastInsertRowid };
}

function updateStyle(id, data) {
  const style = getStyleById(id);
  if (!style) throw new Error('样式不存在');
  db.prepare(
    "UPDATE citation_styles SET name=?, inline_template=?, bibliography_template=?, sort_by=?, config=?, updated_at=datetime('now') WHERE id=?"
  ).run(data.name ?? style.name, data.inline_template ?? style.inline_template, data.bibliography_template ?? style.bibliography_template, data.sort_by ?? style.sort_by, JSON.stringify(data.config || JSON.parse(style.config || '{}')), id);
}

function deleteStyle(id) {
  const style = getStyleById(id);
  if (style && style.is_preset) throw new Error('不能删除预设样式');
  db.prepare('DELETE FROM citation_styles WHERE id = ?').run(id);
}

// === 引用格式化引擎 ===
function formatAuthorsShort(authors, config) {
  if (!authors || authors.length === 0) return 'Unknown';
  const max = config.authors_short_max || 2;
  const etAl = config.et_al || 'et al.';
  // 取姓氏
  const surnames = authors.map(a => {
    const parts = a.trim().split(/\s+/);
    return parts[parts.length - 1]; // 取最后一个词作为姓氏
  });
  if (surnames.length <= max) return surnames.join(config.authors_sep || ', ');
  return surnames[0] + ' ' + etAl;
}

function formatAuthorsFull(authors, config) {
  if (!authors || authors.length === 0) return 'Unknown';
  return authors.join(config.authors_sep || ', ');
}

function applyTemplate(template, ref, index, config) {
  let authors = [];
  try { authors = typeof ref.authors === 'string' ? JSON.parse(ref.authors) : ref.authors || []; } catch { authors = []; }

  const replacements = {
    '{authors}': formatAuthorsFull(authors, config),
    '{authors_short}': formatAuthorsShort(authors, config),
    '{year}': ref.year || '',
    '{title}': ref.title || '',
    '{journal}': ref.journal || '',
    '{volume}': ref.volume || '',
    '{issue}': ref.issue || '',
    '{pages}': ref.pages || '',
    '{doi}': ref.doi || '',
    '{index}': String(index)
  };

  let result = template;
  for (const [key, val] of Object.entries(replacements)) {
    result = result.split(key).join(val);
  }
  // 清理空字段造成的多余标点
  result = result.replace(/,\s*,/g, ',').replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ');
  return result.trim();
}

// 生成文内引用
function formatInlineCitation(refs, style, startIndex) {
  const config = typeof style.config === 'string' ? JSON.parse(style.config) : style.config || {};
  if (refs.length === 1) {
    return applyTemplate(style.inline_template, refs[0], startIndex || 1, config);
  }
  // 多条合并：如 (Author1, 2007; Author2, 2019) 或 [1,2]
  const inner = refs.map((r, i) => {
    const idx = (startIndex || 1) + i;
    let t = applyTemplate(style.inline_template, r, idx, config);
    // 去掉外层括号用于合并
    t = t.replace(/^\((.+)\)$/, '$1').replace(/^\[(.+)\]$/, '$1');
    return t;
  });
  const opener = style.inline_template.startsWith('[') ? '[' : '(';
  const closer = opener === '[' ? ']' : ')';
  const sep = config.index_based ? ',' : '; ';
  return opener + inner.join(sep) + closer;
}

// 生成文后参考文献列表
function formatBibliography(refs, style, startIndex) {
  const config = typeof style.config === 'string' ? JSON.parse(style.config) : style.config || {};
  const sorted = [...refs];
  if (style.sort_by === 'author') {
    sorted.sort((a, b) => {
      const aa = (typeof a.authors === 'string' ? JSON.parse(a.authors) : a.authors || [])[0] || '';
      const bb = (typeof b.authors === 'string' ? JSON.parse(b.authors) : b.authors || [])[0] || '';
      return aa.localeCompare(bb);
    });
  }
  return sorted.map((r, i) => applyTemplate(style.bibliography_template, r, (startIndex || 1) + i, config)).join('\n');
}

// 生成 unformatted 引文标记: {Author, Year #ID}
function formatUnformatted(refs) {
  return '{' + refs.map(r => {
    let authors = [];
    try { authors = typeof r.authors === 'string' ? JSON.parse(r.authors) : r.authors || []; } catch { authors = []; }
    const surname = authors.length > 0 ? authors[0].trim().split(/\s+/).pop() : 'Unknown';
    return surname + ', ' + (r.year || '') + ' #' + r.id;
  }).join('; ') + '}';
}

// === 插入队列 ===
function pushToQueue(refIds, styleId, type) {
  const r = db.prepare('INSERT INTO insert_queue (ref_ids, style_id, type) VALUES (?, ?, ?)').run(JSON.stringify(refIds), styleId, type || 'inline');
  return { id: r.lastInsertRowid };
}

function pollQueue() {
  const item = db.prepare("SELECT * FROM insert_queue WHERE status = 'pending' ORDER BY id LIMIT 1").get();
  if (item) {
    db.prepare("UPDATE insert_queue SET status = 'done' WHERE id = ?").run(item.id);
  }
  return item || null;
}

module.exports = {
  getStyles, getStyleById, createStyle, updateStyle, deleteStyle,
  formatInlineCitation, formatBibliography, formatUnformatted, applyTemplate,
  pushToQueue, pollQueue
};
