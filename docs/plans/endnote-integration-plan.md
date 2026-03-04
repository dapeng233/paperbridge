# SciTools EndNote 集成实施计划

## 概述
为 SciTools 实现 4 个功能：EndNote XML 导出、打开 PDF + 浮动笔记窗口、AI 两级摘要、打包导出 zip。

---

## Phase 1: EndNote XML 导出格式

### 1.1 后端 - `server/services/literature.js`

新增 `formatEndNoteXML(refs, options)` 函数：
- 输入：refs 数组（含关联的 notes）、options（是否包含 PDF 路径）
- 输出：完整的 EndNote Generated XML 字符串
- 所有文本字段用 `<style face="normal" font="default" size="100%">` 包裹
- 支持字段：title, authors, journal, year, volume, issue/number, pages, doi, abstract, keywords, notes, research-notes, pdf-urls
- Notes 内容：合并该题录所有笔记，去除 HTML 标签
- Research Notes：从 refs 表新增的 `research_note` 字段读取（短标签）

修改 `exportRefs()` 函数：
- 在 format map 中新增 `'endnote-xml'` 选项
- EndNote XML 导出需要额外查询 notes，因此改为支持 options 参数

新增 `getRefsWithNotes(refIds)` 辅助函数：
- 批量查询 refs + 关联 notes

### 1.2 数据库 - `server/services/database.js`

在 refs 表新增字段（通过 ALTER TABLE）：
```sql
ALTER TABLE refs ADD COLUMN research_note TEXT DEFAULT '';
```

### 1.3 后端路由 - `server/routes/literature.js`

修改 `POST /export` 路由：
- 当 format 为 `endnote-xml` 时，调用新的导出逻辑
- 返回 XML 字符串

### 1.4 前端 - `src/pages/Literature/index.vue`

导出弹窗的 select 中新增选项：
```html
<option value="endnote-xml">EndNote XML</option>
```

### 检查点
- [ ] 导出 EndNote XML 文件
- [ ] 在 EndNote 中用 "EndNote Generated XML" 导入成功
- [ ] Notes 和 Research Notes 字段正确显示
- [ ] PDF 路径（file:///）正确关联

---

## Phase 2: 前端"打开 PDF"+ 浮动笔记窗口

### 2.1 Electron 主进程 - `electron/main.js`

新增 IPC handler：
```js
ipcMain.handle('open-note-window', (_, { refId, refTitle }) => { ... })
```
- 创建新的 BrowserWindow：alwaysOnTop, 500x600, resizable, 无 parent
- 加载 URL: `http://localhost:${port}/note-editor?refId=${refId}`
- 返回 windowId

新增 IPC handler：
```js
ipcMain.handle('open-pdf-external', (_, pdfPath) => { shell.openPath(pdfPath) })
```

### 2.2 Electron preload - `electron/preload.js`

暴露新 API：
```js
openNoteWindow: (data) => ipcRenderer.invoke('open-note-window', data),
openPdfExternal: (path) => ipcRenderer.invoke('open-pdf-external', path),
```

### 2.3 前端路由 - `src/router/index.js`

新增路由：
```js
{ path: '/note-editor', name: 'NoteEditor', component: () => import('@/pages/NoteEditor.vue') }
```

### 2.4 新建前端页面 - `src/pages/NoteEditor.vue`

独立的笔记编辑器页面：
- 从 URL query 获取 refId
- 加载该题录的笔记列表
- Tiptap 编辑器（复用现有逻辑）
- 自动保存功能
- 简洁 UI，无侧边栏

### 2.5 修改前端 - `src/pages/Literature/index.vue`

修改 `openPdf(r)` 函数：
- Electron 模式：调用 `openPdfExternal` 直接打开 PDF（而非 showInFolder）
- 同时弹出浮动笔记窗口

新增"浮动笔记"按钮：
- 在题录操作区域添加按钮
- 调用 `window.electronAPI.openNoteWindow({ refId, refTitle })`

### 检查点
- [ ] 点击"打开 PDF"用系统默认阅读器打开 PDF
- [ ] 浮动笔记窗口弹出，置顶显示
- [ ] 笔记编辑和保存正常
- [ ] 关闭浮动窗口不影响主窗口

---

## Phase 3: AI 两级摘要

### 3.1 后端路由 - `server/routes/literature.js`

新增 `POST /api/literature/refs/:id/ai-summary` 端点：
- 读取题录信息（title, abstract）和所有笔记
- 调用 LLM API 生成两级摘要：
  - notes_summary：笔记精华摘要（50-200字，根据笔记长度）
  - research_note：短标签（英文≤20字符含空格符号，中文≤10字符含空格）
- 将 research_note 写入 refs 表的 `research_note` 字段
- 返回 { notes_summary, research_note }

### 3.2 前端 - `src/pages/Literature/index.vue`

在笔记面板或题录详情中新增"AI 总结"按钮：
- 调用 `/refs/:id/ai-summary`
- 显示生成结果
- 用户确认后保存

### 检查点
- [ ] AI 生成 Notes 长摘要内容合理
- [ ] Research Notes 短标签符合字数限制
- [ ] 导出 EndNote XML 时包含 AI 生成的摘要

---

## Phase 4: 打包导出 zip

### 4.1 安装依赖

```bash
npm install archiver --save
```

### 4.2 后端路由 - `server/routes/literature.js`

新增 `POST /api/literature/export-zip` 端点：
- 接收 ref_ids 数组
- 生成 EndNote XML（含 notes, research-notes, pdf-urls）
- 收集所有关联 PDF 文件
- 用 archiver 打包为 zip（references.xml + pdfs/）
- XML 中 PDF 路径使用 `file:///` + 绝对路径（指向 zip 解压后的 pdfs/ 目录）
- 返回 zip 文件流（或保存到临时目录后返回路径）

### 4.3 前端 - `src/pages/Literature/index.vue`

导出弹窗新增"导出 ZIP（含PDF）"按钮：
- Electron 模式：先让用户选择保存目录
- 调用 export-zip API
- 下载/保存 zip 文件

### 检查点
- [ ] zip 文件包含 references.xml 和 pdfs/ 目录
- [ ] 解压后在 EndNote 中导入 XML 成功
- [ ] PDF 自动关联

---

## 实施顺序

1. Phase 1（EndNote XML 导出）→ 测试验证
2. Phase 3（AI 两级摘要）→ 依赖 Phase 1 的 research_note 字段
3. Phase 2（浮动笔记窗口）→ 独立功能
4. Phase 4（zip 打包）→ 依赖 Phase 1

## 涉及文件清单

| 文件 | 改动类型 |
|------|---------|
| `server/services/database.js` | 修改（ALTER TABLE） |
| `server/services/literature.js` | 修改（新增导出函数） |
| `server/routes/literature.js` | 修改（新增路由） |
| `electron/main.js` | 修改（新增 IPC） |
| `electron/preload.js` | 修改（暴露 API） |
| `src/router/index.js` | 修改（新增路由） |
| `src/pages/Literature/index.vue` | 修改（UI + 逻辑） |
| `src/pages/NoteEditor.vue` | **新建** |
| `package.json` | 修改（添加 archiver） |
