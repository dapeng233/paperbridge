<template>
  <div class="lit-page">
    <!-- 顶部工具栏 -->
    <div class="lit-toolbar">
      <input v-model="searchQuery" placeholder="搜索题录..." class="lit-search" @input="onSearch" />
      <button class="lit-btn" @click="showImport = true">导入</button>
      <button class="lit-btn" @click="showExport = true; doExport()">导出</button>
      <button class="lit-btn" @click="showStylePanel = !showStylePanel">引用样式</button>
      <button class="lit-btn" @click="showSettings = !showSettings">设置</button>
    </div>

    <!-- 设置面板 -->
    <div v-if="showSettings" class="lit-settings">
      <div class="settings-row">
        <label>文献库路径：</label>
        <span class="lib-path">{{ libraryPath || '未设置' }}</span>
        <button class="lit-btn-sm" @click="selectLibraryPath">选择目录</button>
      </div>
    </div>

    <div class="lit-body">
      <!-- 左侧：文件夹树 -->
      <aside class="lit-sidebar">
        <div class="folder-header">
          <span>文件夹</span>
          <button class="lit-btn-icon" @click="addFolder(null)" title="新建文件夹">+</button>
        </div>
        <div class="folder-item" :class="{ active: !selectedFolder }" @click="selectedFolder = null">
          全部题录
        </div>
        <template v-for="f in rootFolders" :key="f.id">
          <div class="folder-item" :class="{ active: selectedFolder === f.id }"
            @click="selectedFolder = f.id" @dblclick="startRename(f)" @contextmenu.prevent="folderMenu(f)">
            <span v-if="renamingId !== f.id">{{ f.name }}</span>
            <input v-else v-model="renameValue" class="rename-input" @blur="finishRename(f)" @keyup.enter="finishRename(f)" ref="renameInput" />
            <button class="lit-btn-icon small" @click.stop="addFolder(f.id)" title="新建子文件夹">+</button>
          </div>
          <div v-for="c in getChildren(f.id)" :key="c.id" class="folder-item sub"
            :class="{ active: selectedFolder === c.id }"
            @click="selectedFolder = c.id" @dblclick="startRename(c)" @contextmenu.prevent="folderMenu(c)">
            <span v-if="renamingId !== c.id">{{ c.name }}</span>
            <input v-else v-model="renameValue" class="rename-input" @blur="finishRename(c)" @keyup.enter="finishRename(c)" />
          </div>
        </template>
      </aside>

      <!-- 中间：题录列表 -->
      <div class="lit-main">
        <div class="ref-list">
          <div class="ref-list-header">
            <span>{{ filteredRefs.length }} 条题录</span>
            <button class="lit-btn-sm" @click="openEditor(null)">+ 新建</button>
          </div>
          <div v-for="r in filteredRefs" :key="r.id" class="ref-item" :class="{ active: selectedRef?.id === r.id }" @click="selectedRef = r">
            <div class="ref-title">{{ r.title || '无标题' }}</div>
            <div class="ref-meta">{{ formatAuthors(r.authors) }} · {{ r.year || '?' }} · {{ r.journal }}</div>
            <div class="ref-actions">
              <button class="lit-btn-xs primary-xs" @click.stop="insertToWord(r)" title="插入到Word">Insert</button>
              <button v-if="r.pdf_filename" class="lit-btn-xs" @click.stop="copyPdf(r)" title="复制PDF路径">复制PDF</button>
              <button v-if="r.pdf_filename" class="lit-btn-xs" @click.stop="openPdf(r)" title="打开PDF位置">打开</button>
              <button class="lit-btn-xs" @click.stop="showNotes = true" title="笔记">笔记</button>
              <button class="lit-btn-xs" @click.stop="openEditor(r)">编辑</button>
              <button class="lit-btn-xs danger" @click.stop="deleteRefItem(r)">删除</button>
            </div>
          </div>
          <div v-if="filteredRefs.length === 0" class="ref-empty">暂无题录</div>
        </div>
      </div>

      <!-- 右侧：笔记面板 -->
      <aside v-if="showNotes && selectedRef" class="lit-notes">
        <div class="notes-header">
          <span>笔记 - {{ selectedRef.title }}</span>
          <div style="display:flex;gap:4px">
            <button class="lit-btn-icon small" @click="addNote" title="新建笔记">+</button>
            <button class="lit-btn-icon small" @click="showNotes = false" title="关闭">x</button>
          </div>
        </div>
        <div v-if="notes.length" class="notes-list">
          <div v-for="n in notes" :key="n.id" class="note-item" :class="{ active: activeNote?.id === n.id }" @click="selectNote(n)">
            <span class="note-preview">{{ notePreview(n) }}</span>
            <span class="note-del" @click.stop="deleteNoteItem(n)">x</span>
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
        <div v-else class="ref-empty">点击 + 新建笔记</div>
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
          </select>
          <button class="lit-btn" @click="copyExportText">复制</button>
        </div>
        <textarea readonly :value="exportText" rows="12" class="export-textarea"></textarea>
        <div class="form-footer">
          <button class="lit-btn" @click="showExport = false">关闭</button>
        </div>
      </div>
    </div>

    <!-- 引用样式面板 -->
    <div v-if="showStylePanel" class="modal-overlay" @click.self="showStylePanel = false">
      <div class="modal-box" style="width:640px">
        <h3>引用样式管理</h3>

        <!-- 已有样式列表 -->
        <div class="style-list">
          <div v-for="s in styles" :key="s.id" class="style-item" :class="{ active: activeStyleId === s.id }" @click="activeStyleId = s.id">
            <span class="style-name">{{ s.name }} <span v-if="s.is_preset" class="style-badge">预设</span></span>
            <button v-if="!s.is_preset" class="lit-btn-xs danger" @click.stop="deleteStyleItem(s)">删除</button>
          </div>
        </div>

        <!-- 样式预览 -->
        <div v-if="activeStyleId" class="style-preview">
          <p class="preview-label">文内引用模板：</p>
          <code>{{ currentStyle?.inline_template }}</code>
          <p class="preview-label">文后引用模板：</p>
          <code>{{ currentStyle?.bibliography_template }}</code>
        </div>

        <hr style="border:none;border-top:1px solid var(--border-color);margin:12px 0"/>

        <!-- AI 生成新样式 -->
        <h4 style="font-size:0.9em;margin-bottom:8px">AI 生成新样式</h4>
        <p class="import-hint">粘贴一段引用样本（包含文内引用和文后引用），AI 将自动分析格式规则</p>
        <textarea v-model="styleAiInput" rows="4" placeholder="例：文内引用 (de Dorlodot et al., 2007) 文后引用 Vaseva II, Qudeimat E... (2018). The plant hormone... Proc Natl Acad Sci USA 115: E4130–E4139" class="export-textarea"></textarea>
        <div style="display:flex;gap:8px;margin:8px 0">
          <button class="lit-btn primary" @click="aiGenerateStyle" :disabled="styleAiLoading">
            {{ styleAiLoading ? '分析中...' : 'AI 分析生成' }}
          </button>
        </div>

        <!-- AI 生成结果预览 -->
        <div v-if="styleAiResult" class="style-preview">
          <p class="preview-label">识别结果：{{ styleAiResult.name }}</p>
          <p class="preview-label">文内：<code>{{ styleAiResult.inline_template }}</code></p>
          <p class="preview-label">文后：<code>{{ styleAiResult.bibliography_template }}</code></p>
          <div style="display:flex;gap:8px;margin-top:8px">
            <input v-model="styleAiSaveName" placeholder="样式名称" class="lit-search" style="flex:1" />
            <button class="lit-btn primary" @click="saveAiStyle">保存为样式</button>
          </div>
        </div>

        <div class="form-footer">
          <button class="lit-btn" @click="showStylePanel = false">关闭</button>
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
const api = (path, opts) => fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(r => r.json());

