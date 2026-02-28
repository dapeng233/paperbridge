<template>
  <div class="image-generator">
    <h2 class="page-title">AI 生图 <router-link to="/canvas" class="edit-link">图片编辑</router-link></h2>
    <div class="generator-layout">
      <!-- 左侧：输入面板 -->
      <div class="panel input-panel">
        <h3>生成设置</h3>

        <!-- 使用方式切换 -->
        <div class="form-group">
          <label>使用方式</label>
          <div class="mode-switch">
            <button class="mode-btn" :class="{ active: billingMode === 'google' }" @click="switchMode('google')">Google AI</button>
            <button class="mode-btn" :class="{ active: billingMode === 'dmxapi' }" @click="switchMode('dmxapi')">DMX API</button>
            <button class="mode-btn" :class="{ active: billingMode === 'wallet' }" @click="switchMode('wallet')">余额</button>
          </div>
          <small v-if="billingMode !== 'wallet'">API 密钥请在 <router-link to="/api-config">API 配置</router-link> 中设置</small>
        </div>

        <!-- 余额模式信息 -->
        <div v-if="billingMode === 'wallet'" class="form-group">
          <div class="wallet-info">
            <span class="wallet-balance">余额: ￥{{ walletBalance.toFixed(2) }}</span>
            <span class="wallet-price">每张约 ￥0.3~0.5</span>
            <router-link to="/wallet" class="wallet-link">充值</router-link>
          </div>
        </div>

        <!-- 模型选择 -->
        <div class="form-group">
          <label>选择模型 *</label>
          <select v-model="selectedModel" class="input-field">
            <option v-for="m in models" :key="m.id" :value="m.id">
              {{ m.name }}
            </option>
          </select>
        </div>

        <!-- 生成方式 -->
        <div class="form-group">
          <label>生成方式 *</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" v-model="mode" value="text" /> 文生图
            </label>
            <label class="radio-label">
              <input type="radio" v-model="mode" value="image" /> 图生图
            </label>
          </div>
        </div>

        <!-- 文生图输入 -->
        <div v-if="mode === 'text'" class="form-group">
          <label>提示词 *</label>
          <textarea v-model="prompt" placeholder="描述你想要生成的图片..." class="input-field textarea" rows="4"></textarea>
          <small>支持中文，系统会自动翻译为英文</small>
        </div>

        <!-- 图生图输入 -->
        <div v-if="mode === 'image'" class="form-group">
          <label>上传图片 *</label>
          <div
            class="file-upload-area"
            @click="$refs.fileInput.click()"
            @dragover.prevent="dragOver = true"
            @dragleave="dragOver = false"
            @drop.prevent="handleDrop"
            :class="{ 'drag-over': dragOver }"
          >
            <p>点击选择图片或拖拽到此处</p>
            <small>支持 JPG、PNG、WebP 等格式</small>
          </div>
          <input ref="fileInput" type="file" accept="image/*" style="display:none" @change="handleFileSelect" />
          <div v-if="imagePreview" class="image-preview">
            <img :src="imagePreview" alt="预览" />
          </div>

          <label style="margin-top: 12px">处理提示词 *</label>
          <textarea v-model="imagePrompt" placeholder="描述你想对图片进行的处理..." class="input-field textarea" rows="4"></textarea>
        </div>

        <!-- 生成按钮 -->
        <button class="btn btn-primary" @click="handleGenerate" :disabled="generating">
          {{ generating ? '生成中...' : '生成图片' }}
        </button>
      </div>

      <!-- 右侧：结果面板 -->
      <div class="panel result-panel">
        <div class="tabs">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'result' }"
            @click="activeTab = 'result'"
          >生成结果</button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'history' }"
            @click="activeTab = 'history'; loadHistory()"
          >历史记录</button>
        </div>

        <!-- 结果 -->
        <div v-if="activeTab === 'result'" class="result-area">
          <div v-if="errorMsg" class="error-message">{{ errorMsg }}</div>
          <div v-else-if="result" class="result-content">
            <div class="result-image">
              <img :src="result.imageUrl" alt="生成的图片" />
            </div>
            <div class="result-info">
              <p><strong>模型:</strong> {{ result.model }}</p>
              <p><strong>提示词:</strong> {{ result.prompt }}</p>
              <p v-if="result.cost && result.cost.tokenUsage">
                <strong>Token 消耗:</strong>
                输入 {{ result.cost.tokenUsage.input || '-' }} / 输出 {{ result.cost.tokenUsage.output || '-' }}
              </p>
              <p v-else-if="result.cost">
                <strong>Token 消耗:</strong> {{ result.cost.description }}
              </p>
            </div>
            <div class="result-actions">
              <a :href="result.imageUrl" download="generated-image.png" class="btn btn-secondary">下载图片</a>
              <a :href="result.imageUrl" target="_blank" class="btn btn-secondary">新标签页打开</a>
              <router-link :to="'/canvas?image=' + encodeURIComponent(result.imageUrl)" class="btn btn-secondary">编辑图片</router-link>
            </div>
            <div v-if="result.walletInfo" class="wallet-deduct-info">
              本次扣费 ￥{{ result.walletInfo.charged }} · 剩余余额 ￥{{ result.walletInfo.balance.toFixed(2) }}
            </div>
          </div>
          <div v-else-if="generating" class="empty-state">
            <p>{{ statusText }}</p>
          </div>
          <div v-else class="empty-state">
            <p>填写左侧表单并点击「生成图片」</p>
          </div>
        </div>

        <!-- 历史记录 -->
        <div v-if="activeTab === 'history'" class="history-area">
          <div v-if="history.length === 0" class="empty-state">
            <p>暂无历史记录</p>
          </div>
          <div v-else class="history-list">
            <div
              v-for="(item, idx) in history"
              :key="idx"
              class="history-item"
              @click="viewHistoryItem(item)"
            >
              <img :src="item.imageUrl" alt="缩略图" class="history-thumb" />
              <div class="history-info">
                <p class="history-prompt">{{ item.prompt }}</p>
                <p class="history-meta">{{ item.model }} · {{ formatTime(item.timestamp) }}</p>
              </div>
            </div>
          </div>
          <button v-if="history.length > 0" class="btn btn-secondary" @click="clearHistory">清空历史</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/utils/api';

