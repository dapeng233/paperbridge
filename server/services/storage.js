const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('./database');

// 确保目录存在
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// 保存历史记录到 SQLite
function saveHistory(record, userId) {
  db.prepare(
    `INSERT INTO history (user_id, mode, prompt, translated_prompt, model, size, image_filename, cost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId || 1,
    record.mode || 'text2img',
    record.prompt || '',
    record.translatedPrompt || '',
    record.model || '',
    record.size || '',
    record.imageFile || '',
    record.cost?.totalCost || 0
  );
}

// 保存图片文件，返回文件名
function saveImageFile(base64Data, mimeType) {
  ensureDir(config.imagesDir);
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  fs.writeFileSync(path.join(config.imagesDir, filename), Buffer.from(base64Data, 'base64'));
  return filename;
}

module.exports = { ensureDir, saveHistory, saveImageFile };
