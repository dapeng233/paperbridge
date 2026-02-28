# SciTools 文献管理模块 — 开发方案与可行性分析

> 编写日期：2026-02-28
> 基于现有架构：Vue 3 + Express + better-sqlite3 + Electron

---

## 一、现有架构评估

### 可复用部分
- **SQLite + better-sqlite3**：直接扩展表结构即可支持题录数据库，无需引入新数据库
- **Express 后端**：新增路由模块即可，架构不需要改动
- **Electron 桌面端**：支持多窗口（文献笔记）、系统对话框（选择文献库路径）、文件操作
- **Vue 3 + Pinia**：前端组件化开发，新增页面即可
- **JWT 认证体系**：代码保留但 UI 入口隐藏，文献管理功能走纯本地模式

### 需要新增的依赖
| 依赖 | 用途 | 大小 |
|------|------|------|
| `pdfjs-dist` | PDF 文本提取、渲染预览 | ~2MB |
| `@tiptap/vue-3` + 扩展 | 富文本编辑器（笔记） | ~500KB |
| `fast-xml-parser` | 解析 EndNote XML / RIS 格式 | ~50KB |
| `office-js` | Word Add-in SDK（Phase 4 单独项目） | 按需加载 |

---

## 二、功能模块拆解与开发阶段

### Phase 1 — MVP 核心（题录数据库 + 文件管理）

#### 1.1 数据库设计

```sql
-- 文件夹（树形结构）
CREATE TABLE folders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  parent_id INTEGER DEFAULT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

-- 题录条目
CREATE TABLE references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id INTEGER,
  title TEXT DEFAULT '',
  authors TEXT DEFAULT '',        -- JSON 数组
  journal TEXT DEFAULT '',
  year INTEGER,
  volume TEXT DEFAULT '',
  issue TEXT DEFAULT '',
  pages TEXT DEFAULT '',
  doi TEXT DEFAULT '',
  abstract TEXT DEFAULT '',
  keywords TEXT DEFAULT '',       -- JSON 数组
  ref_type TEXT DEFAULT 'journal', -- journal/book/conference/thesis/web
  pdf_filename TEXT DEFAULT '',   -- 文献库中的 PDF 文件名
  source_file TEXT DEFAULT '',    -- 原始导入文件路径
  custom_fields TEXT DEFAULT '{}', -- JSON 扩展字段
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE INDEX idx_refs_folder ON references(folder_id);
CREATE INDEX idx_refs_doi ON references(doi);
CREATE INDEX idx_refs_title ON references(title);

-- 用户设置
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- 预设: library_path = 用户选择的文献库目录
```

#### 1.2 功能清单

| 功能 | 实现方式 | 复杂度 |
|------|----------|--------|
| 设置文献库路径 | `dialog.showOpenDialog({ properties: ['openDirectory'] })` → 存入 settings 表 | 低 |
| 文件夹树（增删改拖拽） | Vue 递归组件 + parent_id 自引用查询 | 中 |
| 手动新建/编辑题录 | 表单页面，字段对应 references 表 | 低 |
| 导入 EndNote XML | `fast-xml-parser` 解析 → 批量 INSERT | 中 |
| 导入 RIS 格式 | 逐行状态机解析（RIS 是行格式） | 中 |
| PDF 导入 + 备份改名 | 复制到文献库目录，命名为 `作者_年份_标题.pdf` | 低 |
| 复制 PDF 按钮 | `electron.shell.showItemInFolder()` 或复制到剪贴板 | 低 |
| 题录列表（搜索/排序/筛选） | 前端表格组件 + SQLite LIKE 查询 | 中 |

#### 1.3 文件结构规划

```
src/pages/Literature/
├── index.vue              ← 主布局（左侧文件夹树 + 右侧题录列表）
├── FolderTree.vue         ← 文件夹树组件
├── ReferenceList.vue      ← 题录列表
├── ReferenceDetail.vue    ← 题录详情/编辑表单
└── ImportDialog.vue       ← 导入对话框

server/routes/
└── literature.js          ← 文献管理 API

server/services/
└── literature.js          ← 文献业务逻辑（导入解析、文件操作）
```

#### 1.4 Token 消耗预估
- 数据库表 + API 路由：~3K tokens
- 文件夹树组件：~2K tokens
- 题录列表/详情：~3K tokens
- 导入解析器（XML + RIS）：~2K tokens
- **合计约 10K tokens**

---

### Phase 2 — PDF 识别 + 文献笔记

#### 2.1 PDF 信息自动识别

```
用户拖入 PDF → pdfjs 提取前两页文本 → 正则匹配 DOI
  ├── 有 DOI → 调用 CrossRef API（免费）获取完整元数据
  └── 无 DOI → 正则提取标题/作者/年份 → 用户手动确认修正
```

| 技术点 | 说明 |
|--------|------|
| DOI 正则 | `/10\.\d{4,9}\/[-._;()\/:A-Z0-9]+/i` |
| CrossRef API | `https://api.crossref.org/works/{doi}` 免费、无需 key |
| 降级方案 | 识别失败时弹出编辑表单让用户手动填写 |

#### 2.2 文献笔记窗口

Electron 多窗口方案：

```js
// electron/main.js 中新增
function openNoteWindow(refId) {
  const noteWin = new BrowserWindow({
    width: 380,
    height: 600,
    alwaysOnTop: true,       // 置顶
    resizable: true,
    frame: true,
    // 加载笔记页面，传入题录 ID
  });
}
```

笔记编辑器基于 Tiptap，预设模板：