const route = useRoute();

const googleApiKey = ref('');
const googleProxy = ref('');
const dmxapiKey = ref('');
const billingMode = ref('google');
const walletBalance = ref(0);
const selectedModel = ref('');
const mode = ref('text');
const prompt = ref('');
const imagePrompt = ref('');
const models = ref([]);
const generating = ref(false);
const result = ref(null);
const errorMsg = ref('');
const activeTab = ref('result');
const history = ref([]);
const statusText = ref('生成中...');
const dragOver = ref(false);
const imagePreview = ref('');
const selectedFile = ref(null);

onMounted(() => {
  loadApiConfig();
  loadModels();
  loadWalletBalance();
  if (route.query.from === 'canvas') {
    const dataUrl = sessionStorage.getItem('canvasImage');
    if (dataUrl) {
      mode.value = 'image';
      imagePreview.value = dataUrl;
      fetch(dataUrl).then(r => r.blob()).then(blob => {
        selectedFile.value = new File([blob], 'canvas_edit.png', { type: 'image/png' });
      });
      sessionStorage.removeItem('canvasImage');
    }
  }
});

async function loadWalletBalance() {
  try {
    const data = await api.get('/api/wallet/balance');
    walletBalance.value = data.balance || 0;
  } catch (e) {
    console.error('加载余额失败:', e);
  }
}

async function loadApiConfig() {
  try {
    const [gk, gp, dk] = await Promise.all([
      api.get('/api/literature/settings/google_api_key'),
      api.get('/api/literature/settings/google_proxy'),
      api.get('/api/literature/settings/dmx_api_key')
    ]);
    googleApiKey.value = gk.value || '';
    googleProxy.value = gp.value || '';
    dmxapiKey.value = dk.value || '';
  } catch {}
}

async function loadModels() {
  try {
    const provider = billingMode.value === 'google' ? 'google' : 'wallet';
    const data = await api.get(`/api/models?provider=${provider}`);
    models.value = data;
    if (data.length > 0) selectedModel.value = data[0].id;
  } catch (e) {
    console.error('加载模型失败:', e);
  }
}

function switchMode(newMode) {
  billingMode.value = newMode;
  loadModels();
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedFile.value = file;
  const reader = new FileReader();
  reader.onload = (ev) => { imagePreview.value = ev.target.result; };
  reader.readAsDataURL(file);
}

function handleDrop(e) {
  dragOver.value = false;
  const file = e.dataTransfer.files[0];
  if (file) {
    selectedFile.value = file;
    const reader = new FileReader();
    reader.onload = (ev) => { imagePreview.value = ev.target.result; };
    reader.readAsDataURL(file);
  }
}

