<template>
  <div class="settings-page">
    <h2 class="page-title">设置</h2>

    <div class="settings-panel">
      <h3>外观</h3>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">深色模式</span>
          <span class="setting-desc">切换深色/浅色主题</span>
        </div>
        <label class="toggle-switch">
          <input type="checkbox" v-model="isDark" @change="toggleTheme" />
          <span class="toggle-slider"></span>
        </label>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">字体大小</span>
          <span class="setting-desc">调整全局 UI 字体大小（当前: {{ fontSize }}px）</span>
        </div>
        <div class="font-size-control">
          <button class="size-btn" @click="changeFontSize(-1)" :disabled="fontSize <= 12">A-</button>
          <input type="range" v-model.number="fontSize" min="12" max="20" step="1" class="size-slider" @input="applyFontSize" />
          <button class="size-btn" @click="changeFontSize(1)" :disabled="fontSize >= 20">A+</button>
          <button class="size-btn reset" @click="resetFontSize">重置</button>
        </div>
      </div>
    </div>

    <div class="settings-panel">
      <h3>关于</h3>
      <div class="about-info">
        <p><strong>PaperBridge</strong></p>
        <p class="about-desc">
          <a href="https://github.com/dapeng233/paperbridge" target="_blank" style="color: var(--accent); text-decoration: none;">
            GitHub 项目地址
          </a>
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const isDark = ref(false);
const fontSize = ref(14);

onMounted(() => {
  isDark.value = document.documentElement.getAttribute('data-theme') === 'dark';
  const saved = localStorage.getItem('ui-font-size');
  if (saved) {
    fontSize.value = parseInt(saved);
    applyFontSize();
  }
});

function toggleTheme() {
  if (isDark.value) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  }
}

function changeFontSize(delta) {
  const next = fontSize.value + delta;
  if (next >= 12 && next <= 20) {
    fontSize.value = next;
    applyFontSize();
  }
}

function applyFontSize() {
  document.documentElement.style.setProperty('--font-size-base', fontSize.value + 'px');
  localStorage.setItem('ui-font-size', fontSize.value);
}

function resetFontSize() {
  fontSize.value = 14;
  applyFontSize();
}
</script>

<style scoped>
.page-title {
  font-size: 1.3em;
  color: var(--text-primary);
  margin-bottom: 20px;
  font-weight: 600;
}

.settings-panel {
  background: var(--bg-card);
  border-radius: 10px;
  padding: 20px;
  margin-bottom: 16px;
  box-shadow: var(--shadow-card);
  border: 1px solid var(--border-color);
}

.settings-panel h3 {
  font-size: 1em;
  color: var(--text-primary);
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-label {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 0.9em;
}

.setting-desc {
  color: var(--text-muted);
  font-size: 0.8em;
}

/* Toggle Switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--border-color);
  border-radius: 24px;
  transition: 0.3s;
}

.toggle-slider:before {
  content: "";
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background: white;
  border-radius: 50%;
  transition: 0.3s;
}

.toggle-switch input:checked + .toggle-slider {
  background-color: var(--accent);
}

.toggle-switch input:checked + .toggle-slider:before {
  transform: translateX(20px);
}

/* Font Size Control */
.font-size-control {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.size-btn {
  width: 32px;
  height: 28px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-tag);
  color: var(--text-primary);
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85em;
  display: flex;
  align-items: center;
  justify-content: center;
}

.size-btn.reset {
  width: auto;
  padding: 0 8px;
  font-size: 0.75em;
  font-weight: 500;
}

.size-btn:hover:not(:disabled) {
  background: var(--border-color);
}

.size-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.size-slider {
  width: 100px;
  accent-color: var(--accent);
}

/* About */
.about-info p {
  color: var(--text-primary);
  font-size: 0.9em;
  margin: 4px 0;
}

.about-desc {
  color: var(--text-muted) !important;
  font-size: 0.85em !important;
}
</style>