// 状态
const folders = ref([]);
const refs = ref([]);
const searchQuery = ref('');
const selectedFolder = ref(null);
const selectedRef = ref(null);
const libraryPath = ref('');
const showSettings = ref(false);
const showEditor = ref(false);
const showImport = ref(false);
const importResult = ref('');
const editingRef = ref(null);
const renamingId = ref(null);
const renameValue = ref('');
const ctxMenu = ref(null);

const form = ref({ title: '', authorsStr: '', journal: '', year: null, volume: '', issue: '', pages: '', doi: '', abstract: '', keywordsStr: '', ref_type: 'journal' });

// 笔记
const notes = ref([]);
const activeNote = ref(null);
const showNotes = ref(false);

// 导出
const showExport = ref(false);
const exportFormat = ref('gbt7714');
const exportText = ref('');

// AI 匹配
const aiInput = ref('');
const aiResults = ref([]);
const aiLoading = ref(false);
const aiApiKey = ref('');
const aiBaseUrl = ref('');
const aiModel = ref('');

// 引用样式
const showStylePanel = ref(false);
const styles = ref([]);
const activeStyleId = ref(null);
const styleAiInput = ref('');
const styleAiLoading = ref(false);
const styleAiResult = ref(null);
const styleAiSaveName = ref('');

// 计算属性
const rootFolders = computed(() => folders.value.filter(f => !f.parent_id));
const getChildren = (pid) => folders.value.filter(f => f.parent_id === pid);

const filteredRefs = computed(() => {
  if (searchQuery.value) return refs.value;
  if (!selectedFolder.value) return refs.value;
  return refs.value.filter(r => r.folder_id === selectedFolder.value);
});

