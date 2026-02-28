const db = require('./database');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

// === 设置 ===
function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

function getLibraryPath() {
  return getSetting('library_path') || '';
}

// === 文件夹 ===
function getFolders() {
  return db.prepare('SELECT * FROM folders ORDER BY sort_order, id').all();
}

function createFolder(name, parentId = null) {
  const r = db.prepare('INSERT INTO folders (name, parent_id) VALUES (?, ?)').run(name, parentId || null);
  return { id: r.lastInsertRowid, name, parent_id: parentId };
}

function renameFolder(id, name) {
  db.prepare('UPDATE folders SET name = ? WHERE id = ?').run(name, id);
}

function deleteFolder(id) {
  db.prepare('DELETE FROM folders WHERE id = ?').run(id);
}

// === 题录 ===
function getRefs(folderId) {
  if (folderId) {
    return db.prepare('SELECT * FROM refs WHERE folder_id = ? ORDER BY id DESC').all(folderId);
  }
  return db.prepare('SELECT * FROM refs ORDER BY id DESC').all();
}

function getRefById(id) {
  return db.prepare('SELECT * FROM refs WHERE id = ?').get(id);
}

function createRef(data) {
  const stmt = db.prepare(`INSERT INTO refs (folder_id, title, authors, journal, year, volume, issue, pages, doi, abstract, keywords, ref_type, pdf_filename)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const r = stmt.run(
    data.folder_id || null, data.title || '', JSON.stringify(data.authors || []),
    data.journal || '', data.year || null, data.volume || '', data.issue || '',
    data.pages || '', data.doi || '', data.abstract || '',
    JSON.stringify(data.keywords || []), data.ref_type || 'journal', data.pdf_filename || ''
  );
  return getRefById(r.lastInsertRowid);
}

function updateRef(id, data) {
  const fields = [];
  const values = [];
  for (const key of ['folder_id', 'title', 'journal', 'year', 'volume', 'issue', 'pages', 'doi', 'abstract', 'ref_type', 'pdf_filename']) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]); }
  }
  if (data.authors !== undefined) { fields.push('authors = ?'); values.push(JSON.stringify(data.authors)); }
  if (data.keywords !== undefined) { fields.push('keywords = ?'); values.push(JSON.stringify(data.keywords)); }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE refs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function deleteRef(id) {
  // 删除关联 PDF
  const ref = getRefById(id);
  if (ref && ref.pdf_filename) {
    const libPath = getLibraryPath();
    if (libPath) {
      const pdfPath = path.join(libPath, 'pdfs', ref.pdf_filename);
      if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
    }
  }
  db.prepare('DELETE FROM refs WHERE id = ?').run(id);
}

function searchRefs(query) {
  const q = `%${query}%`;
  return db.prepare('SELECT * FROM refs WHERE title LIKE ? OR authors LIKE ? OR journal LIKE ? OR doi LIKE ? ORDER BY id DESC')
    .all(q, q, q, q);
}

// === 批量导入 ===
function batchInsertRefs(items, folderId) {
  const insert = db.prepare(`INSERT INTO refs (folder_id, title, authors, journal, year, volume, issue, pages, doi, abstract, keywords, ref_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction((rows) => {
    for (const r of rows) {
      insert.run(folderId || null, r.title || '', JSON.stringify(r.authors || []),
        r.journal || '', r.year || null, r.volume || '', r.issue || '',
        r.pages || '', r.doi || '', r.abstract || '',
        JSON.stringify(r.keywords || []), r.ref_type || 'journal');
    }
  });
  tx(items);
  return items.length;
}

// === PDF 管理 ===
function generatePdfFilename(ref) {
  const author = (ref.authors && ref.authors[0]) || 'Unknown';
  const year = ref.year || 'NoYear';
  const title = (ref.title || 'Untitled').substring(0, 50).replace(/[\\/:*?"<>|]/g, '_');
  return `${author}_${year}_${title}.pdf`;
}

function importPdf(refId, sourcePath) {
  const libPath = getLibraryPath();
  if (!libPath) throw new Error('请先设置文献库路径');
  const pdfDir = path.join(libPath, 'pdfs');
  if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

  const ref = getRefById(refId);
  if (!ref) throw new Error('题录不存在');

  const filename = generatePdfFilename({ ...ref, authors: JSON.parse(ref.authors || '[]') });
  const destPath = path.join(pdfDir, filename);
  fs.copyFileSync(sourcePath, destPath);
  db.prepare('UPDATE refs SET pdf_filename = ? WHERE id = ?').run(filename, refId);
  return filename;
}

// === PDF 自动识别 ===
async function extractPdfMetadata(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const data = await pdfParse(buf);
  const text = data.text || '';
  const info = data.info || {};

  // 1. 从 PDF 内嵌 metadata 提取
  let title = info.Title || '';
  let authors = info.Author ? [info.Author] : [];

  // 2. 从正文提取 DOI
  const doiMatch = text.match(/\b(10\.\d{4,}\/[a-zA-Z0-9.\-_/()]+)/);
  const doi = doiMatch ? doiMatch[1].replace(/[.,;)\]]+$/, '') : '';

  return { title, authors, doi, text: text.substring(0, 3000) };
}

async function lookupCrossRef(doi) {
  if (!doi) return null;
  try {
    const https = require('https');
    const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
    const json = await new Promise((resolve, reject) => {
      https.get(url, { headers: { 'User-Agent': 'SciTools/1.0' } }, (res) => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => resolve(d));
      }).on('error', reject);
    });
    const msg = JSON.parse(json).message;
    if (!msg) return null;
    return {
      title: (msg.title && msg.title[0]) || '',
      authors: (msg.author || []).map(a => [a.family, a.given].filter(Boolean).join(', ')),
      journal: (msg['container-title'] && msg['container-title'][0]) || '',
      year: msg.published?.['date-parts']?.[0]?.[0] || null,
      volume: msg.volume || '',
      issue: msg.issue || '',
      pages: msg.page || '',
      doi: doi,
      abstract: (msg.abstract || '').replace(/<[^>]+>/g, ''),
      keywords: msg.subject || [],
      ref_type: 'journal'
    };
  } catch { return null; }
}

