<template>
  <div class="lit-page">
    <!-- 顶部工具栏 -->
    <div class="lit-toolbar">
      <input v-model="searchQuery" placeholder="搜索题录..." class="lit-search" @input="onSearch" />
      <button class="lit-btn new-record-btn" @click="openEditor(null)">+ 新建题录</button>
      <button class="lit-btn" :class="{ active: isAllSelected }" @click="toggleSelectAll">{{ isAllSelected ? '取消全选' : '全选' }}</button>
      <button class="lit-btn danger" v-if="selectedIds.size > 0" @click="deleteSelected">{{ selectedFolder === '__trash__' ? '永久删除' : '删除选中' }} ({{ selectedIds.size }})</button>
      <div v-if="selectedIds.size > 0" class="move-to-dropdown">
        <button class="lit-btn" @click="showMoveMenu = !showMoveMenu">归类至 ▾</button>
        <div v-if="showMoveMenu" class="move-to-menu">
          <div class="pdf-dropdown-item" @click="moveSelectedTo(null)">未分类</div>
          <div v-for="f in allFoldersFlat" :key="f.id" class="pdf-dropdown-item" @click="moveSelectedTo(f.id)">
            {{ f.parent_id ? '  └ ' : '' }}{{ f.name }}
          </div>
        </div>
      </div>
      <div style="flex:1"></div>
      <button class="lit-btn" @click="showImport = true">导入</button>
      <button class="lit-btn" style="background:#2e7d32;color:#fff" @click="importFromEndNote" :disabled="endnoteImporting">{{ endnoteImporting ? '导入中...' : '从EndNote导入（含PDF）' }}</button>
      <button class="lit-btn" @click="showExport = true; doExport()">导出</button>
      <button class="lit-btn" @click="doExportZip" :disabled="zipExporting">{{ zipExporting ? '打包中...' : '导出至Endnote(含PDF)' }}</button>
      <button class="lit-btn" @click="showSettings = !showSettings">设置</button>
    </div>

    <!-- 设置面板 -->
    <div v-if="showSettings" class="lit-settings">
      <div class="settings-section-label">设置文献库</div>
      <div class="settings-row">
        <label>文献库路径：</label>
        <span class="lib-path">{{ libraryPath || '未设置' }}</span>
        <button class="lit-btn-sm" @click="selectLibraryPath">选择目录</button>
      </div>
      <div class="settings-divider"></div>
      <div class="settings-section-label">配置 AI</div>
      <div class="settings-row">
        <label>模型名称：</label>
        <input v-model="aiModel" type="text" placeholder="gpt-4o-mini" class="settings-input" />
        <button class="lit-btn-sm" @click="saveAISettings">保存</button>
        <button class="lit-btn-sm" @click="testAIApi">测试连接</button>
      </div>
      <div class="settings-row">
        <small class="settings-hint">API Key 和 Base URL 请在左侧 <a href="#" @click.prevent="$router.push('/api-config')">API 配置</a> 中设置</small>
      </div>
    </div>

    <div class="lit-body">
      <!-- 左侧：我的文库 -->
      <aside class="lit-sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="folder-header">
          <span>我的文库</span>
          <button class="lit-btn-icon" @click="addFolder(null)" title="新建库">+</button>
        </div>
        <div class="folder-item" :class="{ active: selectedFolder === '__all__' }" @click="selectedFolder = '__all__'">
          全部题录
        </div>
        <div class="folder-item" :class="{ active: selectedFolder === '__unclassified__' }" @click="selectedFolder = '__unclassified__'">
          未分类题录
        </div>
        <template v-for="f in rootFolders" :key="f.id">
          <div class="folder-item" :class="{ active: selectedFolder === f.id }"
            @click="selectFolder(f.id)" @dblclick="startRename(f)" @contextmenu.prevent="folderMenu(f)">
            <span v-if="renamingId !== f.id">{{ f.name }}</span>
            <input v-else v-model="renameValue" class="rename-input" @blur="finishRename(f)" @keyup.enter="finishRename(f)" ref="renameInput" />
            <button class="lit-btn-icon small" @click.stop="addFolder(f.id)" title="新建子库">+</button>
          </div>
          <div v-for="c in getChildren(f.id)" :key="c.id" class="folder-item sub"
            :class="{ active: selectedFolder === c.id }"
            @click="selectFolder(c.id)" @dblclick="startRename(c)" @contextmenu.prevent="folderMenu(c)">
            <span v-if="renamingId !== c.id">{{ c.name }}</span>
            <input v-else v-model="renameValue" class="rename-input" @blur="finishRename(c)" @keyup.enter="finishRename(c)" />
          </div>
        </template>
        <div class="folder-divider"></div>
        <div class="folder-item trash-item" :class="{ active: selectedFolder === '__trash__' }" @click="selectedFolder = '__trash__'; loadTrash()">
          回收站 <span v-if="trashedRefs.length" class="trash-count">({{ trashedRefs.length }})</span>
        </div>
      </aside>

      <!-- 拖拽分隔条 -->
      <div class="resize-handle" @mousedown="startResizeSidebar"></div>

      <!-- 中间：题录列表 -->
      <div class="lit-main">
        <div class="ref-list">
          <div class="ref-list-header">
            <span>{{ filteredRefs.length }} 条题录</span>
          </div>
          <!-- 表头 -->
          <div class="ref-table-header">
            <span class="col-check"><input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" /></span>
            <span class="col-year" :style="colStyle('year')">年份<i class="col-resizer" @mousedown="startResizeCol($event, 'year')"></i></span>
            <span class="col-author" :style="colStyle('author')">作者<i class="col-resizer" @mousedown="startResizeCol($event, 'author')"></i></span>
            <span class="col-title" :style="colStyle('title')">标题<i class="col-resizer" @mousedown="startResizeCol($event, 'title')"></i></span>
            <span class="col-journal" :style="colStyle('journal')">期刊<i class="col-resizer" @mousedown="startResizeCol($event, 'journal')"></i></span>
            <span class="col-rnote" :style="colStyle('rnote')">短标签<i class="col-resizer" @mousedown="startResizeCol($event, 'rnote')"></i></span>
            <span class="col-note" :style="colStyle('note')">文献笔记<i class="col-resizer" @mousedown="startResizeCol($event, 'note')"></i></span>
            <span class="col-doi">DOI</span>
            <span class="col-pdf">PDF</span>
            <span class="col-actions">编辑</span>
          </div>
          <!-- 题录行 -->
          <div v-for="r in filteredRefs" :key="r.id" class="ref-row" :class="{ active: selectedRef?.id === r.id, checked: selectedIds.has(r.id) }" @click="selectedRef = r">
            <span class="col-check" @click.stop><input type="checkbox" :checked="selectedIds.has(r.id)" @change="toggleSelect(r.id)" /></span>
            <span class="col-year" :style="colStyle('year')">{{ r.year || '-' }}</span>
            <span class="col-author" :style="colStyle('author')" :title="formatAuthors(r.authors)">{{ formatAuthorsShort(r.authors) }}</span>
            <span class="col-title" :style="colStyle('title')" :title="r.title">{{ r.title || '无标题' }}</span>
            <span class="col-journal" :style="colStyle('journal')" :title="r.journal">{{ r.journal || '-' }}</span>
            <span class="col-rnote" :style="colStyle('rnote')" @click.stop>
              <div class="cell-with-dropdown">
                <input v-if="editingRNoteId === r.id" v-model="rnoteInput" class="rnote-edit-input"
                  @blur="saveRNote(r)" @keyup.enter="saveRNote(r)" @keyup.escape="editingRNoteId = null"
                  maxlength="20" placeholder="15字以内..." ref="rnoteInputRef" />
                <span v-else-if="r.research_note" class="rnote-tag" @click="startEditRNote(r)" :title="r.research_note">{{ r.research_note }}</span>
                <span v-else class="cell-placeholder" @click="startEditRNote(r)">+短标签</span>
                <button class="lit-btn-xs cell-arrow" @click="rnoteMenuRef = rnoteMenuRef === r.id ? null : r.id">&#9662;</button>
                <div v-if="rnoteMenuRef === r.id" class="pdf-dropdown-menu">
                  <div class="pdf-dropdown-item" @click="doAIRNote(r); rnoteMenuRef = null">AI 生成短标签</div>
                </div>
              </div>
            </span>
            <span class="col-note" :style="colStyle('note')" @click.stop>
              <div class="cell-with-dropdown">
                <span v-if="r._hasNote || r.note_title" class="rnote-tag note-green-tag" @click="openFloatingNote(r)" :title="r.note_title || '点击编辑笔记'">{{ r.note_title || '笔记' }}</span>
                <span v-else class="cell-placeholder" @click="openFloatingNote(r)">+笔记</span>
                <button class="lit-btn-xs cell-arrow" @click="noteMenuRef = noteMenuRef === r.id ? null : r.id">&#9662;</button>
                <div v-if="noteMenuRef === r.id" class="pdf-dropdown-menu">
                  <div class="pdf-dropdown-item" @click="openFloatingNote(r); noteMenuRef = null">打开笔记窗口</div>
                  <div class="pdf-dropdown-item" @click="doAINoteTitle(r); noteMenuRef = null">AI 总结笔记标题</div>
                  <div class="pdf-dropdown-item" @click="doAISummaryFromList(r); noteMenuRef = null">AI 总结文献笔记</div>
                </div>
              </div>
            </span>
            <span class="col-doi" @click.stop>
              <div v-if="r.doi" class="pdf-dropdown">
                <button class="lit-btn-xs doi-btn" @click="openDoiInternal(r)" :title="r.doi">DOI</button>
                <button class="lit-btn-xs pdf-arrow doi-btn" @click="doiMenuRef = doiMenuRef === r.id ? null : r.id">&#9662;</button>
                <div v-if="doiMenuRef === r.id" class="pdf-dropdown-menu">
                  <div class="pdf-dropdown-item" @click="openDoiExternal(r); doiMenuRef = null">默认浏览器打开</div>
                  <div class="pdf-dropdown-item" @click="copyDoiUrl(r); doiMenuRef = null">复制地址</div>
                </div>
              </div>
              <button v-else class="lit-btn-xs add-btn" @click="openEditor(r)">+DOI</button>
            </span>
            <span class="col-pdf" @click.stop>
              <div v-if="r.pdf_filename" class="pdf-dropdown">
                <button class="lit-btn-xs pdf-btn" @click="openPdfDefault(r)">PDF</button>
                <button class="lit-btn-xs pdf-arrow" @click="pdfMenuRef = pdfMenuRef === r.id ? null : r.id">&#9662;</button>
                <div v-if="pdfMenuRef === r.id" class="pdf-dropdown-menu">
                  <div class="pdf-dropdown-item" @click="openPdfDefault(r); pdfMenuRef = null">默认程序打开</div>
                  <div class="pdf-dropdown-item" @click="openPdfInFolder(r); pdfMenuRef = null">在文件夹中显示</div>
                  <div class="pdf-dropdown-item" @click="copyPdf(r); pdfMenuRef = null">复制路径</div>
                </div>
              </div>
              <button v-else class="lit-btn-xs add-btn" @click="attachPdfQuick(r)">+PDF</button>
            </span>
            <span class="col-actions" @click.stop>
              <template v-if="selectedFolder === '__trash__'">
                <button class="lit-btn-xs" @click="restoreRef(r)" title="恢复">↩</button>
                <button class="lit-btn-xs" @click="permanentDeleteRef(r)" title="永久删除">✕</button>
              </template>
              <button v-else class="lit-btn-xs" @click="openEditor(r)" title="编辑">✏️</button>
            </span>
          </div>
          <div v-if="filteredRefs.length === 0" class="ref-empty">
            <template v-if="typeof selectedFolder === 'number'">
              此文件夹为空<br><small>在「全部题录」中选中题录，然后使用「归类至」将其添加到此文件夹</small>
            </template>
            <template v-else>暂无题录</template>
          </div>
        </div>
      </div>

      <!-- 右侧：笔记面板 -->
      <aside v-if="showNotes && selectedRef" class="lit-notes">
        <div class="notes-header">
          <span>笔记 - {{ selectedRef.title }}</span>
          <div style="display:flex;gap:4px">
            <button class="lit-btn-icon small" @click="doAISummary" title="AI 总结" :disabled="aiSummaryLoading">{{ aiSummaryLoading ? '...' : 'AI' }}</button>
            <button class="lit-btn-icon small" @click="openFloatingNote(selectedRef)" title="弹出窗口">⬈</button>
            <button class="lit-btn-icon small" @click="showNotes = false" title="关闭">x</button>
          </div>
        </div>
        <!-- AI 总结结果 -->
        <div v-if="aiSummaryResult" class="ai-summary-box">
          <div class="ai-summary-label">Notes 摘要：</div>
          <div class="ai-summary-text">{{ aiSummaryResult.notes_summary }}</div>
          <div class="ai-summary-label">Research Note 标签：</div>
          <div class="ai-summary-tag">{{ aiSummaryResult.research_note }}</div>
          <div style="display:flex;gap:4px;margin-top:6px">
            <button class="lit-btn-xs" @click="saveAISummaryAsNote">保存为笔记</button>
            <button class="lit-btn-xs" @click="aiSummaryResult = null">关闭</button>
          </div>
        </div>
        <div v-if="activeNote" class="notes-editor">
          <div class="editor-toolbar">
            <button @click="noteEditor?.chain().focus().toggleBold().run()" :class="{ active: noteEditor?.isActive('bold') }">B</button>
            <button @click="noteEditor?.chain().focus().toggleItalic().run()" :class="{ active: noteEditor?.isActive('italic') }">I</button>
            <button @click="noteEditor?.chain().focus().toggleBulletList().run()">List</button>
            <button @click="noteEditor?.chain().focus().toggleHeading({ level: 3 }).run()">H3</button>
            <div style="flex:1"></div>
            <button class="lit-btn-sm" @click="saveNote">保存</button>
          </div>
          <editor-content :editor="noteEditor" class="tiptap-content" />
        </div>
        <div v-else class="ref-empty">暂无笔记，点击 ⬈ 弹出窗口编辑</div>
      </aside>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showEditor" class="modal-overlay" @click.self="showEditor = false">
      <div class="modal-box">
        <h3>{{ editingRef ? '编辑题录' : '新建题录' }}</h3>

        <div class="form-grid">
          <label>标题</label><input v-model="form.title" />
          <label>作者</label><input v-model="form.authorsStr" placeholder="用逗号分隔" />
          <label>期刊</label><input v-model="form.journal" />
          <label>年份</label><input v-model.number="form.year" type="number" />
          <label>卷</label><input v-model="form.volume" />
          <label>期</label><input v-model="form.issue" />
          <label>页码</label><input v-model="form.pages" />
          <label>DOI</label><input v-model="form.doi" />
          <label>类型</label>
          <select v-model="form.ref_type">
            <option value="journal">期刊论文</option>
            <option value="book">书籍</option>
            <option value="conference">会议论文</option>
            <option value="thesis">学位论文</option>
            <option value="web">网页</option>
          </select>
          <label>摘要</label><textarea v-model="form.abstract" rows="3"></textarea>
          <label>关键词</label><input v-model="form.keywordsStr" placeholder="用逗号分隔" />
        </div>

        <!-- AI 识别区域 -->
        <div style="margin:16px 0;padding:12px;background:#f5f5f5;border-radius:6px">
          <div style="font-size:0.9em;margin-bottom:6px;color:#666">AI 自动识别</div>
          <textarea v-model="editorAiInput" rows="3" placeholder="粘贴参考文献文本，AI 将自动识别并填充表单..." style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;font-size:0.9em"></textarea>
          <button class="lit-btn primary" @click="fillFormWithAI" :disabled="editorAiLoading" style="margin-top:6px">
            {{ editorAiLoading ? '识别中...' : 'AI 识别并填充' }}
          </button>
        </div>

        <div class="form-footer">
          <button class="lit-btn" @click="attachPdf" v-if="editingRef">关联PDF</button>
          <div style="flex:1"></div>
          <button class="lit-btn" @click="showEditor = false">取消</button>
          <button class="lit-btn primary" @click="saveRef">保存</button>
        </div>
      </div>
    </div>

    <!-- 导入弹窗 -->
    <div v-if="showImport" class="modal-overlay" @click.self="showImport = false">
      <div class="modal-box" style="width:600px">
        <h3>导入题录</h3>
        <p class="import-hint">支持 EndNote XML、RIS、BibTeX、EndNote Export(.enw) 和 PDF</p>
        <div style="display:flex;gap:8px;margin-bottom:8px">
          <button class="lit-btn" @click="selectImportFile">导入 XML/RIS</button>
          <button class="lit-btn primary" @click="importPdfs">导入 PDF</button>
        </div>
        <div v-if="endnoteImporting" class="import-result" style="color:#1565c0">{{ endnoteProgress }}</div>
        <div v-if="importResult" class="import-result">{{ importResult }}</div>

        <hr style="border:none;border-top:1px solid var(--border-color);margin:12px 0"/>
        <h4 style="font-size:0.9em;margin-bottom:6px">参考文献 AI 提取</h4>
        <p class="import-hint">粘贴参考文献文本，AI 将自动识别并结构化</p>
        <textarea v-model="aiInput" rows="4" placeholder="粘贴参考文献列表..." class="export-textarea"></textarea>
        <div style="margin:8px 0">
          <button class="lit-btn primary" @click="doAIMatch" :disabled="aiLoading">
            {{ aiLoading ? '识别中...' : 'AI 提取' }}
          </button>
        </div>
        <div v-if="aiResults.length" class="ai-results">
          <div v-for="(item, i) in aiResults" :key="i" class="ai-result-item">
            <div class="ref-title">{{ item.title }}</div>
            <div class="ref-meta">{{ (item.authors||[]).join(', ') }} · {{ item.year }} · {{ item.journal }}</div>
            <button class="lit-btn-xs" @click="importAIResult(item)">导入</button>
          </div>
        </div>

        <div class="form-footer">
          <button class="lit-btn" @click="showImport = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 导出弹窗 -->
    <div v-if="showExport" class="modal-overlay" @click.self="showExport = false">
      <div class="modal-box">
        <h3>导出题录</h3>
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center">
          <select v-model="exportFormat" @change="doExport" class="lit-btn">
            <option value="gbt7714">GB/T 7714</option>
            <option value="apa">APA</option>
            <option value="bibtex">BibTeX</option>
            <option value="ris">RIS</option>
            <option value="endnote-xml">EndNote XML</option>
          </select>
          <button class="lit-btn" @click="copyExportText">复制</button>
        </div>
        <textarea readonly :value="exportText" rows="12" class="export-textarea"></textarea>
        <div class="form-footer">
          <button class="lit-btn" @click="showExport = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div v-if="ctxMenu" class="ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }">
      <div class="ctx-item" @click="startRename(ctxMenu.folder); ctxMenu = null">重命名</div>
      <div class="ctx-item danger" @click="deleteFolderItem(ctxMenu.folder); ctxMenu = null">删除</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick, watch, onBeforeUnmount } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';

