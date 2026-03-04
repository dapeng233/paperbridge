const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

// 检测是否在 Electron 打包环境中
const isPackaged = process.env.ELECTRON_RUN_AS_NODE === '1' || process.defaultApp === false;
const dataDir = isPackaged
  ? path.join(process.cwd(), 'data')  // 打包后使用应用目录下的 data
  : path.join(__dirname, '../../data'); // 开发环境使用相对路径

module.exports = {
  port: process.env.PORT || 3001,
  accessPassword: process.env.ACCESS_PASSWORD || '',
  jwtSecret: process.env.JWT_SECRET || 'scitools-jwt-secret-change-me',
  dmxapiBaseUrl: process.env.DMXAPI_BASE_URL || 'https://www.dmxapi.cn',
  ownerApiKey: process.env.OWNER_API_KEY || '',
  adminKey: process.env.ADMIN_KEY || '',
  dataDir: dataDir,
  imagesDir: path.join(dataDir, 'images'),
  maxHistoryRecords: 100,
  upload: {
    maxFileSize: 50 * 1024 * 1024 // 50MB
  },
  timeout: {
    textToImage: 120000,
    imageToImage: 300000,
    translation: 15000
  },
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.qq.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE !== 'false',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || ''
  },
  payment: {
    appId: process.env.PAY_APP_ID || '',
    appSecret: process.env.PAY_APP_SECRET || '',
    notifyUrl: process.env.PAY_NOTIFY_URL || '',
    apiUrl: process.env.PAY_API_URL || 'https://api.xunhupay.com/payment/do.html'
  }
};