function compressImage(file, maxWidth = 1024, quality = 0.8) {
  return new Promise((resolve) => {
    if (file.size < 500 * 1024) { resolve(file); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function handleGenerate() {
  if (billingMode.value === 'dmxapi' && !dmxapiKey.value.trim()) { errorMsg.value = '请先在「API 配置」中设置 DMX API 密钥'; return; }
  if (billingMode.value === 'google' && !googleApiKey.value.trim()) { errorMsg.value = '请先在「API 配置」中设置 Google API Key'; return; }
  if (billingMode.value === 'wallet' && walletBalance.value < 0.35) { errorMsg.value = '余额不足，请先充值'; return; }
  if (!selectedModel.value) { errorMsg.value = '请选择模型'; return; }

  if (mode.value === 'text') {
    if (!prompt.value.trim()) { errorMsg.value = '请输入提示词'; return; }
    await generateTextToImage();
  } else {
    if (!selectedFile.value) { errorMsg.value = '请上传图片'; return; }
    if (!imagePrompt.value.trim()) { errorMsg.value = '请输入处理提示词'; return; }
    await generateImageToImage();
  }
}

async function generateTextToImage() {
  generating.value = true;
  result.value = null;
  errorMsg.value = '';
  activeTab.value = 'result';
  statusText.value = '正在生成图片...';
  try {
    const body = { model: selectedModel.value, prompt: prompt.value };
    if (billingMode.value === 'google') {
      body.provider = 'google';
      body.googleApiKey = googleApiKey.value;
      if (googleProxy.value.trim()) body.proxyUrl = googleProxy.value.trim();
    } else if (billingMode.value === 'dmxapi') {
      body.provider = 'dmxapi_key';
      body.apiKey = dmxapiKey.value;
    } else {
      body.provider = 'wallet';
      body.useWallet = true;
    }
    const data = await api.post('/api/text-to-image', body);
    result.value = data;
    if (data.walletInfo) walletBalance.value = data.walletInfo.balance;
  } catch (e) {
    errorMsg.value = e.message;
  } finally {
    generating.value = false;
  }
}

async function generateImageToImage() {
  generating.value = true;
  result.value = null;
  errorMsg.value = '';
  activeTab.value = 'result';
  statusText.value = '正在压缩图片并上传...';
  try {
    const compressed = await compressImage(selectedFile.value);
    statusText.value = '图片已上传，等待 API 生成中...';
    const formData = new FormData();
    formData.append('model', selectedModel.value);
    formData.append('prompt', imagePrompt.value);
    formData.append('image', compressed);
    if (billingMode.value === 'google') {
      formData.append('provider', 'google');
      formData.append('googleApiKey', googleApiKey.value);
      if (googleProxy.value.trim()) formData.append('proxyUrl', googleProxy.value.trim());
    } else if (billingMode.value === 'dmxapi') {
      formData.append('provider', 'dmxapi_key');
      formData.append('apiKey', dmxapiKey.value);
    } else {
      formData.append('provider', 'wallet');
      formData.append('useWallet', 'true');
    }
    const data = await api.postForm('/api/image-to-image', formData);
    result.value = data;
    if (data.walletInfo) walletBalance.value = data.walletInfo.balance;
  } catch (e) {
    errorMsg.value = e.message;
  } finally {
    generating.value = false;
  }
}

async function loadHistory() {
  try {
    const data = await api.get('/api/history');
    history.value = data;
  } catch (e) {
    console.error('加载历史失败:', e);
  }
}

function viewHistoryItem(item) {
  result.value = item;
  errorMsg.value = '';
  activeTab.value = 'result';
}

async function clearHistory() {
  if (!confirm('确定要清除所有历史记录吗？')) return;
  try {
    await api.delete('/api/history');
    history.value = [];
  } catch (e) {
    alert('清除失败: ' + e.message);
  }
}

function formatTime(ts) {
  return new Date(ts).toLocaleString();
}
</script>

<style scoped>
.page-title {
  font-size: 1.3em;
  color: var(--text-primary);
  margin-bottom: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 12px;
}
.edit-link {
  font-size: 0.55em;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 400;
}
.edit-link:hover { background: var(--bg-card-hover); color: var(--text-primary); }

.generator-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.panel {
  background: var(--bg-card);
  border-radius: 8px;
  padding: 20px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
}

.panel h3 {
  font-size: 1em;
  margin-bottom: 14px;
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}

.form-group {
  margin-bottom: 14px;
}

.form-group label {
  display: block;
  margin-bottom: 4px;
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9em;
}

.form-group small {
  display: block;
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 0.8em;
}

.form-group small a {
  color: var(--text-secondary);
  text-decoration: underline;
}

.input-field {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.9em;
  transition: border-color 0.2s;
  font-family: inherit;
  background: var(--bg-input);
  color: var(--text-primary);
}

.input-field:focus {
  outline: none;
  border-color: var(--accent);
}

.textarea {
  resize: vertical;
  min-height: 72px;
}

.radio-group {
  display: flex;
  gap: 16px;
}

.radio-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  gap: 5px;
  color: var(--text-primary);
  font-size: 0.9em;
}

.radio-label input[type="radio"] {
  width: 14px;
  height: 14px;
  cursor: pointer;
}

.file-upload-area {
  border: 1px dashed var(--border-color);
  border-radius: 6px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-upload);
}

.file-upload-area:hover, .file-upload-area.drag-over {
  background: var(--bg-card-hover);
  border-color: var(--accent);
}

.file-upload-area p {
  color: var(--text-secondary);
  font-size: 0.9em;
  margin-bottom: 2px;
}

.image-preview {
  margin-top: 10px;
  text-align: center;
}

.image-preview img {
  max-width: 100%;
  max-height: 160px;
  border-radius: 6px;
}

.btn {
  width: 100%;
  padding: 10px;
  border: none;
  border-radius: 6px;
  font-size: 0.9em;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-decoration: none;
}

.btn-primary {
  background: var(--accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.85;
}

.btn-primary:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--bg-tag);
  color: var(--text-primary);
  margin-top: 8px;
  font-weight: 500;
}

.btn-secondary:hover {
  background: var(--border-color);
}

/* 标签页 */
.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
}

