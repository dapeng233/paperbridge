<template>
  <Teleport to="body">
    <div v-if="visible" class="setup-wizard-overlay">
      <div class="setup-wizard">
        <div class="wizard-header">
          <h2>欢迎使用 PaperBridge</h2>
          <p>首次使用需要配置 Word 插件才能在 Word 中插入引用</p>
        </div>

        <div class="wizard-content">
          <!-- Step 1: 生成证书 -->
          <div class="wizard-step" :class="{ active: step === 1, done: certReady }">
            <div class="step-header">
              <div class="step-num">1</div>
              <div class="step-title">
                <span>生成 HTTPS 证书</span>
                <span v-if="certReady" class="step-done-badge">已完成</span>
              </div>
            </div>
            <div class="step-body" v-if="step === 1">
              <p>Word 插件需要 HTTPS 证书才能运行。点击下方按钮生成证书，系统会弹出管理员权限确认框。</p>
              <div class="step-actions">
                <button @click="generateCert" :disabled="generating" class="btn-primary">
                  {{ generating ? '生成中...' : '生成证书' }}
                </button>
                <button @click="checkCert" class="btn-secondary">检查状态</button>
              </div>
              <div v-if="certError" class="step-error">{{ certError }}</div>
              <div v-if="certMessage" class="step-message">{{ certMessage }}</div>
            </div>
          </div>

          <!-- Step 2: 添加到 Word -->
          <div class="wizard-step" :class="{ active: step === 2 }">
            <div class="step-header">
              <div class="step-num">2</div>
              <div class="step-title">在 Word 中添加插件</div>
            </div>
            <div class="step-body" v-if="step === 2">
              <p>按以下步骤在 Word 中添加 PaperBridge 引用助手：</p>
              <ol class="step-list">
                <li>打开 Word，点击 <b>文件</b> → <b>选项</b> → <b>信任中心</b></li>
                <li>点击 <b>信任中心设置</b> → <b>受信任的加载项目录</b></li>
                <li>在 <b>目录 URL</b> 中粘贴以下路径：
                  <div class="path-box">
                    <code>{{ addinPath }}</code>
                    <button @click="copyPath" class="btn-copy">{{ copied ? '已复制' : '复制' }}</button>
                  </div>
                </li>
                <li>勾选 <b>在菜单中显示</b>，点击 <b>添加目录</b>，然后 <b>确定</b></li>
                <li><b>重启 Word</b>，在 <b>插入</b> → <b>我的加载项</b> → <b>共享文件夹</b> 中添加插件</li>
              </ol>
            </div>
          </div>
        </div>

        <div class="wizard-footer">
          <button v-if="step === 1 && !certReady" @click="skip" class="btn-skip">跳过，稍后配置</button>
          <button v-if="step === 1 && certReady" @click="step = 2" class="btn-primary">下一步</button>
          <button v-if="step === 2" @click="finish" class="btn-primary">完成</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const visible = ref(false);
const step = ref(1);
const certReady = ref(false);
const generating = ref(false);
const certError = ref('');
const certMessage = ref('');
const addinPath = ref('');
const copied = ref(false);

onMounted(async () => {
  // 检查是否首次启动
  if (window.electronAPI) {
    const isFirstLaunch = await window.electronAPI.getFirstLaunch();
    if (isFirstLaunch) {
      visible.value = true;
    }
    // 获取路径
    const paths = await window.electronAPI.getAppPaths();
    addinPath.value = paths.addinDir;
    // 检查证书状态
    await checkCert();
  }
});

async function checkCert() {
  if (!window.electronAPI) return;
  const status = await window.electronAPI.checkCertStatus();
  certReady.value = status.exists;
  if (status.exists) {
    certMessage.value = '证书已就绪';
    certError.value = '';
  }
}

async function generateCert() {
  if (!window.electronAPI) return;
  generating.value = true;
  certError.value = '';
  certMessage.value = '';

  try {
    const result = await window.electronAPI.generateCertElevated();
    if (result.success) {
      certMessage.value = result.message || '请在弹出窗口中完成操作，然后点击"检查状态"';
    } else {
      certError.value = result.error || '生成失败';
    }
  } catch (err) {
    certError.value = err.message;
  } finally {
    generating.value = false;
  }
}

async function copyPath() {
  if (window.electronAPI) {
    await window.electronAPI.copyToClipboard(addinPath.value);
    copied.value = true;
    setTimeout(() => copied.value = false, 2000);
  }
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