// 加载数据
async function loadFolders() { folders.value = await api('/folders'); }
async function loadRefs() {
  if (searchQuery.value) {
    refs.value = await api('/refs?q=' + encodeURIComponent(searchQuery.value));
  } else {
    refs.value = await api('/refs');
  }
}
async function loadSettings() {
  const r = await api('/settings/library_path');
  libraryPath.value = r.value || '';
}

// Tiptap 编辑器
const noteEditor = useEditor({ extensions: [StarterKit], content: '', onUpdate: ({ editor }) => {
  if (activeNote.value) { activeNote.value._dirty = editor.getHTML(); }
}});
onBeforeUnmount(() => { noteEditor.value?.destroy(); });

onMounted(() => { loadFolders(); loadRefs(); loadSettings(); loadAISettings(); loadStyles(); });
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

// 引用样式
const currentStyle = computed(() => styles.value.find(s => s.id === activeStyleId.value));

async function loadStyles() {
  styles.value = await api('/styles');
  if (styles.value.length && !activeStyleId.value) activeStyleId.value = styles.value[0].id;
}

async function deleteStyleItem(s) {
  if (!confirm(`确定删除样式"${s.name}"？`)) return;
  await api('/styles/' + s.id, { method: 'DELETE' });
  loadStyles();
}

async function aiGenerateStyle() {
  if (!styleAiInput.value.trim()) return;
  if (!aiApiKey.value) { alert('请先在「API 配置」中设置 AI API Key'); return; }
  styleAiLoading.value = true;
  styleAiResult.value = null;
  try {
    const res = await api('/styles/ai-generate', {
      method: 'POST',
      body: JSON.stringify({ sample_text: styleAiInput.value, api_key: aiApiKey.value, base_url: aiBaseUrl.value, model: aiModel.value })
    });
    if (res.error) { alert('AI 生成失败: ' + res.error); return; }
    if (!res.inline_template && !res.bibliography_template) { alert('AI 未返回有效的样式模板，请检查 API 配置或重试'); return; }
    styleAiResult.value = res;
    styleAiSaveName.value = res.name || '自定义样式';
  } catch (e) { alert('AI 生成失败: ' + e.message); }
  styleAiLoading.value = false;
}

async function saveAiStyle() {
  if (!styleAiResult.value) return;
  await api('/styles', {
    method: 'POST',
    body: JSON.stringify({
      name: styleAiSaveName.value || '自定义样式',
      inline_template: styleAiResult.value.inline_template,
      bibliography_template: styleAiResult.value.bibliography_template,
      sort_by: styleAiResult.value.sort_by || 'author',
      config: styleAiResult.value.config || {}
    })
  });
  styleAiResult.value = null;
  loadStyles();
  alert('样式已保存');
}

// Insert to Word
async function insertToWord(r) {
  if (!activeStyleId.value) {
    alert('请先在「引用样式」中选择一个样式');
    return;
  }
  try {
    await api('/cite/push', {
      method: 'POST',
      body: JSON.stringify({ ref_ids: [r.id], style_id: activeStyleId.value, type: 'inline' })
    });
    alert('已推送到 Word（请确保 Word 插件已打开）');
  } catch (e) { alert('推送失败: ' + e.message); }
}

// 笔记
async function loadNotes(refId) {
  notes.value = await api('/refs/' + refId + '/notes');
  if (notes.value.length) selectNote(notes.value[0]);
  else activeNote.value = null;
}

function notePreview(n) {
  if (!n.content) return '空笔记';
  return n.content.replace(/<[^>]+>/g, '').substring(0, 40) || '空笔记';
}

function selectNote(n) {
  activeNote.value = n;
  noteEditor.value?.commands.setContent(n.content || '');
}

async function addNote() {
  if (!selectedRef.value) return;
  const n = await api('/refs/' + selectedRef.value.id + '/notes', { method: 'POST', body: JSON.stringify({ content: '' }) });
  notes.value.unshift(n);
  selectNote(n);
}

async function saveNote() {
  if (!activeNote.value) return;
  const html = activeNote.value._dirty ?? noteEditor.value?.getHTML() ?? '';
  await api('/notes/' + activeNote.value.id, { method: 'PUT', body: JSON.stringify({ content: html }) });
  activeNote.value.content = html;
  delete activeNote.value._dirty;
}

async function deleteNoteItem(n) {
  if (!confirm('确定删除此笔记？')) return;
  await api('/notes/' + n.id, { method: 'DELETE' });
  notes.value = notes.value.filter(x => x.id !== n.id);
  if (activeNote.value?.id === n.id) { activeNote.value = null; noteEditor.value?.commands.setContent(''); }
}

// 导出
async function doExport() {
  const ids = filteredRefs.value.map(r => r.id);
  if (!ids.length) { exportText.value = '没有可导出的题录'; return; }
  const res = await api('/export', { method: 'POST', body: JSON.stringify({ ref_ids: ids, format: exportFormat.value }) });
  exportText.value = res.text || res.error || '';
}

