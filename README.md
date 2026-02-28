# SciTools - 科研工具箱

AI 驱动的科研辅助桌面应用，集成 AI 作图、文献管理、引用格式化、Word 插件等功能。

An AI-powered scientific research toolkit — integrating AI image generation, literature management, citation formatting, and Word Add-in.

---

## 功能 / Features

### AI 作图 / AI Image Generation
- **文生图** — 输入文字描述，AI 生成科研插图（支持中文，自动翻译）
- **图生图** — 上传图片 + 文字指令，AI 编辑修改
- **画板编辑** — 内置画板，对生成图片进行标注和编辑
- **多模型支持** — Gemini 2.5 Flash / Gemini 3 Pro 等

### 文献管理 / Literature Management
- **文献库** — 文件夹分类管理参考文献
- **PDF 导入** — 单篇/批量导入 PDF，自动通过 CrossRef 提取元数据
- **引用格式化** — 内置多种引用样式，支持自定义样式
- **AI 匹配** — 从文本中智能识别并匹配参考文献
- **Word 插件** — 通过 Word Add-in 在文档中直接插入引用

### 双模式 / Dual Mode
- 💰 **余额模式** — 通过 dmxapi 代理调用，按 token 计费
- 🔑 **Google API** — 使用自己的 API Key，免费调用

### 其他 / Others
- **用户系统** — 邮箱注册登录，JWT 鉴权
- **钱包系统** — 余额充值、扣费记录、充值码
- **API 配置** — 灵活配置 API Key 和代理地址
- **管理后台** — 用户管理、充值码生成

---

## 技术栈 / Tech Stack

| 层级 | 技术 |
|------|------|
| 前端 | Vue 3 + Vite + Vue Router + Pinia |
| 后端 | Express + better-sqlite3 + JWT |
| 桌面 | Electron |
| AI | Google Gemini API / dmxapi |
| 文献 | CrossRef API + PDF 解析 |

---

## 快速开始 / Quick Start

```bash
git clone https://github.com/dapeng233/scitools.git
cd scitools
npm install
cp .env.example .env   # 编辑 .env 填入配置
npm run dev             # Web 模式
npm run electron:dev    # 桌面模式
```

构建桌面应用：

```bash
npm run electron:build
```

---

## License

MIT
