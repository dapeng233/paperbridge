<template>
  <div class="note-editor-page" :class="{ pinned: isPinned }">
    <div class="ne-header">
      <input v-if="editingTitle" v-model="noteTitleEdit" class="ne-title-input"
        @blur="saveTitle" @keyup.enter="saveTitle" @keyup.escape="editingTitle = false"
        placeholder="笔记标题..." />
      <span v-else class="ne-title" @dblclick="startEditTitle">{{ noteTitle || refTitle || '笔记' }}</span>
      <div class="ne-actions">
        <button class="ne-btn" :class="{ active: isPinned }" @click="togglePin" :title="isPinned ? '取消置顶' : '置顶窗口'">
          {{ isPinned ? '📌' : '📍' }}
        </button>
        <button class="ne-btn primary" @click="saveNote" :disabled="!hasContent">保存</button>
      </div>
    </div>
    <div class="ne-toolbar">
      <button @click="editor?.chain().focus().toggleBold().run()" :class="{ active: editor?.isActive('bold') }">B</button>
      <button @click="editor?.chain().focus().toggleItalic().run()" :class="{ active: editor?.isActive('italic') }">I</button>
      <button @click="editor?.chain().focus().toggleBulletList().run()" :class="{ active: editor?.isActive('bulletList') }">List</button>
      <button @click="editor?.chain().focus().toggleOrderedList().run()" :class="{ active: editor?.isActive('orderedList') }">1.</button>
      <button @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()" :class="{ active: editor?.isActive('heading', { level: 3 }) }">H3</button>
      <button @click="editor?.chain().focus().toggleBlockquote().run()" :class="{ active: editor?.isActive('blockquote') }">"</button>
      <div class="ne-spacer"></div>
      <button class="ne-ai-btn" @click="doAISummary" :disabled="aiLoading" title="AI 总结文献笔记">
        {{ aiLoading ? '...' : 'AI' }}
      </button>
      <button class="ne-test-btn" @click="testAIApi" title="测试 API 连接">Test</button>
      <span class="ne-status">{{ saveStatus }}</span>
    </div>
    <!-- AI 总结结果 -->
    <div v-if="aiResult" class="ne-ai-result">
      <div class="ne-ai-label">AI 笔记摘要：</div>
      <div class="ne-ai-text">{{ aiResult.notes_summary }}</div>
      <div class="ne-ai-label">短标签：</div>
      <div class="ne-ai-tag">{{ aiResult.research_note }}</div>
      <div class="ne-ai-actions">
        <button class="ne-btn" @click="appendSummaryToNote">追加到笔记</button>
        <button class="ne-btn" @click="aiResult = null">关闭</button>
      </div>
    </div>
    <div class="ne-editor-area">
      <editor-content :editor="editor" class="ne-tiptap" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed } from 'vue';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';

const API = '/api/literature';
const api = (path, opts) => fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(r => r.json());

const refId = new URLSearchParams(window.location.search).get('refId');
const refTitle = ref('');
const noteTitle = ref('');
const noteId = ref(null);
const isPinned = ref(true);
const saveStatus = ref('');
const editingTitle = ref(false);
const noteTitleEdit = ref('');
const aiLoading = ref(false);
const aiResult = ref(null);
let dirty = false;
let autoSaveTimer = null;

// AI settings
const aiApiKey = ref('');
const aiBaseUrl = ref('');
const aiModel = ref('');

const editor = useEditor({ extensions: [StarterKit], content: '', onUpdate: () => {
  dirty = true;
  saveStatus.value = '未保存';
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => saveNote(), 3000);
}});

const hasContent = computed(() => {
  if (!editor.value) return false;
  return editor.value.getHTML() !== '<p></p>' && editor.value.getHTML() !== '';
});

onBeforeUnmount(() => {
  editor.value?.destroy();
  clearTimeout(autoSaveTimer);
});