.tab-btn {
  padding: 6px 14px;
  background: none;
  border: none;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.9em;
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-btn.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}

/* 结果区域 */
.result-area, .history-area {
  min-height: 280px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  color: var(--text-muted);
  font-size: 0.9em;
}

.error-message {
  padding: 12px;
  background: var(--bg-error);
  border-left: 3px solid #e74c3c;
  border-radius: 6px;
  color: #e74c3c;
  font-size: 0.9em;
}

.result-image {
  text-align: center;
}

.result-image img {
  max-width: 100%;
  max-height: 460px;
  border-radius: 6px;
  object-fit: contain;
}

.result-info {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-info);
  border-radius: 6px;
  border-left: 3px solid var(--border-color);
}

.result-info p {
  margin: 4px 0;
  color: var(--text-secondary);
  font-size: 0.85em;
}

.result-info strong {
  color: var(--text-primary);
}

.result-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.result-actions .btn {
  flex: 1;
}

/* 历史记录 */
.history-list {
  max-height: 380px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  margin-bottom: 6px;
  background: var(--bg-info);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.history-item:hover {
  background: var(--bg-card-hover);
}

.history-thumb {
  width: 48px;
  height: 48px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  background: var(--border-color);
}

.history-prompt {
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;
  font-size: 0.9em;
}

.history-meta {
  font-size: 0.8em;
  color: var(--text-muted);
  margin-top: 2px;
}

@media (max-width: 1024px) {
  .generator-layout {
    grid-template-columns: 1fr;
  }
}

/* 计费模式切换 */
.mode-switch {
  display: flex;
  gap: 0;
  background: var(--bg-tag);
  border-radius: 6px;
  padding: 3px;
}

.mode-btn {
  flex: 1;
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85em;
  color: var(--text-muted);
  transition: all 0.2s;
}

.mode-btn.active {
  background: var(--bg-card);
  color: var(--text-primary);
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

.wallet-info {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: var(--bg-info);
  border-radius: 6px;
  border-left: 3px solid #48bb78;
  font-size: 0.9em;
}

.wallet-balance {
  font-weight: 700;
  color: #2d8a4e;
}

.wallet-price {
  color: var(--text-muted);
  font-size: 0.85em;
}

.wallet-link {
  margin-left: auto;
  color: var(--text-secondary);
  font-weight: 600;
  text-decoration: underline;
  font-size: 0.85em;
}

.wallet-deduct-info {
  margin-top: 8px;
  padding: 8px 10px;
  background: var(--bg-info);
  border-left: 3px solid var(--border-color);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 0.85em;
}

.tip-inline {
  padding: 8px 10px;
  background: var(--bg-info);
  border-radius: 6px;
  color: var(--text-muted);
  font-size: 0.8em;
  line-height: 1.5;
}

.tip-inline a {
  color: var(--text-secondary);
  text-decoration: underline;
}
</style>
