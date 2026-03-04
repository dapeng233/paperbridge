const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const dmxapi = require('../services/dmxapi');
const googleApi = require('../services/google-api');
const wallet = require('../services/wallet');
const config = require('../config');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxFileSize }
});

// 决定使用哪个 API Key 和服务
function resolveApiConfig(body) {
  const provider = body.provider || 'wallet';

  if (provider === 'google') {
    if (!body.googleApiKey) throw new Error('请输入 Google API 密钥');
    return { provider: 'google', apiKey: body.googleApiKey, useWallet: false, proxyUrl: body.proxyUrl || '' };
  }

  if (provider === 'dmxapi_key') {
    if (!body.apiKey) throw new Error('请输入 Gemini 兼容接口密钥');
    return { provider: 'dmxapi', apiKey: body.apiKey, useWallet: false, baseUrl: body.baseUrl || '' };
  }

  // 默认余额模式（走 dmxapi + 站长 key）
  if (!config.ownerApiKey) throw new Error('站长未配置 API Key，暂不支持余额模式');
  return { provider: 'dmxapi', apiKey: config.ownerApiKey, useWallet: true };
}

// 模型列表（根据 provider 返回不同模型）
router.get('/models', (req, res) => {
  const provider = req.query.provider || 'wallet';
  if (provider === 'google') {
    res.json(googleApi.GOOGLE_MODELS);
  } else {
    res.json(dmxapi.MODELS);
  }
});

// 文生图
router.post('/text-to-image', async (req, res) => {
  try {
    const { prompt, model } = req.body;
    if (!prompt || !model) return res.status(400).json({ error: '缺少必要参数' });

    const { provider, apiKey, useWallet, proxyUrl, baseUrl } = resolveApiConfig(req.body);

    // 余额模式：先检查余额
    if (useWallet) {
      const bal = wallet.getBalance(req.userId);
      if (bal.balance < 0.35) {
        return res.status(402).json({ error: `余额不足，当前 ￥${bal.balance}，至少需要 ￥0.35` });
      }
    }

    const service = provider === 'google' ? googleApi : dmxapi;
    const result = provider === 'google'
      ? await service.textToImage(prompt, model, apiKey, req.userId, proxyUrl)
      : await service.textToImage(prompt, model, apiKey, req.userId, baseUrl);

    // 余额模式：扣费
    let walletInfo = null;
    if (useWallet) {
      const charge = result.cost?.totalCost || 0.35;
      const deductResult = wallet.deduct(req.userId, charge, `文生图: ${prompt.substring(0, 30)}`);
      walletInfo = { charged: deductResult.charge, balance: deductResult.balance };
    }

    res.json({ ...result, walletInfo });
  } catch (error) {
    try {
      const logFile = path.join(__dirname, '../../data/error.log');
      const respData = error.response?.data ? JSON.stringify(error.response.data).substring(0, 1000) : 'N/A';
      const logMsg = `[${new Date().toISOString()}] 文生图错误\nmessage: ${error.message}\nstack: ${error.stack}\nresponse status: ${error.response?.status || 'N/A'}\nresponse data: ${respData}\n\n`;
      fs.appendFileSync(logFile, logMsg);
    } catch (e) { /* ignore */ }
    console.error('文生图错误:', error.message);
    const msg = error.response?.data?.error?.message || error.message;
    res.status(500).json({ error: '生成失败: ' + msg });
  }
});

// 图生图
router.post('/image-to-image', upload.single('image'), async (req, res) => {
  try {
    const { prompt, model } = req.body;
    const imageBuffer = req.file?.buffer;
    if (!prompt || !model || !imageBuffer) {
      return res.status(400).json({ error: '缺少必要参数或图片' });
    }

    const { provider, apiKey, useWallet, proxyUrl, baseUrl } = resolveApiConfig(req.body);

    if (useWallet) {
      const bal = wallet.getBalance(req.userId);
      if (bal.balance < 0.35) {
        return res.status(402).json({ error: `余额不足，当前 ￥${bal.balance}，至少需要 ￥0.35` });
      }
    }

    const mimeType = req.file.mimetype || 'image/png';
    const service = provider === 'google' ? googleApi : dmxapi;
    const result = provider === 'google'
      ? await service.imageToImage(prompt, model, apiKey, imageBuffer, mimeType, req.userId, proxyUrl)
      : await service.imageToImage(prompt, model, apiKey, imageBuffer, mimeType, req.userId, baseUrl);

    let walletInfo = null;
    if (useWallet) {
      const charge = result.cost?.totalCost || 0.35;
      const deductResult = wallet.deduct(req.userId, charge, `图生图: ${prompt.substring(0, 30)}`);
      walletInfo = { charged: deductResult.charge, balance: deductResult.balance };
    }

    res.json({ ...result, walletInfo });
  } catch (error) {
    console.error('图生图错误:', error.message);
    if (error.code === 'ECONNABORTED') {
      return res.status(504).json({ error: '请求超时（5分钟），请稍后重试' });
    }
    const msg = error.response?.data?.error?.message || error.message;
    res.status(500).json({ error: '生成失败: ' + msg });
  }
});

module.exports = router;
