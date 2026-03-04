# PaperBridge

**连接 EndNote 与 AI 的桥梁** — 科研文献管理与 AI 辅助桌面应用。

A bridge between EndNote and AI — desktop app for scientific literature management and AI-assisted research.

---

## 为什么选择 PaperBridge？

### 与 EndNote 无缝衔接
- **一键导入导出** — 无缝对接 EndNote 题录及对应 PDF，告别繁琐的手动操作
- **AI 智能生成题录** — 不用再去逐篇下载专业题录文件，只需提供格式和关键信息，AI 即可一键生成可直接导入 EndNote 使用的标准题录
- **流畅连接 EndNote 与 AI** — 致力于让 AI 能力真正融入你的文献管理工作流

### 更流畅的 Nano Banana 使用体验
- **Nano Banana 🍌 深度集成** — 提供比网页端更流畅、更高效的 AI 生图体验
- **双通道接入** — Gemini 兼容接口（如 DMX API） / Google AI 直连

---

## 功能

### 文献管理
- **文献库** — 文件夹分类管理参考文献
- **PDF 导入** — 单篇/批量导入 PDF，自动通过 CrossRef 提取元数据
- **引用格式化** — 内置 GB/T 7714、APA 等多种引用样式
- **AI 笔记总结** — 通过 OpenAI 兼容接口自动生成文献摘要
- **AI 题录识别** — 从论文参考文献列表中智能识别并生成结构化题录

### AI 生图
- **文生图** — 输入文字描述，AI 生成科研插图（支持中文，自动翻译）
- **图生图** — 上传图片 + 文字指令，AI 编辑修改
- **画板编辑** — 内置画板，对生成图片进行标注和编辑
- **多模型支持** — 支持 Gemini 系列模型

### 其他
- **API 配置** — 灵活配置 API Key 和代理地址
- **深色模式** — 支持深色/浅色主题切换
- **字体调节** — 全局 UI 字体大小可调

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Vue Router + Pinia |
| 后端 | Express + better-sqlite3 |
| 桌面 | Electron |
| AI 生图 | Google Gemini API / Gemini 兼容接口 |
| AI 文本 | OpenAI 兼容接口（DeepSeek、通义千问等） |
| 文献 | CrossRef API + PDF 解析 |

---

## 快速开始

### 安装

```bash
git clone https://github.com/dapeng233/paperbridge.git
cd paperbridge
npm install
```

### 开发模式

```bash
# Web 模式（前端 + 后端）
npm run dev

# Electron 桌面模式
npm run electron:dev
```

### 构建

```bash
# 构建桌面应用
npm run electron:build
```

---

## 配置

在应用内的「API 配置」页面设置：

- **Gemini 兼容接口** — 填入 API 密钥和 Base URL（如 dmxapi.cn）
- **Google AI** — 填入 Google AI Studio API Key + 代理地址（国内必填）
- **文本模型** — 填入 OpenAI 兼容接口的 API Key 和 Base URL

---

## 项目结构

```
paperbridge/
├── electron/          # Electron 主进程
├── server/            # Express 后端
│   ├── routes/        # API 路由
│   ├── services/      # 业务逻辑
│   └── config.js      # 配置
├── src/               # Vue 3 前端
│   ├── pages/         # 页面组件
│   ├── components/    # 通用组件
│   ├── stores/        # Pinia 状态管理
│   └── utils/         # 工具函数
├── index.html
├── vite.config.js
└── package.json
```

---

## License

MIT
