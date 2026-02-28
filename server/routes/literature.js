const express = require('express');
const lit = require('../services/literature');
const cite = require('../services/citation-style');
const router = express.Router();

// === 设置 ===
router.get('/settings/:key', (req, res) => {
  res.json({ value: lit.getSetting(req.params.key) });
});

router.post('/settings', (req, res) => {
  const { key, value } = req.body;
  lit.setSetting(key, value);
  res.json({ success: true });
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

// === AI 辅助匹配 ===
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
    const { ref_ids, style_id, start_index } = req.body;
    const style = cite.getStyleById(style_id);
    if (!style) return res.status(400).json({ error: '样式不存在' });
    const refs = ref_ids.map(id => lit.getRefById(id)).filter(Boolean);
    if (refs.length === 0) return res.status(400).json({ error: '未找到题录' });
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
