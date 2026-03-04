<template>
  <div class="api-config-page">
    <h2 class="page-title">API 配置</h2>
    <p class="page-desc">配置一次，全局生效。所有数据仅保存在本地。</p>

    <!-- Tab 切换 -->
    <div class="tab-bar">
      <button class="tab-btn" :class="{ active: activeTab === 'text' }" @click="activeTab = 'text'">文本处理模型</button>
      <button class="tab-btn" :class="{ active: activeTab === 'image' }" @click="activeTab = 'image'">生图模型</button>
    </div>

    <!-- 文本处理模型 Tab -->
    <div v-if="activeTab === 'text'">
      <div class="config-row-layout">
        <div class="config-section config-col">
          <div class="config-card">
            <h4>OpenAI 兼容接口配置</h4>
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
              <small>模型名称请在 <router-link to="/literature">文献助手</router-link> 的设置中配置</small>
            </div>
          </div>
        </div>

        <div class="config-section config-col">
          <div class="config-card">
            <h4>提示词设置</h4>
            <small class="card-desc">自定义 AI 总结文献笔记时使用的提示词，控制输出格式和内容</small>
            <div class="form-group">
              <label>文献总结提示词</label>
              <textarea v-model="ai_summary_prompt" rows="8" class="input-field textarea-field" :placeholder="defaultPrompt"></textarea>
              <small>留空将使用默认提示词。支持变量：${title}、${abstract}、${authors}、${journal}、${year}、${notes}</small>
            </div>
            <div class="form-group">
              <button class="btn-reset" @click="ai_summary_prompt = ''">恢复默认提示词</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 生图模型 Tab -->
    <div v-if="activeTab === 'image'">
      <div class="config-section">
        <div class="config-card">
          <h4>Gemini 兼容接口（以 DMX API 为例）</h4>
          <small class="card-desc">支持任何 Gemini API 兼容的代理服务（如 dmxapi.cn 等）</small>
          <div class="form-group">
            <label>API 密钥</label>
            <input v-model="dmx_api_key" type="password" placeholder="API 密钥" class="input-field" />
          </div>
          <div class="form-group">
            <label>Base URL</label>
            <input v-model="dmx_base_url" type="text" placeholder="https://www.dmxapi.cn" class="input-field" />
            <small>留空默认使用 dmxapi.cn，也可填写其他 Gemini API 兼容服务地址</small>
          </div>
        </div>

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
import { useRoute } from 'vue-router';
import { api } from '@/utils/api';

const route = useRoute();
const activeTab = ref(route.query.tab === 'image' ? 'image' : 'text');

const google_api_key = ref('');
const google_proxy = ref('');
const dmx_api_key = ref('');
const dmx_base_url = ref('');
const ai_api_key = ref('');
const ai_base_url = ref('');
const ai_summary_prompt = ref('');
const saving = ref(false);
const msg = ref('');
const msgError = ref(false);

const defaultPrompt = `你是学术文献分析助手。根据以下信息生成两个摘要。

标题：\${title}
作者：\${authors}
期刊：\${journal}
年份：\${year}
摘要：\${abstract}
用户笔记：\${notes}

请返回JSON格式：
{
  "notes_summary": "笔记精华摘要，50-200字，提炼核心发现和关键观点",
  "research_note": "一个极短的标签，概括核心贡献。如果标题是中文则用中文（10字符以内含空格），如果标题是英文则用英文（20字符以内含空格和符号）"
}

只返回JSON，不要其他文字。`;

const keys = ['google_api_key', 'google_proxy', 'dmx_api_key', 'dmx_base_url', 'ai_api_key', 'ai_base_url', 'ai_summary_prompt'];
const refs = { google_api_key, google_proxy, dmx_api_key, dmx_base_url, ai_api_key, ai_base_url, ai_summary_prompt };

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
.api-config-page { max-width: 1200px; }
.page-title { font-size: 1.3em; color: var(--text-primary); margin-bottom: 4px; font-weight: 600; }
.page-desc { color: var(--text-muted); font-size: 0.85em; margin-bottom: 20px; }

/* Tab 栏 */
.tab-bar { display: flex; gap: 0; margin-bottom: 20px; border-bottom: 2px solid var(--border-color); }
.tab-btn {
  padding: 8px 20px; border: none; background: none; cursor: pointer;
  font-size: 0.9em; font-weight: 500; color: var(--text-muted);
  border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.15s;
}
.tab-btn:hover { color: var(--text-primary); }
.tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }

.config-section { margin-bottom: 24px; }

/* 横排布局 */
.config-row-layout {
  display: flex;
  gap: 20px;
  align-items: flex-start;
}
.config-col {
  flex: 1;
  min-width: 0;
}
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
.form-group small a, .form-group small :deep(a) { color: var(--accent); text-decoration: underline; }

.input-field {
  width: 100%; padding: 8px 10px; border: 1px solid var(--border-color);
  border-radius: 6px; font-size: 0.9em; background: var(--bg-input); color: var(--text-primary);
  box-sizing: border-box;
}
.input-field:focus { outline: none; border-color: var(--accent); }
.textarea-field { resize: vertical; font-family: monospace; font-size: 0.82em; line-height: 1.5; }

.btn-reset {
  padding: 4px 12px; border: 1px solid var(--border-color); border-radius: 4px;
  background: transparent; color: var(--text-secondary); cursor: pointer; font-size: 0.82em;
}
.btn-reset:hover { background: var(--bg-card-hover); }

.btn { width: 100%; padding: 10px; border: none; border-radius: 6px; font-size: 0.9em; font-weight: 600; cursor: pointer; }
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover:not(:disabled) { opacity: 0.85; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.save-msg { margin-top: 10px; padding: 8px; border-radius: 6px; font-size: 0.85em; background: var(--bg-success); color: #2d8a4e; }
.save-msg.error { background: var(--bg-error); color: #e74c3c; }
</style>
