const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { router: authRouter, authMiddleware } = require('./routes/auth');
const imageRouter = require('./routes/image');
const historyRouter = require('./routes/history');
const walletRouter = require('./routes/wallet');
const paymentRouter = require('./routes/payment');
const payment = require('./services/payment');
const storage = require('./services/storage');

const app = express();

// 限流：每个 IP 每分钟最多 150 次请求
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 150,
  message: { error: '请求太频繁，请稍后再试' }
});

// 注册/登录接口更严格限流
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: '操作太频繁，请稍后再试' }
});

// 中间件
app.use(cors());
app.use(limiter);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 静态文件
app.use(express.static(path.join(__dirname, '../dist')));
storage.ensureDir(config.imagesDir);
app.use('/images', express.static(config.imagesDir));

// Word Add-in 静态文件
app.use('/addin', express.static(path.join(__dirname, '../word-addin')));

// 认证路由（不需要鉴权）
app.use('/api/auth', authLimiter, authRouter);

// 支付回调（不需要鉴权，虎皮椒服务器直接调用）
app.post('/api/payment/notify', (req, res) => {
  try {
    const result = payment.handleNotify(req.body);
    res.send(result.success ? 'success' : 'fail');
  } catch (err) {
    console.error('支付回调错误:', err.message);
    res.send('fail');
  }
});

// 管理员接口（只需要 Admin Key，不需要用户登录）
const adminRouter = require('./routes/admin');
app.use('/api/admin', (req, res, next) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== config.adminKey) {
    return res.status(403).json({ error: '无权限' });
  }
  next();
}, adminRouter);

// 文献管理路由（本地功能，不需要鉴权）
const literatureRouter = require('./routes/literature');
app.use('/api/literature', literatureRouter);

// 图片生成路由（API 密钥由前端传入，不需要用户鉴权）
app.use('/api', (req, res, next) => { req.userId = req.userId || 1; next(); });
app.use('/api', imageRouter);

// 历史记录路由（本地功能，不需要鉴权）
app.use('/api/history', historyRouter);

// 需要鉴权的 API 路由（暂时禁用）
// app.use('/api', authMiddleware);
app.use('/api/wallet', walletRouter);
app.use('/api/payment', paymentRouter);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(config.port, () => {
  console.log(`\n✨ PaperBridge 后端已启动`);
  console.log(`📱 http://localhost:${config.port}`);
});

// HTTPS for Word Add-in
const fs = require('fs');
const https = require('https');
const certDir = path.join(__dirname, '../certs');
if (fs.existsSync(path.join(certDir, 'localhost.pem'))) {
  const httpsServer = https.createServer({
    key: fs.readFileSync(path.join(certDir, 'localhost-key.pem')),
    cert: fs.readFileSync(path.join(certDir, 'localhost.pem'))
  }, app);
  httpsServer.listen(3443, () => {
    console.log(`🔒 https://localhost:3443 (Word Add-in)`);
  });
}

console.log(`\n按 Ctrl+C 停止服务\n`);

module.exports = app;