```
┌─────────────────────────┐
│ 📄 题录信息（自动填充）    │  ← 只读区域，从 references 表读取
├─────────────────────────┤
│ ✏️ 关键语句及思考         │  ← 可编辑富文本
├─────────────────────────┤
│ 🔗 笔记链接              │  ← 可编辑，存放关联链接
└─────────────────────────┘
```

支持的格式：加粗、删除线、编号列表、字体大小调节

#### 2.3 笔记数据库

```sql
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference_id INTEGER NOT NULL,
  content TEXT DEFAULT '',        -- Tiptap JSON 格式
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (reference_id) REFERENCES references(id) ON DELETE CASCADE
);
```

#### 2.4 Token 消耗预估
- PDF 识别逻辑：~2K tokens
- 笔记窗口 + Tiptap 集成：~3K tokens
- Electron 多窗口管理：~1K tokens
- **合计约 6K tokens**

---

### Phase 3 — AI 辅助 + 参考文献导出

#### 3.1 AI 识别参考文献

用户场景：用户在写论文时，想从文献库中找到合适的引用。

```
用户输入一段文字 / 粘贴 PDF 段落
  → 调用 LLM 提取关键概念
  → 在本地题录数据库中语义搜索匹配
  → 返回推荐的参考文献列表
  → 用户选择 → 生成格式化引用
```

API Key 策略：**用户自备 API Key**，存在本地 settings 表中，不经过服务器。

#### 3.2 参考文献格式导出

支持的格式：
| 格式 | 用途 |
|------|------|
| GB/T 7714-2015 | 中文论文标准格式 |
| APA 7th | 英文通用 |
| BibTeX | LaTeX 用户 |
| RIS | 通用交换格式 |

实现方式：纯字符串模板拼接，每种格式一个函数，不需要外部依赖。

#### 3.3 Token 消耗预估
- AI 搜索匹配逻辑：~2K tokens
- 格式化导出（4种格式）：~2K tokens
- **合计约 4K tokens**

---

### Phase 4 — Word Add-in 插件（独立项目）

#### 4.1 架构设计

```
┌──────────────────┐     localhost:3001     ┌──────────────────┐
│  Word Add-in     │ ◄──── HTTP 请求 ────► │  SciTools 主程序  │
│  (office-js)     │                        │  (Express 后端)   │
│                  │                        │                  │
│  - 侧边栏 UI     │  获取题录列表           │  - 题录数据库     │
│  - 插入引用标记   │  搜索文献              │  - AI 服务       │
│  - 刷新引用格式   │  获取格式化文本          │  - 格式化引擎     │
└──────────────────┘                        └──────────────────┘
```

#### 4.2 插件文件结构

```
scitools-word-addin/          ← 独立仓库
├── manifest.xml              ← Office 插件声明
├── src/
│   ├── taskpane/
│   │   ├── taskpane.html     ← 侧边栏 UI
│   │   └── taskpane.js       ← 引用搜索 + 插入逻辑
│   └── commands/
│       └── commands.js       ← 工具栏按钮（刷新引用）
└── webpack.config.js
```

#### 4.3 核心工作流

1. 用户在 Word 中点击"插入引用" → 打开侧边栏
2. 侧边栏从 SciTools 后端拉取题录列表
3. 用户选择文献 → 在光标处插入引用标记 `[1]` + 隐藏书签
4. 用户点击"刷新参考文献" → 遍历文档中所有书签 → 在文末生成参考文献列表

#### 4.4 前置条件
- Phase 1-3 完成，题录数据库和格式化引擎已就绪
- SciTools 主程序需要在后台运行（提供 API）

#### 4.5 Token 消耗预估
- manifest + 基础框架：~1K tokens
- 侧边栏 UI + 搜索：~2K tokens
- 引用插入 + 刷新逻辑：~2K tokens
- **合计约 5K tokens**

---

## 三、关于用户体系的建议

### 当前状态
现有代码包含完整的注册/登录/钱包/支付系统（users, transactions, orders, recharge_codes 等表）。

### 建议策略
| 做法 | 说明 |
|------|------|
| UI 入口隐藏 | 侧边栏不显示"钱包"入口，路由保留但不导航 |
| 文献功能纯本地 | 不依赖 JWT 认证，所有数据存本地 SQLite |
| AI 功能用户自备 Key | settings 表存 API Key，前端设置页面填写 |
| 保留代码不删除 | 未来需要时重新启用，零成本恢复 |

这样做的结果：**零服务器成本**，用户下载即用。

---

## 四、总体评估

### Token 消耗汇总
| 阶段 | 预估 Token | 核心产出 |
|------|-----------|----------|
| Phase 1 | ~10K | 可用的文献管理 MVP |
| Phase 2 | ~6K | PDF 识别 + 笔记系统 |
| Phase 3 | ~4K | AI 辅助 + 格式导出 |
| Phase 4 | ~5K | Word 插件 |
| **总计** | **~25K** | **完整文献管理系统** |

### 风险点
| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| PDF 识别率不稳定 | 用户体验差 | 必须有手动编辑兜底 UI |
| Tiptap 编辑器定制 | 可能需要额外调试 | 只用基础扩展，不做深度定制 |
| Electron 多窗口 macOS/Win 差异 | 贴边隐藏行为不一致 | 先做置顶+可调大小，贴边隐藏最后做 |
| Word Add-in 调试环境 | 需要 Office 365 或本地 Office | Phase 4 再处理，不阻塞前三阶段 |

### 建议开发顺序
```
Phase 1 → 发布测试版收集反馈 → Phase 2 → Phase 3 → 验证产品方向 → Phase 4
```

每个 Phase 完成后都是一个可用的版本，不存在"做了一半不能用"的情况。
