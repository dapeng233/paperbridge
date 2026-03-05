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
    return db.prepare('SELECT * FROM refs WHERE folder_id = ? AND (trashed IS NULL OR trashed = 0) ORDER BY id DESC').all(folderId);
  }
  return db.prepare('SELECT * FROM refs WHERE trashed IS NULL OR trashed = 0 ORDER BY id DESC').all();
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
  for (const key of ['folder_id', 'title', 'journal', 'year', 'volume', 'issue', 'pages', 'doi', 'abstract', 'ref_type', 'pdf_filename', 'research_note', 'note_title']) {
    if (data[key] !== undefined) { fields.push(`${key} = ?`); values.push(data[key]); }
  }
  if (data.authors !== undefined) { fields.push('authors = ?'); values.push(JSON.stringify(data.authors)); }
  if (data.keywords !== undefined) { fields.push('keywords = ?'); values.push(JSON.stringify(data.keywords)); }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now')");
  values.push(id);
  db.prepare(`UPDATE refs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

// 软删除（移入回收站）
function trashRef(id) {
  db.prepare('UPDATE refs SET trashed = 1 WHERE id = ?').run(id);
}

// 从回收站恢复
function restoreRef(id) {
  db.prepare('UPDATE refs SET trashed = 0 WHERE id = ?').run(id);
}

// 获取回收站列表
function getTrashedRefs() {
  return db.prepare('SELECT * FROM refs WHERE trashed = 1 ORDER BY id DESC').all();
}

// 永久删除
function deleteRef(id) {
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
  return db.prepare('SELECT * FROM refs WHERE (trashed IS NULL OR trashed = 0) AND (title LIKE ? OR authors LIKE ? OR journal LIKE ? OR doi LIKE ?) ORDER BY id DESC')
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
  let author = 'Unknown';
  if (ref.authors && ref.authors.length > 0) {
    const firstAuthor = ref.authors[0];
    const parts = firstAuthor.trim().split(/\s+/);
    author = parts[parts.length - 1];
  }
  const year = ref.year || 'NoYear';
  const title = (ref.title || 'Untitled').substring(0, 40);

  // 安全过滤：移除所有非法字符和路径遍历序列
  const sanitize = (str) => str
    .replace(/\.\./g, '')  // 移除 ..
    .replace(/[\\/:*?"<>|]/g, '_')  // 移除文件系统非法字符
    .replace(/^\.+/, '');  // 移除开头的点（防止隐藏文件）

  const filename = `${sanitize(author)}_${sanitize(year)}_${sanitize(title)}.pdf`;
  return filename.length > 100 ? filename.substring(0, 96) + '.pdf' : filename;
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

// 批量查询哪些题录有非空笔记
function getRefsWithNotes() {
  const rows = db.prepare(`
    SELECT DISTINCT ref_id FROM notes
    WHERE content IS NOT NULL AND content != '' AND content != '<p></p>'
  `).all();
  return rows.map(r => r.ref_id);
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

// === EndNote XML 导出 ===
function s(text) {
  const t = String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<style face="normal" font="default" size="100%">${t}</style>`;
}

