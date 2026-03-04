# SciTools 项目架构

> 更新时间: 2026-03-03

## 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SciTools 主程序 (Electron)                          │
│  electron/main.js                                                           │
│  ├─ BrowserWindow (1280×800)                                                │
│  ├─ 开发模式 → 加载 http://localhost:5173 (Vite)                            │
│  ├─ 生产模式 → 子进程启动 Express，加载 http://localhost:3001               │
│  └─ IPC 通信                                                                │
│      ├─ select-directory  选择目录                                          │
│      ├─ select-file       选择文件                                          │
│      ├─ show-in-folder    在文件管理器中显示                                │
│      └─ copy-file         复制文件                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Vue 3 前端 (Vite + Pinia)                          │
│  src/                                                                       │
│  ├─ /literature      ★ 文献助手 (主要功能)                                  │
│  │   ├─ 题录管理（CRUD、搜索、导入导出）                                    │
│  │   ├─ 我的文库（库/子库树形结构）                                          │
│  │   ├─ 回收站（软删除/恢复/永久删除）                                       │
│  │   ├─ 笔记面板 (Tiptap 富文本)                                            │
│  │   ├─ AI 总结（自定义提示词，支持变量替换）                                │
│  │   ├─ 引用样式面板（预设 + AI 生成）                                       │
│  │   ├─ Endnote 风格列宽拖拽（拖宽左列时右列等量缩小）                       │
│  │   ├─ Insert 按钮 → 推送到 Word Add-in                                    │
│  │   └─ PDF 导入（自动识别 DOI → CrossRef 获取元数据）                       │
│  ├─ /image-generator  AI 作图（Tab 导航：AI生图/图片编辑）                    │
│  ├─ /canvas           画布（Tab 导航：AI生图/图片编辑）                        │
│  ├─ /api-config       API 配置（双 Tab：文本模型/生图模型）                    │
│  ├─ /wallet           账户配置（禁用状态）                                   │
│  └─ /admin            管理后台                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Express 后端 (server/index.js)                          │
│  HTTP  http://localhost:3001                                                │
│  HTTPS https://localhost:3443 (Word Add-in 专用，需证书)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  路由结构：                                                                  │
│  /api/auth/*           认证（注册/登录/验证码）                              │
│  /api/literature/*     文献管理 ★ 核心功能                                  │
│  │   ├─ /folders       库/子库 CRUD（支持层级结构）                          │
│  │   ├─ /refs          题录 CRUD + 搜索（排除回收站）                        │
│  │   ├─ /trash         回收站（软删除/恢复/永久删除）                        │
│  │   ├─ /import        批量导入 (RIS/BibTeX/EndNote)                        │
│  │   ├─ /import-pdfs   PDF 导入 + 自动识别                                  │
│  │   ├─ /refs/:id/notes  笔记 CRUD                                          │
│  │   ├─ /refs/:id/ai-summary  AI 总结（支持自定义提示词）                    │
│  │   ├─ /export        导出 (GB/T 7714, APA, BibTeX, RIS, EndNote ZIP)      │
│  │   ├─ /export-zip    导出至 EndNote（含PDF）                              │
│  │   ├─ /ai-match      AI 参考文献识别                                      │
│  │   ├─ /styles/*      引用样式 CRUD                                        │
│  │   ├─ /styles/ai-generate  AI 分析生成样式                                │
│  │   ├─ /cite/format   格式化引用（文内 + 文后）                            │
│  │   ├─ /cite/push     推送到插入队列                                       │
│  │   └─ /addin/*       Word Add-in 专用接口                                 │
│  /api/image/*          AI 作图                                              │
│  /api/history/*        历史记录                                             │
│  /api/wallet/*         钱包                                                 │
│  /api/payment/*        支付 (虎皮椒)                                        │
│  /api/admin/*          管理接口                                             │
│  /addin/*              Word Add-in 静态文件                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  数据存储：better-sqlite3                                                   │
│  ├─ settings           配置项（含 ai_summary_prompt 自定义提示词）          │
│  ├─ folders            库/子库（parent_id 支持层级）                        │
│  ├─ refs               题录（新增 trashed 字段用于回收站）                   │
│  ├─ notes              笔记                                                 │
│  ├─ citation_styles    引用样式                                             │
│  ├─ insert_queue       插入队列（主程序 → Add-in）                          │
│  └─ users, images...   其他业务表                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Word Add-in (Office.js 侧边栏)                           │
│  word-addin/taskpane.html                                                   │
│  连接 https://localhost:3443/api/literature/addin/*                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  功能：                                                                      │
│  ├─ 引用样式选择                                                            │
│  ├─ 题录搜索/多选                                                           │
│  ├─ 插入文内引用 → Word.run() insertText                                    │
│  ├─ 生成参考文献列表 → Word.run() insertParagraph                           │
│  └─ 轮询接收主程序推送 (2秒/次，可开关)                                     │
│      └─ GET /addin/poll → 获取队列中的待插入项                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 核心数据流

### 主程序插入引用到 Word

```
主程序点击 Insert
      │
      ▼
POST /cite/push ─────────────► insert_queue 表
                                    │
                                    │ (轮询 2秒/次)
                                    ▼
                           GET /addin/poll
                                    │
                                    ▼
                           Word Add-in 获取数据
                                    │
                                    ▼
                           Word.run() 插入到文档
```

### 库/子库分类系统

```
我的文库
  ├─ 全部题录              → selectedFolder = '__all__'
  ├─ 未分类题录            → selectedFolder = '__unclassified__'
  ├─ 新建库                → folders 表 parent_id = null
  │   └─ 新建子库          → folders 表 parent_id = 父库ID
  └─ 回收站                → selectedFolder = '__trash__'

题录归类：选中题录 → 归类至下拉 → PUT /refs/:id { folder_id }
```

### 软删除（回收站）流程

```
删除题录
    │
    ▼
DELETE /refs/:id
    │
    ▼
trashRef() → UPDATE refs SET trashed = 1
    │
    ▼
进入回收站视图

恢复/永久删除
    │
    ├─ 恢复    → POST /trash/:id/restore → UPDATE refs SET trashed = 0
    └─ 永久删除 → DELETE /trash/:id → DELETE FROM refs + 删除PDF文件
```

### PDF 导入流程

```
用户选择 PDF 文件
      │
      ▼
POST /import-pdfs
      │
      ├─ pdf-parse 提取文本
      │
      ├─ 正则匹配 DOI
      │
      ├─ CrossRef API 获取元数据
      │
      ├─ 创建题录记录
      │
      └─ 复制 PDF 到文献库
```

## 近期重要改动 (2026-03-03)

### 1. 文献助手 UI 重构
- **术语统一**: "文件夹" → "我的文库/库/子库"
- **回收站**: 新增软删除功能，支持恢复和永久删除
- **列宽拖拽**: EndNote 风格，拖宽左列时右邻列等量缩小
- **编辑列固定**: 操作列始终可见，不随滚动消失

### 2. API 配置页面优化
- **Tab 分组**: 文本处理模型 / 生图模型
- **横排布局**: OpenAI 配置和提示词设置左右并排
- **自定义提示词**: 支持 `${title}/${abstract}/${authors}/${journal}/${year}/${notes}` 变量

### 3. AI 生图与图片编辑导航
- **Tab 导航**: 两个页面顶部都有 "AI 生图 | 图片编辑" 选项卡
- **状态保持**: 切换时不会丢失当前操作状态

### 4. 账户配置
- **禁用状态**: "账户配置" 菜单项灰色不可点，显示 "soon" 标签

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 28 |
| 前端框架 | Vue 3.4 + Vite 5 |
| 状态管理 | Pinia |
| 路由 | Vue Router 4 |
| 富文本编辑 | Tiptap |
| 后端框架 | Express 4 |
| 数据库 | better-sqlite3 |
| Word 集成 | Office.js Add-in |

## 目录结构

```
scitools/
├── electron/           # Electron 主进程
│   └── main.js
├── server/             # Express 后端
│   ├── index.js        # 入口 + 路由挂载
│   ├── routes/         # 路由模块
│   │   ├── auth.js
│   │   ├── literature.js    # ★ 文献管理核心
│   │   ├── image.js
│   │   └── ...
│   └── services/       # 业务逻辑
│       ├── database.js
│       ├── literature.js    # 回收站/AI总结/导出ZIP
│       ├── citation-style.js
│       └── ...
├── src/                # Vue 前端
│   ├── pages/          # 页面组件
│   │   ├── Literature/      # ★ 文献助手
│   │   ├── ImageGenerator/  # AI生图
│   │   ├── Canvas.vue       # 图片编辑
│   │   └── ApiConfig.vue    # API配置
│   ├── components/     # 通用组件
│   ├── stores/         # Pinia stores
│   └── router/         # 路由配置
├── word-addin/         # Word Add-in
│   ├── manifest.xml    # Add-in 清单
│   ├── taskpane.html   # 侧边栏 UI
│   └── icon-*.png      # 图标
├── data/               # 数据目录（运行时生成）
│   ├── scitools.db     # SQLite 数据库
│   └── pdfs/           # PDF 文件存储
└── certs/              # HTTPS 证书（需手动生成）
    ├── localhost.pem
    └── localhost-key.pem
```

## 配置文件

- `.env` — 环境变量（API Key、SMTP 等）
- `word-addin/manifest.xml` — Word Add-in 配置清单

## 待办/后续规划

1. **EndNote 导入增强**: 支持直接导入 .enl 库文件并自动关联 PDF
2. **账户系统**: 账户配置功能开发
3. **AI 功能扩展**: 更多文献分析场景支持
