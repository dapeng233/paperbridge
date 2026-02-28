<template>
  <div class="api-config-page">
    <h2 class="page-title">API 配置</h2>
    <p class="page-desc">配置一次，全局生效。所有数据仅保存在本地。</p>

    <!-- 生图模型 -->
    <div class="config-section">
      <h3>生图模型</h3>

      <div class="config-card">
        <h4>Google AI</h4>
        <div class="form-group">
          <label>API Key</label>
          <input v-model="google_api_key" type="password" placeholder="Google AI Studio API Key" class="input-field" />
          <small>从 <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a> 获取，免费使用</small>
        </div>
        <div class="form-group">
          <label>代理地址（国内必填）</label>
          <input v-model="google_proxy" type="text" placeholder="http://127.0.0.1:7890" class="input-field" />
          <small>Clash 默认 7890、V2Ray 默认 10809</small>
        </div>
      </div>

      <div class="config-card">
        <h4>DMX API</h4>
        <div class="form-group">
          <label>API 密钥</label>
          <input v-model="dmx_api_key" type="password" placeholder="DMX API 密钥" class="input-field" />
          <small>从 <a href="https://www.dmxapi.cn" target="_blank">dmxapi.cn</a> 获取</small>
        </div>
      </div>
    </div>

    <!-- 文本处理模型 -->
    <div class="config-section">
      <h3>文本处理模型</h3>
      <div class="config-card">
        <h4>OpenAI 兼容接口</h4>
        <small class="card-desc">用于文献助手等文本分析功能，支持国内大模型（如 DeepSeek、通义千问等）</small>
        <div class="form-group">
          <label>API Key</label>
          <input v-model="ai_api_key" type="password" placeholder="sk-..." class="input-field" />
        </div>
        <div class="form-group">
          <label>Base URL</label>
          <input v-model="ai_base_url" type="text" placeholder="https://api.openai.com" class="input-field" />
          <small>例：https://api.deepseek.com、https://dashscope.aliyuncs.com/compatible-mode</small>
        </div>
        <div class="form-group">
          <label>模型名称</label>
          <input v-model="ai_model" type="text" placeholder="gpt-4o-mini" class="input-field" />
          <small>例：deepseek-chat、qwen-turbo</small>
        </div>
      </div>
    </div>

    <button class="btn btn-primary" @click="saveAll" :disabled="saving">
      {{ saving ? '保存中...' : '保存配置' }}
    </button>
    <p v-if="msg" class="save-msg" :class="{ error: msgError }">{{ msg }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { api } from '@/utils/api';

const google_api_key = ref('');
const google_proxy = ref('');
const dmx_api_key = ref('');
const ai_api_key = ref('');
const ai_base_url = ref('');
const ai_model = ref('');
const saving = ref(false);
const msg = ref('');
const msgError = ref(false);

const keys = ['google_api_key', 'google_proxy', 'dmx_api_key', 'ai_api_key', 'ai_base_url', 'ai_model'];
const refs = { google_api_key, google_proxy, dmx_api_key, ai_api_key, ai_base_url, ai_model };

onMounted(async () => {
  for (const k of keys) {
    try {
      const data = await api.get(`/api/literature/settings/${k}`);
      if (data.value) refs[k].value = data.value;
    } catch {}
  }
});

async function saveAll() {
  saving.value = true; msg.value = '';
  try {
    for (const k of keys) {
      await api.post('/api/literature/settings', { key: k, value: refs[k].value });
    }
    msg.value = '配置已保存'; msgError.value = false;
  } catch (e) {
    msg.value = '保存失败: ' + e.message; msgError.value = true;
  } finally { saving.value = false; }
}
</script>

<style scoped>
.api-config-page { max-width: 680px; }
.page-title { font-size: 1.3em; color: var(--text-primary); margin-bottom: 4px; font-weight: 600; }
.page-desc { color: var(--text-muted); font-size: 0.85em; margin-bottom: 20px; }

.config-section { margin-bottom: 24px; }
.config-section h3 {
  font-size: 1em; color: var(--text-primary); margin-bottom: 12px;
  border-bottom: 1px solid var(--border-color); padding-bottom: 6px;
}

.config-card {
  background: var(--bg-card); border: 1px solid var(--border-color);
  border-radius: 8px; padding: 16px; margin-bottom: 12px;
}
.config-card h4 { font-size: 0.95em; color: var(--text-primary); margin-bottom: 10px; }
.card-desc { display: block; color: var(--text-muted); font-size: 0.8em; margin-bottom: 12px; }

.form-group { margin-bottom: 12px; }
.form-group label { display: block; margin-bottom: 4px; font-weight: 600; color: var(--text-primary); font-size: 0.85em; }
.form-group small { display: block; margin-top: 3px; color: var(--text-muted); font-size: 0.78em; }
.form-group small a { color: var(--text-secondary); text-decoration: underline; }

.input-field {
  width: 100%; padding: 8px 10px; border: 1px solid var(--border-color);
  border-radius: 6px; font-size: 0.9em; background: var(--bg-input); color: var(--text-primary);
  box-sizing: border-box;
}
.input-field:focus { outline: none; border-color: var(--accent); }

.btn { width: 100%; padding: 10px; border: none; border-radius: 6px; font-size: 0.9em; font-weight: 600; cursor: pointer; }
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.save-msg { margin-top: 10px; padding: 8px; border-radius: 6px; font-size: 0.85em; background: var(--bg-success); color: #2d8a4e; }
.save-msg.error { background: var(--bg-error); color: #e74c3c; }
</style>
