<template>
  <!-- 首次启动配置向导 -->
  <SetupWizard />

  <!-- 登录遮罩（仅在需要登录功能时显示） -->
  <LoginOverlay v-if="showLogin" @login-success="onLoginSuccess" />

  <!-- 主应用 -->
  <div v-if="hideLayout" class="fullscreen-content">
    <router-view />
  </div>
  <div v-else class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1 class="app-title">PaperBridge</h1>
        <p class="app-subtitle">v{{ currentVersion }}</p>
      </div>
      <nav class="sidebar-nav">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ disabled: item.disabled }"
        >
          <span class="nav-label">{{ item.label }}</span>
          <span v-if="item.disabled" class="nav-badge">soon</span>
        </router-link>
      </nav>
      <div class="sidebar-footer">
        <button class="theme-toggle" @click="checkForUpdates" :disabled="updateChecking">
          <span class="nav-label">{{ updateChecking ? '检查中...' : '检查更新' }}</span>
          <span v-if="hasUpdate" class="update-dot"></span>
        </button>
        <router-link to="/help" class="nav-item">
          <span class="nav-label">使用帮助</span>
        </router-link>
        <router-link to="/settings" class="nav-item">
          <span class="nav-label">设置</span>
        </router-link>
      </div>
    </aside>
    <main class="main-content">
      <!-- 更新提示横幅 -->
      <div v-if="hasUpdate" class="update-banner">
        <span>发现新版本 {{ latestVersion }}（当前 v{{ currentVersion }}）</span>
        <a :href="updateUrl" target="_blank" class="update-link">前往下载</a>
        <button class="update-dismiss" @click="hasUpdate = false">✕</button>
      </div>
      <router-view />
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import LoginOverlay from '@/components/LoginOverlay.vue';
import SetupWizard from '@/components/SetupWizard.vue';

const route = useRoute();
const hideLayout = computed(() => route.meta?.hideLayout === true);

const authStore = useAuthStore();
const showLogin = ref(false);

const isDark = ref(false);
const currentVersion = '0.0.2';
const updateChecking = ref(false);
const hasUpdate = ref(false);
const latestVersion = ref('');
const updateUrl = ref('');

const navItems = ref([
  { path: '/literature', label: '文献助手', disabled: false },
  { path: '/image-generator', label: 'AI 生图', disabled: false },
  { path: '/api-config', label: 'API 配置', disabled: false }
]);

onMounted(async () => {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    isDark.value = true;
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  const savedFontSize = localStorage.getItem('ui-font-size');
  if (savedFontSize) {
    document.documentElement.style.setProperty('--font-size-base', savedFontSize + 'px');
  }
  await authStore.checkAuth();
  checkForUpdates(true);
});

function toggleTheme() {
  isDark.value = !isDark.value;
  if (isDark.value) {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('theme', 'light');
  }
}

function compareVersions(v1, v2) {
  const a = v1.replace(/^v/, '').split('.').map(Number);
  const b = v2.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) < (b[i] || 0)) return -1;
    if ((a[i] || 0) > (b[i] || 0)) return 1;
  }
  return 0;
}

async function checkForUpdates(silent = false) {
  updateChecking.value = true;
  try {
    const res = await fetch('https://api.github.com/repos/dapeng233/paperbridge/releases/latest', {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    });
    if (!res.ok) throw new Error('请求失败');
    const data = await res.json();
    const tag = data.tag_name;
    if (compareVersions(currentVersion, tag) < 0) {
      hasUpdate.value = true;
      latestVersion.value = tag;
      updateUrl.value = data.html_url;
    } else if (!silent) {
      alert('当前已是最新版本');
    }
  } catch (e) {
    if (!silent) {
      alert('检查更新失败，请检查网络连接');
    }
    console.error('检查更新失败:', e);
  } finally {
    updateChecking.value = false;
  }
}

function onLoginSuccess() {}
</script>

<style scoped>
.fullscreen-content {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.update-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  margin-bottom: 16px;
  background: var(--accent);
  color: white;
  border-radius: 6px;
  font-size: 0.9em;
}

.update-link {
  color: white;
  font-weight: 600;
  text-decoration: underline;
  margin-left: auto;
}

.update-dismiss {
  background: none;
  border: none;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 1em;
  padding: 0 4px;
}

.update-dismiss:hover {
  color: white;
}

.update-dot {
  width: 6px;
  height: 6px;
  background: #e74c3c;
  border-radius: 50%;
  margin-left: auto;
  flex-shrink: 0;
}
</style>