function formatEndNoteXML(refsData) {
  const records = refsData.map(ref => {
    const a = JSON.parse(ref.authors || '[]');
    const kw = JSON.parse(ref.keywords || '[]');
    const notes = getNotes(ref.id);
    const notesText = notes.map(n => (n.content || '').replace(/<[^>]+>/g, '')).filter(Boolean).join('\n\n');
    const libPath = getLibraryPath();
    let pdfPath = '';
    if (ref.pdf_filename && libPath) {
      const full = path.join(libPath, 'pdfs', ref.pdf_filename);
      if (fs.existsSync(full)) pdfPath = 'file:///' + full.replace(/\\/g, '/');
    }

    let xml = '    <record>\n';
    xml += `      <ref-type name="Journal Article">17</ref-type>\n`;
    if (a.length) {
      xml += '      <contributors><authors>\n';
      a.forEach(au => { xml += `        <author>${s(au)}</author>\n`; });
      xml += '      </authors></contributors>\n';
    }
    xml += `      <titles>\n        <title>${s(ref.title)}</title>\n`;
    if (ref.journal) xml += `        <secondary-title>${s(ref.journal)}</secondary-title>\n`;
    xml += '      </titles>\n';
    if (ref.journal) xml += `      <periodical><full-title>${s(ref.journal)}</full-title></periodical>\n`;
    if (ref.year) xml += `      <dates><year>${s(ref.year)}</year></dates>\n`;
    if (ref.volume) xml += `      <volume>${s(ref.volume)}</volume>\n`;
    if (ref.issue) xml += `      <number>${s(ref.issue)}</number>\n`;
    if (ref.pages) xml += `      <pages>${s(ref.pages)}</pages>\n`;
    if (ref.doi) xml += `      <electronic-resource-num>${s(ref.doi)}</electronic-resource-num>\n`;
    if (ref.abstract) xml += `      <abstract>${s(ref.abstract)}</abstract>\n`;
    if (kw.length) {
      xml += '      <keywords>\n';
      kw.forEach(k => { xml += `        <keyword>${s(k)}</keyword>\n`; });
      xml += '      </keywords>\n';
    }
    if (notesText) xml += `      <notes>${s(notesText)}</notes>\n`;
    if (ref.research_note) xml += `      <research-notes>${s(ref.research_note)}</research-notes>\n`;
    if (pdfPath || ref.doi) {
      xml += '      <urls>\n';
      if (pdfPath) xml += `        <pdf-urls><url>${pdfPath}</url></pdf-urls>\n`;
      if (ref.doi) xml += `        <related-urls><url>https://doi.org/${ref.doi}</url></related-urls>\n`;
      xml += '      </urls>\n';
    }
    xml += '    </record>';
    return xml;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>\n<xml>\n  <records>\n${records.join('\n\n')}\n  </records>\n</xml>`;
}

function exportRefs(refIds, format) {
  const refsData = refIds.map(id => getRefById(id)).filter(Boolean);
  if (format === 'endnote-xml') return formatEndNoteXML(refsData);
  const fn = { gbt7714: formatGBT7714, apa: formatAPA, bibtex: formatBibTeX, ris: formatRISExport }[format];
  if (!fn) throw new Error('不支持的格式: ' + format);
  return refsData.map(fn).join('\n\n');
}

// === EndNote XML 完整解析（含 PDF 路径、笔记） ===
function parseEndNoteXMLFull(xmlText) {
  const { XMLParser } = require('fast-xml-parser');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => ['record', 'author', 'keyword', 'url'].includes(name),
    removeNSPrefix: true
  });
  const parsed = parser.parse(xmlText);

  // 定位 records 数组
  const root = parsed.xml || parsed.XML || parsed;
  const recordsContainer = root.records || root.Records || root;
  let records = recordsContainer.record || recordsContainer.Record || [];
  if (!Array.isArray(records)) records = [records];

  return records.filter(Boolean).map(rec => {
    // 辅助函数：提取文本（处理 style 嵌套）
    function getText(obj) {
      if (!obj) return '';
      if (typeof obj === 'string' || typeof obj === 'number') return String(obj).trim();
      if (obj['#text']) return String(obj['#text']).trim();
      if (obj.style) return getText(obj.style);
      if (Array.isArray(obj)) return obj.map(getText).filter(Boolean).join(', ');
      return '';
    }

    function getArray(obj) {
      if (!obj) return [];
      if (!Array.isArray(obj)) obj = [obj];
      return obj.map(getText).filter(Boolean);
    }

    // 标题
    const titles = rec.titles || {};
    const title = getText(titles.title) || getText(rec.title) || '';
    const secondaryTitle = getText(titles['secondary-title']) || '';

    // 作者
    const contributors = rec.contributors || {};
    const authorsObj = contributors.authors || rec.authors || {};
    const authors = getArray(authorsObj.author || authorsObj);

    // 期刊
    const periodical = rec.periodical || {};
    const journal = getText(periodical['full-title']) || getText(periodical['abbr-1']) || secondaryTitle || '';

    // 日期
    const dates = rec.dates || {};
    const year = parseInt(getText(dates.year) || getText(rec.year)) || null;

    // 其他字段
    const volume = getText(rec.volume) || '';
    const issue = getText(rec.number) || '';
    const pages = getText(rec.pages) || '';
    const doi = getText(rec['electronic-resource-num']) || '';
    const abstract = getText(rec.abstract) || '';

    // 关键词
    const kwObj = rec.keywords || {};
    const keywords = getArray(kwObj.keyword || []);

    // ref-type
    const refTypeObj = rec['ref-type'] || {};
    const refTypeName = (refTypeObj['@_name'] || getText(refTypeObj) || '').toLowerCase();
    let ref_type = 'journal';
    if (refTypeName.includes('book section') || refTypeName.includes('chapter')) ref_type = 'book_section';
    else if (refTypeName.includes('book')) ref_type = 'book';
    else if (refTypeName.includes('conference') || refTypeName.includes('proceeding')) ref_type = 'conference';
    else if (refTypeName.includes('thesis') || refTypeName.includes('dissertation')) ref_type = 'thesis';
    else if (refTypeName.includes('report')) ref_type = 'report';
    else if (refTypeName.includes('web') || refTypeName.includes('electronic')) ref_type = 'web';

    // PDF URL 提取
    const urls = rec.urls || {};
    const pdfUrlsObj = urls['pdf-urls'] || {};
    const pdfUrls = getArray(pdfUrlsObj.url || []);
    // 也检查 file-attachments
    const relatedUrls = urls['related-urls'] || {};
    const fileUrls = getArray(relatedUrls.url || []);
    const allPdfUrls = [...pdfUrls, ...fileUrls.filter(u => u.toLowerCase().includes('.pdf'))];

    // 笔记
    const notes = getText(rec.notes) || '';
    const researchNotes = getText(rec['research-notes']) || '';

    return {
      title, authors, journal, year, volume, issue, pages,
      doi, abstract, keywords, ref_type,
      pdf_urls: allPdfUrls,
      notes, research_notes: researchNotes
    };
  });
}

module.exports = {
  getSetting, setSetting, getLibraryPath,
  getFolders, createFolder, renameFolder, deleteFolder,
  getRefs, getRefById, createRef, updateRef, trashRef, restoreRef, getTrashedRefs, deleteRef, searchRefs,
  batchInsertRefs, generatePdfFilename, importPdf,
  extractPdfMetadata, lookupCrossRef,
  getNotes, getNote, createNote, updateNote, deleteNote, getRefsWithNotes,
  exportRefs, formatEndNoteXML, parseEndNoteXMLFull
};
