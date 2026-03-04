<template>
  <Teleport to="body">
    <div v-if="visible" class="setup-wizard-overlay">
      <div class="setup-wizard">
        <div class="wizard-header">
          <h2>欢迎使用 PaperBridge</h2>
          <p>首次使用需要配置 API 和文献库</p>
        </div>

        <div class="wizard-content">
          <!-- Step 1: 配置 API -->
          <div class="wizard-step" :class="{ active: step === 1 }">
            <div class="step-header">
              <div class="step-num">1</div>
              <div class="step-title">配置 API</div>
            </div>
            <div class="step-body" v-if="step === 1">
              <p>PaperBridge 需要 AI API 来提供智能功能。请前往左侧菜单的 <b>API 配置</b> 页面设置您的 API Key 和 Base URL。</p>
              <div class="step-actions">
                <button @click="goToApiConfig" class="btn-primary">前往配置</button>
              </div>
            </div>
          </div>

          <!-- Step 2: 配置文献库 -->
          <div class="wizard-step" :class="{ active: step === 2 }">
            <div class="step-header">
              <div class="step-num">2</div>
              <div class="step-title">配置文献库</div>
            </div>
            <div class="step-body" v-if="step === 2">
              <p>请选择一个文件夹作为您的文献库路径，用于存储题录和 PDF 文件。</p>
              <div class="step-actions">
                <button @click="goToLiterature" class="btn-primary">前往配置</button>
              </div>
            </div>
          </div>
        </div>

        <div class="wizard-footer">
          <button @click="skip" class="btn-skip">跳过，稍后配置</button>
          <button v-if="step === 1" @click="step = 2" class="btn-primary">下一步</button>
          <button v-if="step === 2" @click="finish" class="btn-primary">完成</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue';

const visible = ref(false);
const step = ref(1);
const router = inject('$router');

onMounted(async () => {
  // 检查是否首次启动
  if (window.electronAPI) {
    const isFirstLaunch = await window.electronAPI.getFirstLaunch();
    if (isFirstLaunch) {
      visible.value = true;
    }
  }
});

function goToApiConfig() {
  visible.value = false;
  if (router) router.push('/api-config');
}

function goToLiterature() {
  visible.value = false;
  if (router) router.push('/literature');
}

function skip() {
  visible.value = false;
  if (window.electronAPI) {
    window.electronAPI.setFirstLaunchDone();
  }
}

function finish() {
  visible.value = false;
  if (window.electronAPI) {
    window.electronAPI.setFirstLaunchDone();
  }
}
</script>

<style scoped>
.setup-wizard-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.setup-wizard {
  background: var(--bg-card, #fff);
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.wizard-header {
  padding: 24px 28px;
  border-bottom: 1px solid var(--border-color, #eee);
}

.wizard-header h2 {
  margin: 0 0 8px 0;
  font-size: 1.5em;
  color: var(--text-primary, #333);
}

.wizard-header p {
  margin: 0;
  color: var(--text-secondary, #666);
}

.wizard-content {
  padding: 24px 28px;
}

.wizard-step {
  margin-bottom: 20px;
  border: 1px solid var(--border-color, #ddd);
  border-radius: 12px;
  overflow: hidden;
}

.wizard-step.active {
  border-color: var(--accent, #4f46e5);
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
}

.wizard-step.done {
  border-color: #10b981;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-info, #f9fafb);
  cursor: pointer;
}

.step-num {
  width: 28px;
  height: 28px;
  background: var(--accent, #4f46e5);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.9em;
}

.wizard-step.done .step-num {
  background: #10b981;
}

.step-title {
  flex: 1;
  font-weight: 600;
  color: var(--text-primary, #333);
  display: flex;
  align-items: center;
  gap: 8px;
}

.step-done-badge {
  font-size: 0.75em;
  padding: 2px 8px;
  background: #d1fae5;
  color: #047857;
  border-radius: 10px;
  font-weight: 500;
}

.step-body {
  padding: 16px;
  border-top: 1px solid var(--border-color, #eee);
}

.step-body p {
  margin: 0 0 16px 0;
  color: var(--text-secondary, #555);
  line-height: 1.6;
}

.step-actions {
  display: flex;
  gap: 10px;
}

.btn-primary {
  padding: 10px 20px;
  background: var(--accent, #4f46e5);
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #4338ca;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 10px 20px;
  background: var(--bg-tag, #e5e7eb);
  color: var(--text-primary, #333);
  border: none;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
}

.btn-secondary:hover {
  background: #d1d5db;
}

.step-error {
  margin-top: 12px;
  padding: 10px 14px;
  background: #fef2f2;
  color: #dc2626;
  border-radius: 6px;
  font-size: 0.9em;
}

.step-message {
  margin-top: 12px;
  padding: 10px 14px;
  background: #eff6ff;
  color: #2563eb;
  border-radius: 6px;
  font-size: 0.9em;
}

.step-list {
  margin: 0;
  padding-left: 20px;
  color: var(--text-secondary, #555);
  line-height: 2;
}

.step-list b {
  color: var(--text-primary, #333);
}

.path-box {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
  padding: 10px 14px;
  background: var(--bg-tag, #f3f4f6);
  border-radius: 6px;
}

.path-box code {
  flex: 1;
  font-family: monospace;
  font-size: 0.85em;
  color: var(--text-primary, #333);
  word-break: break-all;
}

.btn-copy {
  padding: 6px 12px;
  background: var(--accent, #4f46e5);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.85em;
  cursor: pointer;
  white-space: nowrap;
}

.wizard-footer {
  padding: 16px 28px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-color, #eee);
}

.btn-skip {
  padding: 10px 20px;
  background: transparent;
  color: var(--text-muted, #888);
  border: none;
  font-weight: 500;
  cursor: pointer;
}

.btn-skip:hover {
  color: var(--text-primary, #333);
}
</style>