const API = '/api/literature';
const api = async (path, opts) => {
  const res = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  const text = await res.text();
  if (!text) throw new Error('服务器返回空响应');
  const data = JSON.parse(text);
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}: ${res.statusText}`);
  }
  return data;
};

// 获取实际的 folder_id（特殊值转为 null）
function getActualFolderId() {
  const v = selectedFolder.value;
  return (v === '__all__' || v === '__unclassified__') ? null : v;
}

// 状态
const folders = ref([]);
const refs = ref([]);
const searchQuery = ref('');
const selectedFolder = ref('__all__');
const selectedRef = ref(null);
const libraryPath = ref('');
const showSettings = ref(false);
const showEditor = ref(false);
const showImport = ref(false);
const importResult = ref('');
const endnoteImporting = ref(false);
const endnoteProgress = ref('');
const editingRef = ref(null);
const renamingId = ref(null);
const renameValue = ref('');
const ctxMenu = ref(null);

// 面板宽度拖拽
const sidebarWidth = ref(parseInt(localStorage.getItem('st_sidebar_w') || '180'));
const colWidths = ref(JSON.parse(localStorage.getItem('st_col_widths') || '{}'));

function startResizeSidebar(e) {
  const startX = e.clientX;
  const startW = sidebarWidth.value;
  const onMove = (ev) => {
    sidebarWidth.value = Math.max(120, Math.min(350, startW + ev.clientX - startX));
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    localStorage.setItem('st_sidebar_w', sidebarWidth.value);
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// 列宽拖拽（Endnote 风格：拖宽左列时右邻列等量缩小，总宽不变）
const COL_ORDER = ['year', 'author', 'title', 'journal', 'rnote', 'note'];
const COL_DEFAULTS = { year: 46, author: 110, title: 200, journal: 120, rnote: 110, note: 120 };
const COL_MIN = 30;

function getColWidth(name) {
  return colWidths.value[name] || COL_DEFAULTS[name] || 80;
}

function startResizeCol(e, colName) {
  e.stopPropagation();
  e.preventDefault();
  const idx = COL_ORDER.indexOf(colName);
  if (idx < 0 || idx >= COL_ORDER.length - 1) return;
  const rightCol = COL_ORDER[idx + 1];
  const startX = e.clientX;
  const startLeftW = getColWidth(colName);
  const startRightW = getColWidth(rightCol);
  const totalW = startLeftW + startRightW;

  const onMove = (ev) => {
    const delta = ev.clientX - startX;
    let newLeft = startLeftW + delta;
    let newRight = totalW - newLeft;
    if (newLeft < COL_MIN) { newLeft = COL_MIN; newRight = totalW - COL_MIN; }
    if (newRight < COL_MIN) { newRight = COL_MIN; newLeft = totalW - COL_MIN; }
    colWidths.value = { ...colWidths.value, [colName]: newLeft, [rightCol]: newRight };
  };
  const onUp = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    localStorage.setItem('st_col_widths', JSON.stringify(colWidths.value));
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function colStyle(colName) {
  const w = getColWidth(colName);
  return { flexBasis: w + 'px', flexGrow: colName === 'title' ? 1 : 0, flexShrink: 1, minWidth: COL_MIN + 'px' };
}
const pdfMenuRef = ref(null);
const doiMenuRef = ref(null);
const rnoteMenuRef = ref(null);
const noteMenuRef = ref(null);
const showMoveMenu = ref(false);
let _folderClickTimer = null;

function selectFolder(folderId) {
  clearTimeout(_folderClickTimer);
  _folderClickTimer = setTimeout(() => {
    selectedFolder.value = folderId;
  }, 220);
}

// 扁平化文件夹列表（用于归类至下拉）
const allFoldersFlat = computed(() => {
  const result = [];
  for (const f of rootFolders.value) {
    result.push(f);
    for (const c of getChildren(f.id)) {
      result.push(c);
    }
  }
  return result;
});

async function moveSelectedTo(folderId) {
  await Promise.all([...selectedIds.value].map(id =>
    api('/refs/' + id, { method: 'PUT', body: JSON.stringify({ folder_id: folderId }) })
  ));
  selectedIds.value = new Set();
  showMoveMenu.value = false;
  selectedFolder.value = folderId === null ? '__unclassified__' : folderId;
  await loadRefs();
}

// 批量选择
const selectedIds = ref(new Set());
const isAllSelected = computed(() => filteredRefs.value.length > 0 && filteredRefs.value.every(r => selectedIds.value.has(r.id)));

function toggleSelect(id) {
  const s = new Set(selectedIds.value);
  if (s.has(id)) s.delete(id); else s.add(id);
  selectedIds.value = s;
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(filteredRefs.value.map(r => r.id));
  }
}

async function deleteSelected() {
  if (!selectedIds.value.size) return;
  if (selectedFolder.value === '__trash__') {
    if (!confirm(`确定永久删除选中的 ${selectedIds.value.size} 条题录？删除后将无法找回！`)) return;
    for (const id of selectedIds.value) {
      await api('/trash/' + id, { method: 'DELETE' });
    }
    selectedIds.value = new Set();
    loadTrash();
  } else {
    if (!confirm(`确定将选中的 ${selectedIds.value.size} 条题录移入回收站？`)) return;
    for (const id of selectedIds.value) {
      await api('/refs/' + id, { method: 'DELETE' });
    }
    selectedIds.value = new Set();
    selectedRef.value = null;
    loadRefs();
  }
}

// Research Note 内联编辑
const editingRNoteId = ref(null);
const rnoteInput = ref('');

function startEditRNote(r) {
  editingRNoteId.value = r.id;
  rnoteInput.value = r.research_note || '';
  nextTick(() => {
    const el = document.querySelector('.rnote-edit-input');
    if (el) el.focus();
  });
}

async function saveRNote(r) {
  const val = rnoteInput.value.trim().substring(0, 20);
  if (val !== (r.research_note || '')) {
    await api('/refs/' + r.id, { method: 'PUT', body: JSON.stringify({ research_note: val }) });
    r.research_note = val;
  }
  editingRNoteId.value = null;
}

// 笔记标题内联编辑
const editingNoteTitleId = ref(null);
const noteTitleInput = ref('');

function startEditNoteTitle(r) {
  editingNoteTitleId.value = r.id;
  noteTitleInput.value = r.note_title || '';
  nextTick(() => {
    const el = document.querySelector('.col-note .rnote-edit-input');
    if (el) el.focus();
  });
}

async function saveNoteTitle(r) {
  const val = noteTitleInput.value.trim().substring(0, 30);
  if (val !== (r.note_title || '')) {
    await api('/refs/' + r.id, { method: 'PUT', body: JSON.stringify({ note_title: val }) });
    r.note_title = val;
  }
  editingNoteTitleId.value = null;
}

// AI 生成短标签（单条题录）
async function doAIRNote(r) {
  if (!aiApiKey.value) { alert('请先在设置中配置 AI API Key'); return; }
  const res = await api('/refs/' + r.id + '/ai-summary', {
    method: 'POST',
    body: JSON.stringify({ api_key: aiApiKey.value, base_url: aiBaseUrl.value, model: aiModel.value })
  });
  if (res.error) { alert('AI 生成失败: ' + res.error); return; }
  if (res.research_note) {
    r.research_note = res.research_note;
  }
}

// AI 总结笔记标题（从文献笔记生成简短标题）
async function doAINoteTitle(r) {
  if (!aiApiKey.value) { alert('请先在设置中配置 AI API Key'); return; }
  const res = await api('/refs/' + r.id + '/ai-summary', {
    method: 'POST',
    body: JSON.stringify({ api_key: aiApiKey.value, base_url: aiBaseUrl.value, model: aiModel.value })
  });
  if (res.error) { alert('AI 生成失败: ' + res.error); return; }
  if (res.notes_summary) {
    const title = res.notes_summary.substring(0, 30);
    await api('/refs/' + r.id, { method: 'PUT', body: JSON.stringify({ note_title: title }) });
    r.note_title = title;
  }
}

// AI 总结文献笔记（完整摘要保存为笔记）
async function doAISummaryFromList(r) {
  if (!aiApiKey.value) { alert('请先在设置中配置 AI API Key'); return; }
  selectedRef.value = r;
  aiSummaryLoading.value = true;
  aiSummaryResult.value = null;
  try {
    const res = await api('/refs/' + r.id + '/ai-summary', {
      method: 'POST',
      body: JSON.stringify({ api_key: aiApiKey.value, base_url: aiBaseUrl.value, model: aiModel.value })
    });
    if (res.error) { alert('AI 总结失败: ' + res.error); return; }
    aiSummaryResult.value = res;
    showNotes.value = true;
  } catch (e) { alert('AI 总结失败: ' + e.message); }
  aiSummaryLoading.value = false;
}

// 测试 AI API 连接
async function testAIApi() {
  if (!aiApiKey.value) { alert('未配置 AI API Key，请先在设置中配置'); return; }
  const res = await api('/ai-test', {
    method: 'POST',
    body: JSON.stringify({ api_key: aiApiKey.value, base_url: aiBaseUrl.value, model: aiModel.value })
  });
  if (res.success) {
    alert('API 连接测试成功！');
  } else {
    alert('API 连接失败: ' + (res.error || '未知错误'));
  }
}

const form = ref({ title: '', authorsStr: '', journal: '', year: null, volume: '', issue: '', pages: '', doi: '', abstract: '', keywordsStr: '', ref_type: 'journal' });

// 笔记
const notes = ref([]);
const activeNote = ref(null);
const showNotes = ref(false);

// 导出
const showExport = ref(false);
const exportFormat = ref('gbt7714');
const exportText = ref('');
const zipExporting = ref(false);

// AI 匹配
const aiInput = ref('');
const aiResults = ref([]);
const aiLoading = ref(false);
const aiApiKey = ref('');
const aiBaseUrl = ref('');
const aiModel = ref('');

const editorAiInput = ref('');
const editorAiLoading = ref(false);

const aiSummaryLoading = ref(false);
const aiSummaryResult = ref(null);

// 计算属性
const rootFolders = computed(() => folders.value.filter(f => !f.parent_id));
const getChildren = (pid) => folders.value.filter(f => f.parent_id === pid);

const filteredRefs = computed(() => {
  if (selectedFolder.value === '__trash__') return trashedRefs.value;
  if (searchQuery.value) return refs.value;
  if (selectedFolder.value === '__all__') return refs.value;
  if (selectedFolder.value === '__unclassified__') return refs.value.filter(r => r.folder_id === null || r.folder_id === undefined);
  if (selectedFolder.value) return refs.value.filter(r => r.folder_id === selectedFolder.value);
  return refs.value;
});

// 加载数据
async function loadFolders() { folders.value = await api('/folders'); }
async function loadRefs() {
  if (searchQuery.value) {
    refs.value = await api('/refs?q=' + encodeURIComponent(searchQuery.value));
  } else {
    refs.value = await api('/refs');
  }
  // 一次请求获取所有有笔记的题录 ID
  const idsWithNotes = await api('/notes/refs-with-notes');
  const noteSet = new Set(idsWithNotes);
  refs.value.forEach(r => { r._hasNote = noteSet.has(r.id); });
}
async function loadSettings() {
  const r = await api('/settings/library_path');
  libraryPath.value = r.value || '';
}

// 回收站
const trashedRefs = ref([]);
async function loadTrash() {
  trashedRefs.value = await api('/trash');
}
async function restoreRef(r) {
  await api('/trash/' + r.id + '/restore', { method: 'POST' });
  await loadTrash();
  await loadRefs();
}
async function permanentDeleteRef(r) {
  if (!confirm('永久删除后将无法找回，确定要删除"' + (r.title || '无标题') + '"吗？')) return;
  await api('/trash/' + r.id, { method: 'DELETE' });
  await loadTrash();
}

// Tiptap 编辑器
const noteEditor = useEditor({ extensions: [StarterKit], content: '', onUpdate: ({ editor }) => {
  if (activeNote.value) { activeNote.value._dirty = editor.getHTML(); }
}});
onBeforeUnmount(() => { noteEditor.value?.destroy(); });

onMounted(() => { loadFolders(); loadRefs(); loadSettings(); loadAISettings(); });
watch(selectedFolder, () => { selectedRef.value = null; });
watch(selectedRef, (r) => { if (r) loadNotes(r.id); else { notes.value = []; showNotes.value = false; } });

// AI 设置
async function loadAISettings() {
  const k = await api('/settings/ai_api_key');
  const u = await api('/settings/ai_base_url');
  const m = await api('/settings/ai_model');
  aiApiKey.value = k.value || '';
  aiBaseUrl.value = u.value || '';
  aiModel.value = m.value || '';
}

async function saveAISettings() {
  try {
    await api('/settings', { method: 'POST', body: JSON.stringify({ key: 'ai_model', value: aiModel.value }) });
    alert('AI 模型配置已保存');
  } catch (e) {
    alert('保存失败: ' + e.message);
  }
}

// 笔记
async function loadNotes(refId) {
  notes.value = await api('/refs/' + refId + '/notes');
  if (notes.value.length) selectNote(notes.value[0]);
  else activeNote.value = null;
}

function selectNote(n) {
  activeNote.value = n;
  noteEditor.value?.commands.setContent(n.content || '');
}

async function saveNote() {
  if (!activeNote.value) return;
  const html = activeNote.value._dirty ?? noteEditor.value?.getHTML() ?? '';
  await api('/notes/' + activeNote.value.id, { method: 'PUT', body: JSON.stringify({ content: html }) });
  activeNote.value.content = html;
  delete activeNote.value._dirty;
  // 更新文献记录的笔记状态标志
  if (selectedRef.value) {
    selectedRef.value._hasNote = true;
  }
}

// AI 两级摘要
async function doAISummary() {
  if (!selectedRef.value) return;
  if (!aiApiKey.value) { alert('请先在设置中配置 AI API Key'); return; }
  aiSummaryLoading.value = true;
  aiSummaryResult.value = null;
  try {
    const res = await api('/refs/' + selectedRef.value.id + '/ai-summary', {
      method: 'POST',
      body: JSON.stringify({ api_key: aiApiKey.value, base_url: aiBaseUrl.value, model: aiModel.value })
    });
    if (res.error) { alert('AI 总结失败: ' + res.error); return; }
    aiSummaryResult.value = res;
  } catch (e) { alert('AI 总结失败: ' + e.message); }
  aiSummaryLoading.value = false;
}

async function saveAISummaryAsNote() {
  if (!aiSummaryResult.value || !selectedRef.value) return;
  const content = `<p><strong>AI 摘要：</strong></p><p>${aiSummaryResult.value.notes_summary}</p><p><strong>短标签：</strong>${aiSummaryResult.value.research_note}</p>`;
  const n = await api('/refs/' + selectedRef.value.id + '/notes', { method: 'POST', body: JSON.stringify({ content }) });
  notes.value.unshift(n);
  selectNote(n);
  aiSummaryResult.value = null;
}

// 获取导出用的题录 ID 列表（优先选中项，否则全部）
function getExportIds() {
  if (selectedIds.value.size > 0) return [...selectedIds.value];
  return filteredRefs.value.map(r => r.id);
}

// 导出
async function doExport() {
  const ids = getExportIds();
  if (!ids.length) { exportText.value = '没有可导出的题录'; return; }
  const res = await api('/export', { method: 'POST', body: JSON.stringify({ ref_ids: ids, format: exportFormat.value }) });
  exportText.value = res.text || res.error || '';
}

function copyExportText() {
  navigator.clipboard.writeText(exportText.value);
  alert('已复制到剪贴板');
}

async function doExportZip() {
  if (selectedIds.value.size === 0) { alert('请先勾选要导出的题录'); return; }
  const ids = [...selectedIds.value];
  zipExporting.value = true;
  try {
    const res = await fetch(API + '/export-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref_ids: ids })
    });
    if (!res.ok) { alert('导出失败: ' + (await res.text())); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scitools-export.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('导出失败: ' + e.message);
  } finally {
    zipExporting.value = false;
  }
}

// AI 匹配
async function doAIMatch() {
  if (!aiInput.value.trim()) return;
  if (!aiApiKey.value) { alert('请先在设置中配置 AI API Key'); return; }
  aiLoading.value = true;
  aiResults.value = [];
  try {
    const res = await api('/ai-match', { method: 'POST', body: JSON.stringify({ text: aiInput.value, api_key: aiApiKey.value, base_url: aiBaseUrl.value, model: aiModel.value }) });
    if (res.error) { alert('AI 匹配失败: ' + res.error); return; }
    aiResults.value = res.items || [];
  } catch (e) { alert('AI 匹配失败: ' + e.message); }
  aiLoading.value = false;
}

async function importAIResult(item) {
  await api('/refs', { method: 'POST', body: JSON.stringify({ ...item, folder_id: getActualFolderId() }) });
  loadRefs();
  alert('已导入: ' + item.title);
}

async function fillFormWithAI() {
  if (!editorAiInput.value.trim()) return alert('请输入参考文献文本');
  if (!aiApiKey.value) return alert('请先在设置中配置 AI API Key');
  editorAiLoading.value = true;
  try {
    const res = await api('/ai-match', { method: 'POST', body: JSON.stringify({ text: editorAiInput.value, api_key: aiApiKey.value, base_url: aiBaseUrl.value, model: aiModel.value }) });
    if (res.error) return alert('AI 识别失败: ' + res.error);
    const items = res.items || [];
    if (items.length === 0) return alert('未识别到有效的参考文献');
    const item = items[0];
    form.value.title = item.title || '';
    form.value.authorsStr = (item.authors || []).join(', ');
    form.value.journal = item.journal || '';
    form.value.year = item.year || null;
    form.value.volume = item.volume || '';
    form.value.issue = item.issue || '';
    form.value.pages = item.pages || '';
    form.value.doi = item.doi || '';
    form.value.abstract = item.abstract || '';
    form.value.keywordsStr = (item.keywords || []).join(', ');
    form.value.ref_type = item.ref_type || 'journal';
    editorAiInput.value = '';
    alert('AI 识别成功，已填充表单');
  } catch (e) {
    alert('AI 识别失败: ' + e.message);
  } finally {
    editorAiLoading.value = false;
  }
}

// 搜索
let searchTimer;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadRefs, 300);
}

// 格式化作者
function formatAuthors(raw) {
  try { const arr = typeof raw === 'string' ? JSON.parse(raw) : raw; return arr.slice(0, 2).join(', ') + (arr.length > 2 ? ' 等' : ''); }
  catch { return raw || ''; }
}

function formatAuthorsShort(raw) {
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!arr.length) return '-';
    const first = arr[0].split(/[,，\s]/)[0]; // 取第一作者姓
    return first;
  } catch { return raw || '-'; }
}

// 文件夹操作
async function addFolder(parentId) {
  try {
    const res = await fetch(API + '/folders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '新建库', parent_id: parentId })
    });
    if (!res.ok) throw new Error('创建文件夹失败');
    await res.json();
    await loadFolders();
  } catch (e) {
    console.error('addFolder error:', e);
    alert('创建文件夹失败: ' + e.message);
  }
}

function startRename(f) {
  clearTimeout(_folderClickTimer);
  renamingId.value = f.id;
  renameValue.value = f.name;
  nextTick(() => { const el = document.querySelector('.rename-input'); if (el) el.focus(); });
}

async function finishRename(f) {
  if (renameValue.value && renameValue.value !== f.name) {
    await api('/folders/' + f.id, { method: 'PUT', body: JSON.stringify({ name: renameValue.value }) });
    loadFolders();
  }
  renamingId.value = null;
}

function folderMenu(f) {
  ctxMenu.value = { folder: f, x: event.clientX, y: event.clientY };
  const close = () => { ctxMenu.value = null; document.removeEventListener('click', close); };
  setTimeout(() => document.addEventListener('click', close), 0);
}

async function deleteFolderItem(f) {
  if (!confirm(`确定删除文件夹"${f.name}"？`)) return;
  await api('/folders/' + f.id, { method: 'DELETE' });
  if (selectedFolder.value === f.id) selectedFolder.value = '__all__';
  loadFolders(); loadRefs();
}

// 题录操作
function openEditor(r) {
  editingRef.value = r;
  if (r) {
    const authors = typeof r.authors === 'string' ? JSON.parse(r.authors || '[]') : (r.authors || []);
    const keywords = typeof r.keywords === 'string' ? JSON.parse(r.keywords || '[]') : (r.keywords || []);
    form.value = { title: r.title, authorsStr: authors.join(', '), journal: r.journal, year: r.year, volume: r.volume, issue: r.issue, pages: r.pages, doi: r.doi, abstract: r.abstract, keywordsStr: keywords.join(', '), ref_type: r.ref_type };
  } else {
    form.value = { title: '', authorsStr: '', journal: '', year: null, volume: '', issue: '', pages: '', doi: '', abstract: '', keywordsStr: '', ref_type: 'journal' };
  }
  showEditor.value = true;
}

async function saveRef() {
  const data = {
    ...form.value,
    authors: form.value.authorsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean),
    keywords: form.value.keywordsStr.split(/[,，]/).map(s => s.trim()).filter(Boolean),
    folder_id: getActualFolderId()
  };
  delete data.authorsStr; delete data.keywordsStr;
  if (editingRef.value) {
    await api('/refs/' + editingRef.value.id, { method: 'PUT', body: JSON.stringify(data) });
  } else {
    await api('/refs', { method: 'POST', body: JSON.stringify(data) });
  }
  showEditor.value = false;
  loadRefs();
}

async function deleteRefItem(r) {
  if (!confirm(`确定删除"${r.title}"？`)) return;
  await api('/refs/' + r.id, { method: 'DELETE' });
  if (selectedRef.value?.id === r.id) selectedRef.value = null;
  loadRefs();
}

// PDF 操作
async function copyPdf(r) {
  const res = await api('/refs/' + r.id + '/pdf-path');
  if (res.path) {
    await navigator.clipboard.writeText(res.path);
    alert('PDF 路径已复制');
  }
}

async function openPdfDefault(r) {
  const res = await api('/refs/' + r.id + '/pdf-path');
  if (!res.path) { alert('PDF 文件不存在'); return; }
  if (window.electronAPI?.openPdfExternal) {
    await window.electronAPI.openPdfExternal(res.path);
  } else {
    window.open('/api/literature/refs/' + r.id + '/pdf-path', '_blank');
  }
}

function openDoiInternal(r) {
  if (!r.doi) return;
  const url = 'https://doi.org/' + r.doi;
  window.open(url, '_blank');
}

function openDoiExternal(r) {
  if (!r.doi) return;
  const url = 'https://doi.org/' + r.doi;
  if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
}

function copyDoiUrl(r) {
  if (!r.doi) return;
  const url = 'https://doi.org/' + r.doi;
  if (window.electronAPI?.copyToClipboard) {
    window.electronAPI.copyToClipboard(url);
    alert('DOI 地址已复制');
  } else {
    navigator.clipboard.writeText(url).then(() => alert('DOI 地址已复制'));
  }
}

async function openPdfInFolder(r) {
  const res = await api('/refs/' + r.id + '/pdf-path');
  if (res.path && window.electronAPI) window.electronAPI.showInFolder(res.path);
}

function openFloatingNote(r) {
  selectedRef.value = r;
  if (window.electronAPI?.openNoteWindow) {
    window.electronAPI.openNoteWindow({ refId: r.id, refTitle: r.title });
  } else {
    // 浏览器模式：打开新窗口
    window.open('/note-editor?refId=' + r.id, '_blank', 'width=520,height=640');
  }
}

async function attachPdf() {
  if (!window.electronAPI) return alert('请在桌面端使用此功能');
  const files = await window.electronAPI.selectFile([{ name: 'PDF', extensions: ['pdf'] }]);
  if (files.length && editingRef.value) {
    await api('/refs/' + editingRef.value.id + '/pdf', { method: 'POST', body: JSON.stringify({ source_path: files[0] }) });
    loadRefs();
    alert('PDF 已关联');
  }
}

async function attachPdfQuick(r) {
  if (!window.electronAPI) return alert('请在桌面端使用此功能');
  const files = await window.electronAPI.selectFile([{ name: 'PDF', extensions: ['pdf'] }]);
  if (files.length) {
    await api('/refs/' + r.id + '/pdf', { method: 'POST', body: JSON.stringify({ source_path: files[0] }) });
    loadRefs();
  }
}

// 设置
async function selectLibraryPath() {
  try {
    if (window.electronAPI) {
      const dir = await window.electronAPI.selectDirectory();
      if (dir) {
        const res = await api('/settings', { method: 'POST', body: JSON.stringify({ key: 'library_path', value: dir }) });
        if (res.success) {
          libraryPath.value = dir;
          alert('文献库路径设置成功');
        } else {
          alert('保存失败: ' + (res.error || '未知错误'));
        }
      }
    } else {
      const dir = prompt('请输入文献库路径：', libraryPath.value);
      if (dir) {
        const res = await api('/settings', { method: 'POST', body: JSON.stringify({ key: 'library_path', value: dir }) });
        if (res.success) {
          libraryPath.value = dir;
          alert('文献库路径设置成功');
        } else {
          alert('保存失败: ' + (res.error || '未知错误'));
        }
      }
    }
  } catch (e) {
    alert('设置失败: ' + e.message);
    console.error('设置文献库路径失败:', e);
  }
}

// 导入
// 导入 PDF
async function importPdfs() {
  importResult.value = '';
  if (!libraryPath.value) { importResult.value = '请先在"设置"中选择文献库路径'; return; }
  if (!window.electronAPI) return alert('请在桌面端使用导入功能');
  const files = await window.electronAPI.selectFile([{ name: 'PDF', extensions: ['pdf'] }]);
  if (!files.length) return;
  const res = await api('/import-pdfs', { method: 'POST', body: JSON.stringify({ paths: files, folder_id: getActualFolderId() }) });
  if (res.error) { importResult.value = '导入失败: ' + res.error; return; }
  importResult.value = `成功导入 ${res.count} 个 PDF`;
  loadRefs();
}

// 从 EndNote 导入（含 PDF）
async function importFromEndNote() {
  importResult.value = '';
  endnoteImporting.value = false;
  endnoteProgress.value = '';

  if (!libraryPath.value) { importResult.value = '请先在"设置"中选择文献库路径'; return; }
  if (!window.electronAPI) return alert('请在桌面端使用导入功能');

  // Step 1: 选择 XML 文件
  endnoteProgress.value = '请选择 EndNote 导出的 XML 文件...';
  const xmlFiles = await window.electronAPI.selectFile([{ name: 'EndNote XML', extensions: ['xml'] }]);
  if (!xmlFiles.length) { endnoteProgress.value = ''; return; }
  const xmlPath = xmlFiles[0];

  // Step 2: 可选 - 选择 EndNote 文献库文件夹（.enl 所在目录）
  // 用来查找 PDF，跳过不影响题录导入
  endnoteProgress.value = '正在准备导入...';
  let libraryFolder = '';
  const wantPdf = confirm(
    '是否同时导入 PDF？\n\n' +
    '点击「确定」后，请选择您的 EndNote 文献库文件夹\n' +
    '（即 .enl 文件所在的文件夹，通常名称类似 "My EndNote Library"）\n\n' +
    '点击「取消」则只导入题录信息，PDF 可之后手动关联。'
  );
  if (wantPdf) {
    endnoteProgress.value = '请选择您的 EndNote 文献库文件夹（.enl 文件所在位置）...';
    const dir = await window.electronAPI.selectDirectory();
    if (dir) libraryFolder = dir;
  }

  endnoteImporting.value = true;
  endnoteProgress.value = '正在导入，请稍候...';

  try {
    const res = await api('/import-endnote', {
      method: 'POST',
      body: JSON.stringify({
        xml_path: xmlPath,
        library_folder: libraryFolder,
        folder_id: getActualFolderId()
      })
    });
    if (res.error) {
      importResult.value = '导入失败: ' + res.error;
    } else if (res.pdfCount > 0) {
      importResult.value = `成功导入 ${res.count} 条题录，已自动关联 ${res.pdfCount} 个 PDF`;
    } else {
      importResult.value = `成功导入 ${res.count} 条题录（PDF 可通过每条记录的 +PDF 按钮手动关联）`;
    }
    loadRefs();
  } catch (e) {
    importResult.value = '导入失败: ' + e.message;
  } finally {
    endnoteImporting.value = false;
    endnoteProgress.value = '';
  }
}

// 导入 XML/RIS
async function selectImportFile() {
  importResult.value = '';
  let files;
  if (window.electronAPI) {
    files = await window.electronAPI.selectFile([{ name: '题录文件', extensions: ['xml', 'ris', 'bib', 'enw', 'txt'] }]);
  } else {
    return alert('请在桌面端使用导入功能');
  }
  if (!files.length) return;
  const filePath = files[0];
  try {
    const text = await fetch('/api/literature/read-file?path=' + encodeURIComponent(filePath)).then(r => r.text());
    let items;
    if (filePath.endsWith('.xml')) {
      items = parseEndNoteXML(text);
    } else if (filePath.endsWith('.bib')) {
      items = parseBibTeX(text);
    } else if (filePath.endsWith('.enw') || text.trimStart().startsWith('%0')) {
      items = parseENW(text);
    } else {
      items = parseRIS(text);
    }
    if (!items.length) { importResult.value = '未解析到有效题录'; return; }
    const res = await api('/import', { method: 'POST', body: JSON.stringify({ items, folder_id: getActualFolderId() }) });
    if (res.error) { importResult.value = '导入失败: ' + res.error; return; }
    importResult.value = `成功导入 ${res.count} 条题录`;
    loadRefs();
  } catch (e) {
    importResult.value = '导入失败: ' + e.message;
  }
}

// EndNote XML 解析
function parseEndNoteXML(text) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const records = doc.querySelectorAll('record, Record');
  return Array.from(records).map(rec => {
    const get = (sel) => { const el = rec.querySelector(sel); return el ? el.textContent.trim() : ''; };
    const getAll = (sel) => Array.from(rec.querySelectorAll(sel)).map(el => el.textContent.trim());
    return {
      title: get('title, titles > title > style') || get('titles > title'),
      authors: getAll('author, contributors > authors > author > style').map(a => a || '').filter(Boolean),
      journal: get('secondary-title, periodical > full-title > style') || get('periodical > full-title'),
      year: parseInt(get('year, dates > year > style') || get('dates > year')) || null,
      volume: get('volume'),
      issue: get('number'),
      pages: get('pages'),
      doi: get('electronic-resource-num, electronic-resource-num > style'),
      abstract: get('abstract, abstract > style'),
      keywords: getAll('keyword, keywords > keyword > style').filter(Boolean),
      ref_type: 'journal'
    };
  });
}

// RIS 解析
function parseRIS(text) {
  const items = []; let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
    if (!m) continue;
    const [, tag, val] = m;
    if (tag === 'TY') { cur = { authors: [], keywords: [] }; continue; }
    if (tag === 'ER') { if (cur) items.push(cur); cur = null; continue; }
    if (!cur) continue;
    const v = val.trim();
    if (tag === 'TI' || tag === 'T1') cur.title = v;
    else if (tag === 'AU' || tag === 'A1') cur.authors.push(v);
    else if (tag === 'JO' || tag === 'JF' || tag === 'T2') cur.journal = cur.journal || v;
    else if (tag === 'PY' || tag === 'Y1') cur.year = parseInt(v) || null;
    else if (tag === 'VL') cur.volume = v;
    else if (tag === 'IS') cur.issue = v;
    else if (tag === 'SP') cur.pages = v;
    else if (tag === 'EP') cur.pages = (cur.pages || '') + '-' + v;
    else if (tag === 'DO') cur.doi = v;
    else if (tag === 'AB' || tag === 'N2') cur.abstract = v;
    else if (tag === 'KW') cur.keywords.push(v);
  }
  return items;
}

// BibTeX 解析（知网导出格式）
function parseBibTeX(text) {
  const items = [];
  const entries = text.match(/@\w+\{[^@]+/g) || [];
  for (const entry of entries) {
    const field = (name) => { const m = entry.match(new RegExp(name + '\\s*=\\s*[{"]([^}"]*)[}"]', 'i')); return m ? m[1].trim() : ''; };
    const title = field('title');
    if (!title) continue;
    items.push({
      title,
      authors: field('author').split(/\s+and\s+/i).map(a => a.trim()).filter(Boolean),
      journal: field('journal'),
      year: parseInt(field('year')) || null,
      volume: field('volume'),
      issue: field('number'),
      pages: field('pages'),
      doi: field('doi'),
      abstract: field('abstract'),
      keywords: field('keywords').split(/[,;，；]/).map(k => k.trim()).filter(Boolean),
      ref_type: 'journal'
    });
  }
  return items;
}

// EndNote Export (.enw) 解析（知网导出格式）
function parseENW(text) {
  const items = []; let cur = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^%([A-Z0-9])\s+(.*)$/);
    if (!m) continue;
    const [, tag, val] = m;
    const v = val.trim();
    if (tag === '0') { if (cur) items.push(cur); cur = { authors: [], keywords: [] }; continue; }
    if (!cur) continue;
    if (tag === 'T') cur.title = v;
    else if (tag === 'A') cur.authors.push(v);
    else if (tag === 'J' || tag === 'B') cur.journal = cur.journal || v;
    else if (tag === 'D') cur.year = parseInt(v) || null;
    else if (tag === 'V') cur.volume = v;
    else if (tag === 'N') cur.issue = v;
    else if (tag === 'P') cur.pages = v;
    else if (tag === 'R') cur.doi = v;
    else if (tag === 'X') cur.abstract = v;
    else if (tag === 'K') cur.keywords.push(v);
  }
  if (cur) items.push(cur);
  return items;
}

</script>

<style scoped>
.lit-page { display: flex; flex-direction: column; height: calc(100vh - 48px); }
.lit-toolbar { display: flex; gap: 8px; padding: 0 0 12px; }
.lit-search { flex: 1; padding: 7px 12px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-input); color: var(--text-primary); font-size: 0.9em; }
.lit-settings { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; margin-bottom: 8px; background: var(--bg-card); border-radius: 6px; font-size: 0.85em; }
.lib-path { color: var(--text-secondary); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lit-body { display: flex; flex: 1; gap: 12px; overflow: hidden; }

/* 按钮 */
.lit-btn { padding: 6px 14px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-card); color: var(--text-primary); cursor: pointer; font-size: 0.85em; }
.lit-btn:hover { background: var(--bg-card-hover); }
.lit-btn.primary { background: var(--accent); color: white; border-color: var(--accent); }
.lit-btn.new-record-btn { background: #e0e0e0; color: #000; border-color: #e0e0e0; }
.lit-btn.danger { background: #e74c3c; color: white; border-color: #e74c3c; }
.lit-btn.active { background: var(--accent-bg); border-color: var(--accent); }
.lit-btn-sm { padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-primary); cursor: pointer; font-size: 0.8em; }
.lit-btn-sm:hover { background: var(--bg-card-hover); }
.lit-btn-xs { padding: 2px 8px; border: 1px solid var(--border-color); border-radius: 3px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 0.75em; }
.lit-btn-xs:hover { background: var(--bg-card-hover); }
.lit-btn-xs.danger:hover { color: #e74c3c; border-color: #e74c3c; }
.lit-btn-icon { width: 24px; height: 24px; border: none; background: none; color: var(--text-secondary); cursor: pointer; font-size: 1.1em; border-radius: 4px; }
.lit-btn-icon:hover { background: var(--bg-card-hover); color: var(--text-primary); }
.lit-btn-icon.small { width: 20px; height: 20px; font-size: 0.9em; }

/* 文件夹侧边栏 */
.lit-sidebar { flex-shrink: 0; background: var(--bg-card); border-radius: 8px; overflow-y: auto; }
.folder-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; font-weight: 600; font-size: 0.85em; color: var(--text-secondary); border-bottom: 1px solid var(--border-light); }
.folder-item { display: flex; align-items: center; gap: 4px; padding: 7px 12px; cursor: pointer; font-size: 0.85em; color: var(--text-primary); transition: background 0.1s; }
.folder-item:hover { background: var(--bg-card-hover); }
.folder-item.active { background: var(--accent-bg); font-weight: 600; }
.folder-item.sub { padding-left: 28px; }
.folder-divider { border-top: 1px solid var(--border-light); margin: 6px 8px; }
.trash-item { color: var(--text-muted); font-size: 0.82em; }
.trash-count { font-size: 0.85em; color: var(--text-muted); }
.rename-input { flex: 1; padding: 2px 4px; border: 1px solid var(--accent); border-radius: 3px; font-size: inherit; background: var(--bg-input); color: var(--text-primary); }

/* 拖拽分隔条 */
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
  border-radius: 2px;
}
.resize-handle:hover { background: var(--accent); }

/* 列拖拽手柄 */
.col-resizer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 1;
  border-right: 2px dashed #ccc;
}
.col-resizer:hover { background: var(--accent); border-right-color: var(--accent); }
.ref-table-header span { position: relative; }

/* 题录列表 */
.lit-main { flex: 1; overflow-y: auto; overflow-x: auto; }
.ref-list-header { display: flex; justify-content: space-between; align-items: center; padding: 0 0 8px; font-size: 0.85em; color: var(--text-secondary); }

/* 表格布局 */
.ref-table-header {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  background: var(--bg-card);
  border-radius: 6px 6px 0 0;
  border-bottom: 2px solid var(--border-color);
  font-size: 0.85em;
  font-weight: 400;
  color: var(--text-primary);
  gap: 4px;
}
.ref-row {
  display: flex;
  align-items: center;
  padding: 8px 8px;
  border-bottom: 1px solid var(--border-light);
  font-size: 0.9em;
  cursor: pointer;
  transition: background 0.1s;
  gap: 4px;
}
.ref-row:hover { background: var(--bg-card-hover); }
.ref-row.active { background: var(--accent-bg); border-left: 3px solid var(--accent); }
.ref-row.checked { background: rgba(99, 102, 241, 0.08); }

.col-check { width: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.col-check input[type="checkbox"] { cursor: pointer; }
.col-year { width: 46px; flex-shrink: 0; }
.col-author { width: 110px; flex-shrink: 1; min-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-title { width: 200px; flex-shrink: 1; min-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; position: relative; }
.col-journal { width: 120px; flex-shrink: 1; min-width: 40px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-rnote { width: 110px; flex-shrink: 1; min-width: 30px; overflow: visible; position: relative; }
.col-note { width: 120px; flex-shrink: 1; min-width: 30px; overflow: visible; position: relative; }
.col-doi { width: 50px; flex-shrink: 0; text-align: center; }
.col-pdf { width: 65px; flex-shrink: 0; text-align: center; }
.col-actions { width: 36px; flex-shrink: 0; text-align: center; }

.doi-link { color: var(--accent); text-decoration: none; font-size: 0.85em; }
.doi-link:hover { text-decoration: underline; }

.cell-with-dropdown { display: flex; align-items: center; gap: 2px; position: relative; }
.cell-with-dropdown .rnote-edit-input { flex: 1; min-width: 0; }
.cell-placeholder { opacity: 0.4; cursor: pointer; font-size: 0.85em; padding: 1px 6px; }
.cell-placeholder:hover { opacity: 1; }
.cell-arrow { padding: 1px 3px !important; font-size: 0.6em !important; opacity: 0.5; flex-shrink: 0; }
.cell-arrow:hover { opacity: 1; }

.rnote-tag { display: inline-block; padding: 1px 6px; background: var(--accent-bg); color: var(--accent); border-radius: 3px; font-size: 0.82em; cursor: pointer; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.rnote-tag:hover { background: var(--accent); color: white; }
.note-title-tag { background: rgba(16, 185, 129, 0.1); color: #10b981; }
.note-title-tag:hover { background: #10b981; color: white; }
.note-green-tag { background: rgba(16, 185, 129, 0.15); color: #10b981; }
.note-green-tag:hover { background: #10b981; color: white; }
.note-has { background: var(--accent-bg); cursor: pointer; }
.rnote-edit-input { width: 80px; padding: 1px 4px; border: 1px solid var(--accent); border-radius: 3px; font-size: 0.85em; background: var(--bg-input); color: var(--text-primary); outline: none; }
.note-btn { background: var(--accent-bg) !important; color: var(--accent) !important; border-color: var(--accent) !important; }
.add-btn { opacity: 0.5; }
.add-btn:hover { opacity: 1; }
.pdf-btn { background: #10b98120 !important; color: #10b981 !important; border-color: #10b981 !important; }
.doi-btn { background: #10b98120 !important; color: #10b981 !important; border-color: #10b981 !important; }
.pdf-arrow { padding: 2px 3px !important; font-size: 0.65em !important; }

.ref-empty { text-align: center; padding: 40px; color: var(--text-muted); font-size: 0.9em; }

/* 弹窗 */
.modal-overlay { position: fixed; inset: 0; background: var(--overlay-bg); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal-box { background: var(--bg-card); border-radius: 10px; padding: 24px; width: 520px; max-height: 80vh; overflow-y: auto; box-shadow: 0 8px 32px rgba(0,0,0,0.2); }
.modal-box h3 { margin-bottom: 16px; font-size: 1.1em; color: var(--text-primary); }
.form-grid { display: grid; grid-template-columns: 60px 1fr; gap: 8px; align-items: center; }
.form-grid label { font-size: 0.82em; color: var(--text-secondary); text-align: right; }
.form-grid input, .form-grid select, .form-grid textarea { padding: 6px 8px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 0.85em; background: var(--bg-input); color: var(--text-primary); }
.form-grid textarea { grid-column: 2; resize: vertical; }
.form-footer { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }
.import-hint { font-size: 0.85em; color: var(--text-muted); margin-bottom: 12px; }
.import-result { margin-top: 12px; padding: 8px; background: var(--bg-success); border-radius: 4px; font-size: 0.85em; }

/* 右键菜单 */
.ctx-menu { position: fixed; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: var(--shadow-hover); z-index: 200; min-width: 100px; }
.ctx-item { padding: 7px 14px; cursor: pointer; font-size: 0.85em; color: var(--text-primary); }
.ctx-item:hover { background: var(--bg-card-hover); }
.ctx-item.danger { color: #e74c3c; }

/* 设置面板 */
.settings-row { display: flex; align-items: center; gap: 8px; }
.settings-input { flex: 1; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 0.9em; background: var(--bg-input); color: var(--text-primary); box-sizing: border-box; }
.settings-input:focus { outline: none; border-color: var(--accent); }
.settings-section-label { font-weight: 600; font-size: 0.85em; color: var(--text-primary); margin-bottom: 2px; }
.settings-divider { border-top: 1px solid var(--border-color); margin: 4px 0; }
.settings-hint { color: var(--text-muted); font-size: 0.8em; }
.settings-hint a { color: var(--accent); text-decoration: underline; cursor: pointer; }

/* 笔记面板 */
.lit-notes { width: 320px; flex-shrink: 0; background: var(--bg-card); border-radius: 8px; display: flex; flex-direction: column; overflow: hidden; }
.notes-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; font-weight: 600; font-size: 0.82em; color: var(--text-secondary); border-bottom: 1px solid var(--border-light); }
.notes-list { border-bottom: 1px solid var(--border-light); max-height: 140px; overflow-y: auto; }
.note-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; cursor: pointer; font-size: 0.82em; color: var(--text-primary); border-bottom: 1px solid var(--border-light); }
.note-item:hover { background: var(--bg-card-hover); }
.note-item.active { background: var(--accent-bg); font-weight: 600; }
.note-preview { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note-del { font-size: 0.8em; opacity: 0.5; cursor: pointer; }
.note-del:hover { opacity: 1; color: #e74c3c; }
.notes-editor { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
.editor-toolbar { display: flex; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--border-light); align-items: center; }
.editor-toolbar button { padding: 2px 8px; border: 1px solid var(--border-color); border-radius: 3px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 0.78em; }
.editor-toolbar button.active { background: var(--accent-bg); color: var(--accent); border-color: var(--accent); }
.tiptap-content { flex: 1; overflow-y: auto; padding: 10px 12px; font-size: 0.85em; }
.tiptap-content :deep(.ProseMirror) { outline: none; min-height: 100px; }
.tiptap-content :deep(.ProseMirror p) { margin: 0.3em 0; }

/* 导出 */
.export-textarea { width: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-input); color: var(--text-primary); font-size: 0.82em; font-family: monospace; resize: vertical; box-sizing: border-box; }

/* AI 结果 */
.ai-results { max-height: 300px; overflow-y: auto; }
.ai-result-item { padding: 8px 10px; margin-bottom: 4px; background: var(--bg-input); border-radius: 6px; display: flex; flex-direction: column; gap: 4px; }
.ai-result-item .lit-btn-xs { align-self: flex-start; }

/* 引用样式面板 */
.style-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.style-item { padding: 6px 12px; border: 1px solid var(--border-color); border-radius: 6px; cursor: pointer; font-size: 0.82em; display: flex; align-items: center; gap: 6px; background: var(--bg-card); }
.style-item:hover { background: var(--bg-card-hover); }
.style-item.active { border-color: var(--accent); background: var(--accent-bg); }
.style-name { font-weight: 500; }
.style-badge { font-size: 0.7em; padding: 1px 5px; background: var(--bg-tag); border-radius: 3px; color: var(--text-muted); }
.style-preview { padding: 10px 12px; background: var(--bg-input); border-radius: 6px; margin: 8px 0; font-size: 0.82em; }
.style-preview .preview-label { color: var(--text-muted); margin: 4px 0 2px; font-size: 0.85em; }
.style-preview code { display: block; padding: 4px 8px; background: var(--bg-card); border-radius: 4px; font-size: 0.9em; color: var(--text-primary); word-break: break-all; }
.lit-btn-sm.primary { background: var(--accent); color: white; border-color: var(--accent); }

/* PDF 下拉菜单 */
.pdf-dropdown { position: relative; display: inline-flex; gap: 1px; }
.move-to-dropdown { position: relative; display: inline-block; }
.move-to-menu { position: absolute; top: 100%; left: 0; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: var(--shadow-hover); z-index: 50; min-width: 150px; margin-top: 4px; max-height: 240px; overflow-y: auto; }
.pdf-dropdown-menu { position: absolute; top: 100%; right: 0; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 6px; box-shadow: var(--shadow-hover); z-index: 50; min-width: 130px; margin-top: 2px; }
.pdf-dropdown-item { padding: 6px 12px; cursor: pointer; font-size: 0.8em; color: var(--text-primary); white-space: nowrap; }
.pdf-dropdown-item:hover { background: var(--bg-card-hover); }
.pdf-dropdown-item:first-child { border-radius: 6px 6px 0 0; }
.pdf-dropdown-item:last-child { border-radius: 0 0 6px 6px; }

/* AI 总结结果 */
.ai-summary-box { padding: 8px 12px; border-bottom: 1px solid var(--border-light); background: var(--accent-bg); font-size: 0.82em; }
.ai-summary-label { font-weight: 600; color: var(--text-secondary); margin: 4px 0 2px; font-size: 0.85em; }
.ai-summary-text { color: var(--text-primary); line-height: 1.4; }
.ai-summary-tag { display: inline-block; padding: 2px 8px; background: var(--accent); color: white; border-radius: 4px; font-size: 0.9em; }
</style>
