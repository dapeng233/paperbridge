<template>
  <Teleport to="body">
    <div v-if="visible" class="setup-wizard-overlay">
      <div class="setup-wizard">
        <div class="wizard-header">
          <h2>👋 欢迎使用 PaperBridge</h2>
        </div>

        <div class="wizard-content">
          <p>首次使用请前往<b>使用帮助</b>页面，了解如何配置 API 和文献库。</p>
        </div>

        <div class="wizard-footer">
          <button @click="close" class="btn-secondary">知道了</button>
          <button @click="goToHelp" class="btn-primary">前往使用帮助</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, inject } from 'vue';

const visible = ref(false);
const router = inject('$router');

onMounted(async () => {
  if (window.electronAPI) {
    const isFirstLaunch = await window.electronAPI.getFirstLaunch();
    if (isFirstLaunch) {
      visible.value = true;
    }
  }
});

function close() {
  visible.value = false;
  if (window.electronAPI) {
    window.electronAPI.setFirstLaunchDone();
  }
}

function goToHelp() {
  visible.value = false;
  if (window.electronAPI) {
    window.electronAPI.setFirstLaunchDone();
  }
  if (router) router.push('/help');
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
  max-width: 480px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.wizard-header {
  padding: 24px 28px 16px;
  border-bottom: 1px solid var(--border-color, #eee);
}

.wizard-header h2 {
  margin: 0;
  font-size: 1.4em;
  color: var(--text-primary, #333);
}

.wizard-content {
  padding: 24px 28px;
}

.wizard-content p {
  margin: 0;
  color: var(--text-secondary, #555);
  line-height: 1.6;
  font-size: 1em;
}

.wizard-content b {
  color: var(--accent, #4f46e5);
}

.wizard-footer {
  padding: 16px 28px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--border-color, #eee);
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
</style>