function copyExportText() {
  navigator.clipboard.writeText(exportText.value);
  alert('已复制到剪贴板');
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
  await api('/refs', { method: 'POST', body: JSON.stringify({ ...item, folder_id: selectedFolder.value }) });
  loadRefs();
  alert('已导入: ' + item.title);
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

// 文件夹操作
async function addFolder(parentId) {
  await api('/folders', { method: 'POST', body: JSON.stringify({ name: '新建文件夹', parent_id: parentId }) });
  loadFolders();
}

function startRename(f) {
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
  if (selectedFolder.value === f.id) selectedFolder.value = null;
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
    folder_id: selectedFolder.value
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

async function openPdf(r) {
  const res = await api('/refs/' + r.id + '/pdf-path');
  if (res.path && window.electronAPI) window.electronAPI.showInFolder(res.path);
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

// 设置
async function selectLibraryPath() {
  if (window.electronAPI) {
    const dir = await window.electronAPI.selectDirectory();
    if (dir) {
      await api('/settings', { method: 'POST', body: JSON.stringify({ key: 'library_path', value: dir }) });
      libraryPath.value = dir;
    }
  } else {
    const dir = prompt('请输入文献库路径：', libraryPath.value);
    if (dir) {
      await api('/settings', { method: 'POST', body: JSON.stringify({ key: 'library_path', value: dir }) });
      libraryPath.value = dir;
    }
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
  const res = await api('/import-pdfs', { method: 'POST', body: JSON.stringify({ paths: files, folder_id: selectedFolder.value }) });
  if (res.error) { importResult.value = '导入失败: ' + res.error; return; }
  importResult.value = `成功导入 ${res.count} 个 PDF`;
  loadRefs();
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
    const res = await api('/import', { method: 'POST', body: JSON.stringify({ items, folder_id: selectedFolder.value }) });
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
.lit-btn-sm { padding: 4px 10px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-card); color: var(--text-primary); cursor: pointer; font-size: 0.8em; }
.lit-btn-sm:hover { background: var(--bg-card-hover); }
.lit-btn-xs { padding: 2px 8px; border: 1px solid var(--border-color); border-radius: 3px; background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 0.75em; }
.lit-btn-xs:hover { background: var(--bg-card-hover); }
.lit-btn-xs.danger:hover { color: #e74c3c; border-color: #e74c3c; }
.lit-btn-icon { width: 24px; height: 24px; border: none; background: none; color: var(--text-secondary); cursor: pointer; font-size: 1.1em; border-radius: 4px; }
.lit-btn-icon:hover { background: var(--bg-card-hover); color: var(--text-primary); }
.lit-btn-icon.small { width: 20px; height: 20px; font-size: 0.9em; }

/* 文件夹侧边栏 */
.lit-sidebar { width: 200px; flex-shrink: 0; background: var(--bg-card); border-radius: 8px; overflow-y: auto; }
.folder-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; font-weight: 600; font-size: 0.85em; color: var(--text-secondary); border-bottom: 1px solid var(--border-light); }
.folder-item { display: flex; align-items: center; gap: 4px; padding: 7px 12px; cursor: pointer; font-size: 0.85em; color: var(--text-primary); transition: background 0.1s; }
.folder-item:hover { background: var(--bg-card-hover); }
.folder-item.active { background: var(--accent-bg); font-weight: 600; }
.folder-item.sub { padding-left: 28px; }
.rename-input { flex: 1; padding: 2px 4px; border: 1px solid var(--accent); border-radius: 3px; font-size: inherit; background: var(--bg-input); color: var(--text-primary); }

/* 题录列表 */
.lit-main { flex: 1; overflow-y: auto; }
.ref-list-header { display: flex; justify-content: space-between; align-items: center; padding: 0 0 8px; font-size: 0.85em; color: var(--text-secondary); }
.ref-item { padding: 10px 12px; margin-bottom: 6px; background: var(--bg-card); border-radius: 6px; cursor: pointer; transition: box-shadow 0.15s; }
.ref-item:hover { box-shadow: var(--shadow-hover); }
.ref-item.active { border-left: 3px solid var(--accent); }
.ref-title { font-weight: 600; font-size: 0.9em; margin-bottom: 4px; color: var(--text-primary); }
.ref-meta { font-size: 0.78em; color: var(--text-muted); margin-bottom: 6px; }
.ref-actions { display: flex; gap: 6px; }
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
.settings-input { flex: 1; padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-input); color: var(--text-primary); font-size: 0.85em; }

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
.primary-xs { background: var(--accent); color: white !important; border-color: var(--accent) !important; }
.primary-xs:hover { opacity: 0.85; }
</style>