onMounted(async () => {
  if (!refId) return;
  const r = await api('/refs/' + refId);
  refTitle.value = r.title || '';
  noteTitle.value = r.note_title || '';
  document.title = '笔记 - ' + (noteTitle.value || refTitle.value);
  await loadNote();
  await loadAISettings();
});

async function loadNote() {
  const notes = await api('/refs/' + refId + '/notes');
  if (notes.length) {
    noteId.value = notes[0].id;
    editor.value?.commands.setContent(notes[0].content || '');
    dirty = false;
    saveStatus.value = '';
  } else {
    const n = await api('/refs/' + refId + '/notes', { method: 'POST', body: JSON.stringify({ content: '' }) });
    noteId.value = n.id;
    editor.value?.commands.setContent('');
    dirty = false;
  }
}

async function loadAISettings() {
  const k = await api('/settings/ai_api_key');
  const u = await api('/settings/ai_base_url');
  const m = await api('/settings/ai_model');
  aiApiKey.value = k.value || '';
  aiBaseUrl.value = u.value || '';
  aiModel.value = m.value || '';
}

async function saveNote() {
  if (!noteId.value || !dirty) return;
  const html = editor.value?.getHTML() ?? '';
  await api('/notes/' + noteId.value, { method: 'PUT', body: JSON.stringify({ content: html }) });
  dirty = false;
  saveStatus.value = '已保存';
  setTimeout(() => { if (!dirty) saveStatus.value = ''; }, 2000);
}

// 笔记标题编辑
function startEditTitle() {
  editingTitle.value = true;
  noteTitleEdit.value = noteTitle.value;
}

async function saveTitle() {
  const val = noteTitleEdit.value.trim().substring(0, 30);
  if (val !== noteTitle.value) {
    await api('/refs/' + refId, { method: 'PUT', body: JSON.stringify({ note_title: val }) });
    noteTitle.value = val;
    document.title = '笔记 - ' + (val || refTitle.value);
  }
  editingTitle.value = false;
}

// AI 总结
async function doAISummary() {
  if (!aiApiKey.value) { alert('请先在主界面设置中配置 AI API Key'); return; }
  aiLoading.value = true;
  aiResult.value = null;
  try {
    const res = await api('/refs/' + refId + '/ai-summary', {
      method: 'POST',
      body: JSON.stringify({ api_key: aiApiKey.value, base_url: aiBaseUrl.value, model: aiModel.value })
    });
    if (res.error) { alert('AI 总结失败: ' + res.error); return; }
    aiResult.value = res;
  } catch (e) { alert('AI 总结失败: ' + e.message); }
  aiLoading.value = false;
}

function appendSummaryToNote() {
  if (!aiResult.value || !editor.value) return;
  const html = `<p><strong>AI 摘要：</strong></p><p>${aiResult.value.notes_summary}</p><p><strong>短标签：</strong>${aiResult.value.research_note}</p><hr>`;
  editor.value.chain().focus().insertContent(html).run();
  dirty = true;
  saveStatus.value = '未保存';
  aiResult.value = null;
}