// === 笔记 ===
function getNotes(refId) {
  return db.prepare('SELECT * FROM notes WHERE ref_id = ? ORDER BY id DESC').all(refId);
}

function getNote(id) {
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

function createNote(refId, content = '') {
  const r = db.prepare('INSERT INTO notes (ref_id, content) VALUES (?, ?)').run(refId, content);
  return getNote(r.lastInsertRowid);
}

function updateNote(id, content) {
  db.prepare("UPDATE notes SET content = ?, updated_at = datetime('now') WHERE id = ?").run(content, id);
}

function deleteNote(id) {
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
}

// === 格式导出 ===
function formatGBT7714(ref) {
  const a = JSON.parse(ref.authors || '[]');
  const authorStr = a.length > 3 ? a.slice(0, 3).join(', ') + ', 等' : a.join(', ');
  const parts = [authorStr + '.', ref.title + '[J].', ref.journal + ','];
  if (ref.year) parts.push(ref.year + ',');
  if (ref.volume) parts.push(ref.volume);
  if (ref.issue) parts[parts.length - 1] += '(' + ref.issue + ')';
  if (ref.pages) parts.push(':' + ref.pages + '.');
  if (ref.doi) parts.push('DOI:' + ref.doi + '.');
  return parts.join(' ').replace(/\s+/g, ' ');
}

function formatAPA(ref) {
  const a = JSON.parse(ref.authors || '[]');
  const authorStr = a.length > 7 ? a.slice(0, 6).join(', ') + ', ... ' + a[a.length - 1] : a.join(', ');
  let s = authorStr;
  if (ref.year) s += ` (${ref.year}).`;
  else s += ' (n.d.).';
  s += ` ${ref.title}.`;
  if (ref.journal) s += ` *${ref.journal}*`;
  if (ref.volume) s += `, *${ref.volume}*`;
  if (ref.issue) s += `(${ref.issue})`;
  if (ref.pages) s += `, ${ref.pages}`;
  s += '.';
  if (ref.doi) s += ` https://doi.org/${ref.doi}`;
  return s;
}

function formatBibTeX(ref) {
  const a = JSON.parse(ref.authors || '[]');
  const key = (a[0] || 'unknown').replace(/\s/g, '') + (ref.year || '');
  const lines = [`@article{${key},`];
  lines.push(`  title = {${ref.title}},`);
  if (a.length) lines.push(`  author = {${a.join(' and ')}},`);
  if (ref.journal) lines.push(`  journal = {${ref.journal}},`);
  if (ref.year) lines.push(`  year = {${ref.year}},`);
  if (ref.volume) lines.push(`  volume = {${ref.volume}},`);
  if (ref.issue) lines.push(`  number = {${ref.issue}},`);
  if (ref.pages) lines.push(`  pages = {${ref.pages}},`);
  if (ref.doi) lines.push(`  doi = {${ref.doi}},`);
  lines.push('}');
  return lines.join('\n');
}

function formatRISExport(ref) {
  const a = JSON.parse(ref.authors || '[]');
  const lines = ['TY  - JOUR'];
  lines.push(`TI  - ${ref.title}`);
  a.forEach(au => lines.push(`AU  - ${au}`));
  if (ref.journal) lines.push(`JO  - ${ref.journal}`);
  if (ref.year) lines.push(`PY  - ${ref.year}`);
  if (ref.volume) lines.push(`VL  - ${ref.volume}`);
  if (ref.issue) lines.push(`IS  - ${ref.issue}`);
  if (ref.pages) { const [sp, ep] = ref.pages.split('-'); lines.push(`SP  - ${sp}`); if (ep) lines.push(`EP  - ${ep}`); }
  if (ref.doi) lines.push(`DO  - ${ref.doi}`);
  if (ref.abstract) lines.push(`AB  - ${ref.abstract}`);
  lines.push('ER  - ');
  return lines.join('\n');
}

function exportRefs(refIds, format) {
  const refsData = refIds.map(id => getRefById(id)).filter(Boolean);
  const fn = { gbt7714: formatGBT7714, apa: formatAPA, bibtex: formatBibTeX, ris: formatRISExport }[format];
  if (!fn) throw new Error('不支持的格式: ' + format);
  return refsData.map(fn).join('\n\n');
}

module.exports = {
  getSetting, setSetting, getLibraryPath,
  getFolders, createFolder, renameFolder, deleteFolder,
  getRefs, getRefById, createRef, updateRef, deleteRef, searchRefs,
  batchInsertRefs, generatePdfFilename, importPdf,
  extractPdfMetadata, lookupCrossRef,
  getNotes, getNote, createNote, updateNote, deleteNote,
  exportRefs
};
