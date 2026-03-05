const express = require('express');
const lit = require('../services/literature');
const cite = require('../services/citation-style');
const router = express.Router();

// === 设置 ===
router.get('/settings/:key', (req, res) => {
  res.json({ value: lit.getSetting(req.params.key) });
});

router.post('/settings', (req, res) => {
  try {
    const { key, value } = req.body;
    lit.setSetting(key, value);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// === 文件夹 ===
router.get('/folders', (req, res) => {
  res.json(lit.getFolders());
});

router.post('/folders', (req, res) => {
  const { name, parent_id } = req.body;
  res.json(lit.createFolder(name || '新建文件夹', parent_id));
});

router.put('/folders/:id', (req, res) => {
  lit.renameFolder(req.params.id, req.body.name);
  res.json({ success: true });
});

router.delete('/folders/:id', (req, res) => {
  lit.deleteFolder(req.params.id);
  res.json({ success: true });
});

// === 题录 ===
router.get('/refs', (req, res) => {
  const { folder_id, q } = req.query;
  if (q) return res.json(lit.searchRefs(q));
  res.json(lit.getRefs(folder_id));
});

router.get('/refs/:id', (req, res) => {
  const ref = lit.getRefById(req.params.id);
  if (!ref) return res.status(404).json({ error: '未找到' });
  res.json(ref);
});

router.post('/refs', (req, res) => {
  res.json(lit.createRef(req.body));
});

router.put('/refs/:id', (req, res) => {
  lit.updateRef(req.params.id, req.body);
  res.json({ success: true });
});

router.delete('/refs/:id', (req, res) => {
  lit.trashRef(req.params.id);
  res.json({ success: true });
});

// === 回收站 ===
router.get('/trash', (req, res) => {
  res.json(lit.getTrashedRefs());
});

router.post('/trash/:id/restore', (req, res) => {
  lit.restoreRef(req.params.id);
  res.json({ success: true });
});

router.delete('/trash/:id', (req, res) => {
  lit.deleteRef(req.params.id);
  res.json({ success: true });
});

// === 导入 ===
router.post('/import', (req, res) => {
  try {
    const { items, folder_id } = req.body;
    const count = lit.batchInsertRefs(items, folder_id);
    res.json({ success: true, count });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// === PDF ===
router.post('/refs/:id/pdf', (req, res) => {
  try {
    const filename = lit.importPdf(req.params.id, req.body.source_path);
    res.json({ success: true, filename });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/refs/:id/pdf-path', (req, res) => {
  const ref = lit.getRefById(req.params.id);
  if (!ref || !ref.pdf_filename) return res.json({ path: null });
  const libPath = lit.getLibraryPath();
  if (!libPath) return res.json({ path: null });
  const fullPath = require('path').join(libPath, 'pdfs', ref.pdf_filename);
  res.json({ path: require('fs').existsSync(fullPath) ? fullPath : null });
});

// 批量导入 PDF → 自动识别元数据 + 创建题录 + 复制到文献库
router.post('/import-pdfs', async (req, res) => {
  try {
    const { paths, folder_id } = req.body;
    const libPath = lit.getLibraryPath();
    if (!libPath) return res.status(400).json({ error: '请先设置文献库路径' });
    const pdfDir = require('path').join(libPath, 'pdfs');
    if (!require('fs').existsSync(pdfDir)) require('fs').mkdirSync(pdfDir, { recursive: true });

    const results = [];
    for (const p of paths) {
      const basename = require('path').basename(p, '.pdf');
      let title = basename, authors = [], year = null, meta = {};

      // 尝试从 PDF 提取元数据 + DOI → CrossRef
      try {
        const extracted = await lit.extractPdfMetadata(p);
        if (extracted.doi) {
          const cr = await lit.lookupCrossRef(extracted.doi);
          if (cr) meta = cr;
        }
        if (!meta.title && extracted.title) meta.title = extracted.title;
        if (!meta.authors?.length && extracted.authors?.length) meta.authors = extracted.authors;
      } catch (_) { /* 提取失败则用文件名 */ }

      // 合并：CrossRef > PDF metadata > 文件名
      title = meta.title || title;
      authors = meta.authors?.length ? meta.authors : authors;
      year = meta.year || year;

      const ref = lit.createRef({
        folder_id, title, authors, year,
        journal: meta.journal || '', volume: meta.volume || '',
        issue: meta.issue || '', pages: meta.pages || '',
        doi: meta.doi || '', abstract: meta.abstract || '',
        keywords: meta.keywords || [], ref_type: meta.ref_type || 'journal'
      });
      const filename = lit.generatePdfFilename({ authors, year, title });
      const dest = require('path').join(pdfDir, filename);
      require('fs').copyFileSync(p, dest);
      lit.updateRef(ref.id, { pdf_filename: filename });
      results.push({ id: ref.id, title, filename, recognized: !!meta.doi });
    }
    res.json({ success: true, count: results.length, results });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// === 从 EndNote 导入（含 PDF） ===
router.post('/import-endnote', async (req, res) => {
  try {
    const { xml_path, library_folder, folder_id } = req.body;
    if (!xml_path) return res.status(400).json({ error: '请指定 XML 文件路径' });

    const libPath = lit.getLibraryPath();
    if (!libPath) return res.status(400).json({ error: '请先设置文献库路径' });

    const path = require('path');
    const fs = require('fs');
    const pdfDir = path.join(libPath, 'pdfs');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });

    // 读取并解析 EndNote XML
    const xmlText = fs.readFileSync(xml_path, 'utf-8');
    const records = lit.parseEndNoteXMLFull(xmlText);

    // 在用户指定的 EndNote 文献库文件夹里找 .Data/PDF 目录
    // EndNote 约定：library_folder 下有一个同名 .Data 子目录
    let dataPdfDir = null;
    if (library_folder && fs.existsSync(library_folder)) {
      const entries = fs.readdirSync(library_folder, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.endsWith('.Data')) {
          const candidate = path.join(library_folder, entry.name, 'PDF');
          if (fs.existsSync(candidate)) { dataPdfDir = candidate; break; }
        }
      }
      // 也兼容用户直接选了 .Data 目录本身的情况
      if (!dataPdfDir) {
        const direct = path.join(library_folder, 'PDF');
        if (fs.existsSync(direct)) dataPdfDir = direct;
      }
    }

    const results = [];
    let pdfCount = 0;

    for (const rec of records) {
      // 创建题录
      const ref = lit.createRef({
        folder_id: folder_id || null,
        title: rec.title,
        authors: rec.authors,
        journal: rec.journal,
        year: rec.year,
        volume: rec.volume,
        issue: rec.issue,
        pages: rec.pages,
        doi: rec.doi,
        abstract: rec.abstract,
        keywords: rec.keywords,
        ref_type: rec.ref_type || 'journal'
      });

      // 保存笔记
      if (rec.notes) lit.createNote(ref.id, rec.notes);
      if (rec.research_notes) lit.updateRef(ref.id, { research_note: rec.research_notes });

      // 尝试关联 PDF
      let pdfLinked = false;
      const candidatePaths = [];

      // 1. 从 XML 内嵌的 pdf-urls 提取路径（file:// 绝对路径）
      if (rec.pdf_urls && rec.pdf_urls.length) {
        for (const pdfUrl of rec.pdf_urls) {
          let p = pdfUrl;
          if (p.startsWith('file:///')) p = p.slice(8);
          else if (p.startsWith('file://')) p = p.slice(7);
          p = decodeURIComponent(p);
          // Windows：/C:/... → C:/...
          if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(p)) p = p.slice(1);
          candidatePaths.push(p);
        }
      }

      // 2. 用户指定的文献库 .Data/PDF 目录中按标题/作者搜索
      if (dataPdfDir) {
        const found = findPdfInDir(dataPdfDir, rec.title, rec.authors, rec.doi);
        if (found) candidatePaths.push(found);
      }

      // 依次尝试所有候选路径
      for (const cp of candidatePaths) {
        if (pdfLinked) break;
        try {
          if (fs.existsSync(cp)) {
            const filename = lit.generatePdfFilename({ authors: rec.authors, year: rec.year, title: rec.title });
            fs.copyFileSync(cp, path.join(pdfDir, filename));
            lit.updateRef(ref.id, { pdf_filename: filename });
            pdfLinked = true;
            pdfCount++;
          }
        } catch (_) {}
      }

      results.push({ id: ref.id, title: rec.title, pdf: pdfLinked });
    }

    res.json({ success: true, count: records.length, pdfCount, results });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// 在 .Data/PDF 目录中递归查找匹配的 PDF
function findPdfInDir(dir, title, authors, doi) {
  const fs = require('fs');
  const path = require('path');
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = findPdfInDir(fullPath, title, authors, doi);
        if (found) return found;
      } else if (entry.name.toLowerCase().endsWith('.pdf')) {
        // 文件名匹配：包含标题关键词或作者名
        const nameLC = entry.name.toLowerCase();
        const titleWords = (title || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const authorFirst = (authors && authors[0]) ? authors[0].toLowerCase().split(/[,\s]+/)[0] : '';
        const titleMatch = titleWords.length > 0 && titleWords.filter(w => nameLC.includes(w)).length >= Math.min(2, titleWords.length);
        const authorMatch = authorFirst && nameLC.includes(authorFirst);
        if (titleMatch || authorMatch) return fullPath;
      }
    }
  } catch (_) {}
  return null;
}

// 读取本地文件（导入用）
router.get('/read-file', (req, res) => {
  const filePath = req.query.path;
  if (!filePath) return res.status(400).send('missing path');
  try {
    res.send(require('fs').readFileSync(filePath, 'utf-8'));
  } catch (e) {
    res.status(400).send('读取失败: ' + e.message);
  }
});

// === 笔记 ===
// 批量获取有笔记的题录 ID 列表（性能优化）
router.get('/notes/refs-with-notes', (req, res) => {
  res.json(lit.getRefsWithNotes());
});

router.get('/refs/:id/notes', (req, res) => {
  res.json(lit.getNotes(req.params.id));
});

router.post('/refs/:id/notes', (req, res) => {
  res.json(lit.createNote(req.params.id, req.body.content || ''));
});

router.put('/notes/:id', (req, res) => {
  lit.updateNote(req.params.id, req.body.content);
  res.json({ success: true });
});

router.delete('/notes/:id', (req, res) => {
  lit.deleteNote(req.params.id);
  res.json({ success: true });
});

// === 导出 ===
router.post('/export', (req, res) => {
  try {
    const { ref_ids, format } = req.body;
    const text = lit.exportRefs(ref_ids, format);
    res.json({ text });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// === 打包导出 ZIP（EndNote XML + PDFs） ===
router.post('/export-zip', async (req, res) => {
  try {
    const { ref_ids } = req.body;
    if (!ref_ids?.length) return res.status(400).json({ error: '没有选择题录' });

    const archiver = require('archiver');
    const refsData = ref_ids.map(id => lit.getRefById(id)).filter(Boolean);
    const libPath = lit.getLibraryPath();

    // 生成 XML 并收集 PDF
    const xmlContent = lit.exportRefs(ref_ids, 'endnote-xml');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=scitools-export.zip');

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);
    archive.append(xmlContent, { name: 'references.xml' });

    // 添加 PDF 文件
    if (libPath) {
      for (const ref of refsData) {
        if (ref.pdf_filename) {
          const pdfPath = require('path').join(libPath, 'pdfs', ref.pdf_filename);
          if (require('fs').existsSync(pdfPath)) {
            archive.file(pdfPath, { name: 'pdfs/' + ref.pdf_filename });
          }
        }
      }
    }

    await archive.finalize();
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// === AI 辅助匹配 ===

// 测试 AI API 连接
router.post('/ai-test', async (req, res) => {
  try {
    const { api_key, base_url, model } = req.body;
    if (!api_key) return res.status(400).json({ error: '未配置 AI API Key' });
    const url = (base_url || 'https://api.openai.com') + '/v1/chat/completions';
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;

    const payload = JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5
    });

    const json = await new Promise((resolve, reject) => {
      const r = mod.request(parsed, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}` } }, (resp) => {
        let d = '';
        resp.on('data', c => d += c);
        resp.on('end', () => resolve({ status: resp.statusCode, body: d }));
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    if (json.status === 200) {
      res.json({ success: true, message: 'API 连接正常' });
    } else {
      const err = JSON.parse(json.body);
      res.json({ success: false, error: err.error?.message || `HTTP ${json.status}` });
    }
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// AI 两级摘要：Notes 长摘要 + Research Notes 短标签
router.post('/refs/:id/ai-summary', async (req, res) => {
  try {
    const { api_key, base_url, model } = req.body;
    if (!api_key) return res.status(400).json({ error: '请先设置 AI API Key' });
    const ref = lit.getRefById(req.params.id);
    if (!ref) return res.status(404).json({ error: '题录不存在' });

    const notes = lit.getNotes(req.params.id);
    const notesText = notes.map(n => (n.content || '').replace(/<[^>]+>/g, '')).filter(Boolean).join('\n');

    // 解析作者
    let authorsStr = '无';
    try {
      const arr = typeof ref.authors === 'string' ? JSON.parse(ref.authors) : (ref.authors || []);
      authorsStr = arr.join(', ') || '无';
    } catch { authorsStr = ref.authors || '无'; }

    // 尝试读取自定义提示词
    let customPrompt = '';
    try { customPrompt = lit.getSetting('ai_summary_prompt') || ''; } catch {}

    const url = (base_url || 'https://api.openai.com') + '/v1/chat/completions';
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;

    let prompt;
    if (customPrompt) {
      // 使用自定义提示词，替换变量
      prompt = customPrompt
        .replace(/\$\{title\}/g, ref.title || '无')
        .replace(/\$\{abstract\}/g, ref.abstract || '无')
        .replace(/\$\{authors\}/g, authorsStr)
        .replace(/\$\{journal\}/g, ref.journal || '无')
        .replace(/\$\{year\}/g, ref.year || '无')
        .replace(/\$\{notes\}/g, notesText || '无');
    } else {
      // 默认提示词
      prompt = `你是学术文献分析助手。根据以下信息生成两个摘要。

标题：${ref.title || '无'}
作者：${authorsStr}
期刊：${ref.journal || '无'}
年份：${ref.year || '无'}
摘要：${ref.abstract || '无'}
用户笔记：${notesText || '无'}

请返回JSON格式：
{
  "notes_summary": "笔记精华摘要，50-200字，提炼核心发现和关键观点",
  "research_note": "一个极短的标签，概括核心贡献。如果标题是中文则用中文（10字符以内含空格），如果标题是英文则用英文（20字符以内含空格和符号）"
}

只返回JSON，不要其他文字。`;
    }

    const payload = JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0
    });

    const json = await new Promise((resolve, reject) => {
      const r = mod.request(parsed, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}` } }, (resp) => {
        let d = '';
        resp.on('data', c => d += c);
        resp.on('end', () => resolve(d));
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    const result = JSON.parse(json);
    const content = result.choices?.[0]?.message?.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const summary = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    // 保存 research_note 到数据库
    if (summary.research_note) {
      lit.updateRef(req.params.id, { research_note: summary.research_note });
    }

    res.json(summary);
  } catch (e) {
    res.status(500).json({ error: 'AI 总结失败: ' + e.message });
  }
});

router.post('/ai-match', async (req, res) => {
  try {
    const { text, api_key, base_url, model } = req.body;
    if (!api_key) return res.status(400).json({ error: '请先设置 AI API Key' });
    const url = (base_url || 'https://api.openai.com') + '/v1/chat/completions';
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;

    const payload = JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '你是文献识别助手。根据用户提供的文本片段，提取出可能的学术引用信息。返回JSON数组，每项包含 title, authors(数组), journal, year, doi 字段。只返回JSON，不要其他文字。' },
        { role: 'user', content: text }
      ],
      temperature: 0
    });

    const json = await new Promise((resolve, reject) => {
      const r = mod.request(parsed, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}` } }, (resp) => {
        let d = '';
        resp.on('data', c => d += c);
        resp.on('end', () => resolve(d));
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    const result = JSON.parse(json);
    const content = result.choices?.[0]?.message?.content || '[]';
    // 提取 JSON 部分
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    const items = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'AI 匹配失败: ' + e.message });
  }
});

// === 引用样式 ===

// AI 生成样式（放在参数化路由前面）
router.post('/styles/ai-generate', async (req, res) => {
  try {
    const { sample_text, api_key, base_url, model } = req.body;
    if (!api_key) return res.status(400).json({ error: '请先设置 AI API Key' });
    const axios = require('axios');
    const url = (base_url || 'https://api.openai.com') + '/v1/chat/completions';
    const response = await axios.post(url, {
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `你是引用格式分析专家。根据用户提供的引用样本文本，分析出文内引用和文后参考文献的格式规则。
返回JSON，格式：
{
  "name": "样式名称（根据样本推测）",
  "inline_template": "文内引用模板，使用占位符: {authors_short}, {year}, {index}",
  "bibliography_template": "文后引用模板，使用占位符: {authors}, {year}, {title}, {journal}, {volume}, {issue}, {pages}, {doi}, {index}",
  "sort_by": "author 或 order",
  "config": { "authors_sep": "作者分隔符", "authors_short_max": 数字, "et_al": "et al.的写法", "index_based": 是否数字索引 }
}
只返回JSON。` },
        { role: 'user', content: sample_text }
      ],
      temperature: 0
    }, { headers: { 'Authorization': `Bearer ${api_key}`, 'Content-Type': 'application/json' }, timeout: 30000 });

    const content = response.data?.choices?.[0]?.message?.content || '{}';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const styleData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
    res.json(styleData);
  } catch (e) {
    res.status(500).json({ error: 'AI 生成失败: ' + e.message });
  }
});

router.get('/styles', (req, res) => {
  res.json(cite.getStyles());
});

router.get('/styles/:id', (req, res) => {
  const style = cite.getStyleById(req.params.id);
  if (!style) return res.status(404).json({ error: '样式不存在' });
  res.json(style);
});

router.post('/styles', (req, res) => {
  try { res.json(cite.createStyle(req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.put('/styles/:id', (req, res) => {
  try { cite.updateStyle(req.params.id, req.body); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.delete('/styles/:id', (req, res) => {
  try { cite.deleteStyle(req.params.id); res.json({ success: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// === 格式化引用（供主程序和 Add-in 使用） ===
router.post('/cite/format', (req, res) => {
  try {
    const { ref_ids, style_id, start_index, unformatted } = req.body;
    const refs = ref_ids.map(id => lit.getRefById(id)).filter(Boolean);
    if (refs.length === 0) return res.status(400).json({ error: '未找到题录' });
    if (unformatted) {
      return res.json({ inline: cite.formatUnformatted(refs), bibliography: '' });
    }
    const style = cite.getStyleById(style_id);
    if (!style) return res.status(400).json({ error: '样式不存在' });
    const inline = cite.formatInlineCitation(refs, style, start_index || 1);
    const bibliography = cite.formatBibliography(refs, style, start_index || 1);
    res.json({ inline, bibliography });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// === 插入队列（主程序 → Word Add-in） ===
router.post('/cite/push', (req, res) => {
  try {
    const { ref_ids, style_id, type } = req.body;
    const result = cite.pushToQueue(ref_ids, style_id, type || 'inline');
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// === Add-in 专用 API ===
router.get('/addin/poll', (req, res) => {
  const item = cite.pollQueue();
  if (!item) return res.json({ action: null });
  const refIds = JSON.parse(item.ref_ids);
  const style = cite.getStyleById(item.style_id);
  if (!style) return res.json({ action: null });
  const refs = refIds.map(id => lit.getRefById(id)).filter(Boolean);
  const inline = cite.formatInlineCitation(refs, style, 1);
  const bibliography = cite.formatBibliography(refs, style, 1);
  res.json({ action: item.type, inline, bibliography, refIds });
});

router.get('/addin/refs', (req, res) => {
  const { q } = req.query;
  if (q) return res.json(lit.searchRefs(q));
  res.json(lit.getRefs());
});

router.get('/addin/styles', (req, res) => {
  res.json(cite.getStyles());
});

module.exports = router;