// 测试 API
async function testAIApi() {
  if (!aiApiKey.value) { alert('未配置 AI API Key，请先在主界面设置中配置'); return; }
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

function togglePin() {
  isPinned.value = !isPinned.value;
  if (window.electronAPI?.setAlwaysOnTop) {
    window.electronAPI.setAlwaysOnTop(isPinned.value);
  }
}
</script>

<style scoped>
.note-editor-page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary, #1a1a2e);
  color: var(--text-primary, #e0e0e0);
  font-family: system-ui, -apple-system, sans-serif;
}
.ne-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-card, #252540);
  border-bottom: 1px solid var(--border-color, #3a3a5c);
  -webkit-app-region: drag;
}
.ne-title {
  font-weight: 600;
  font-size: 0.88em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
  cursor: default;
}
.ne-title-input {
  flex: 1;
  margin-right: 8px;
  padding: 2px 6px;
  border: 1px solid var(--accent, #6366f1);
  border-radius: 4px;
  background: var(--bg-input, #1e1e36);
  color: var(--text-primary, #e0e0e0);
  font-size: 0.88em;
  font-weight: 600;
  outline: none;
  -webkit-app-region: no-drag;
}
.ne-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  -webkit-app-region: no-drag;
}
.ne-btn {
  padding: 3px 10px;
  border: 1px solid var(--border-color, #3a3a5c);
  border-radius: 4px;
  background: var(--bg-card, #252540);
  color: var(--text-primary, #e0e0e0);
  cursor: pointer;
  font-size: 0.8em;
}
.ne-btn:hover { background: var(--bg-card-hover, #2f2f50); }
.ne-btn.active { background: var(--accent-bg, rgba(99, 102, 241, 0.15)); border-color: var(--accent, #6366f1); }
.ne-btn.primary { background: var(--accent, #6366f1); color: white; border-color: var(--accent, #6366f1); }
.ne-btn.primary:disabled { opacity: 0.5; cursor: default; }
.ne-toolbar {
  display: flex;
  gap: 3px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--border-light, #2a2a45);
  background: var(--bg-card, #252540);
  align-items: center;
}
.ne-toolbar button {
  padding: 2px 7px;
  border: 1px solid var(--border-color, #3a3a5c);
  border-radius: 3px;
  background: transparent;
  color: var(--text-secondary, #a0a0b8);
  cursor: pointer;
  font-size: 0.78em;
}
.ne-toolbar button:hover { background: var(--bg-card-hover, #2f2f50); }
.ne-toolbar button.active { background: var(--accent-bg); color: var(--accent, #6366f1); border-color: var(--accent); }
.ne-ai-btn { background: rgba(245, 158, 11, 0.1) !important; color: #f59e0b !important; border-color: #f59e0b !important; font-weight: 600; }
.ne-ai-btn:hover { background: #f59e0b !important; color: white !important; }
.ne-ai-btn:disabled { opacity: 0.5; cursor: default; }
.ne-test-btn { background: rgba(16, 185, 129, 0.1) !important; color: #10b981 !important; border-color: #10b981 !important; }
.ne-test-btn:hover { background: #10b981 !important; color: white !important; }
.ne-spacer { flex: 1; }
.ne-status { font-size: 0.72em; color: var(--text-muted, #7a7a98); margin-left: 4px; }
.ne-ai-result {
  padding: 8px 12px;
  background: rgba(245, 158, 11, 0.05);
  border-bottom: 1px solid rgba(245, 158, 11, 0.2);
  font-size: 0.85em;
}
.ne-ai-label { font-weight: 600; color: #f59e0b; margin-top: 4px; font-size: 0.82em; }
.ne-ai-text { margin: 2px 0 6px; line-height: 1.5; }
.ne-ai-tag { display: inline-block; padding: 2px 8px; background: var(--accent-bg); color: var(--accent); border-radius: 3px; font-size: 0.88em; margin: 2px 0; }
.ne-ai-actions { display: flex; gap: 6px; margin-top: 6px; }
.ne-editor-area { flex: 1; overflow: hidden; display: flex; flex-direction: column; }
.ne-tiptap { flex: 1; overflow-y: auto; padding: 12px 14px; font-size: 0.88em; }
.ne-tiptap :deep(.ProseMirror) { outline: none; min-height: 200px; }
.ne-tiptap :deep(.ProseMirror p) { margin: 0.3em 0; }
.ne-tiptap :deep(.ProseMirror h3) { margin: 0.8em 0 0.3em; font-size: 1.1em; }
.ne-tiptap :deep(.ProseMirror ul), .ne-tiptap :deep(.ProseMirror ol) { padding-left: 1.4em; }
.ne-tiptap :deep(.ProseMirror blockquote) { border-left: 3px solid var(--accent, #6366f1); padding-left: 12px; color: var(--text-secondary); margin: 0.5em 0; }
</style>
