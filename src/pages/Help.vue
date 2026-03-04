<template>
  <div class="help-page">
    <h2 class="page-title">使用帮助</h2>

    <!-- Google AI 密钥帮助 -->
    <div class="help-panel">
      <h3>Google AI 密钥获取</h3>
      <div class="step" v-for="(s, i) in googleSteps" :key="'google-'+i">
        <div class="step-num">{{ i + 1 }}</div>
        <div class="step-content" v-html="s"></div>
      </div>
      <div class="tip-box">
        API Key 只会显示一次，请妥善保存。丢失了可以重新创建。
      </div>
    </div>

    <!-- DMX API 密钥帮助 -->
    <div class="help-panel">
      <h3>Gemini 兼容接口密钥获取（以 DMX API 为例）</h3>
      <div class="step" v-for="(s, i) in dmxSteps" :key="'dmx-'+i">
        <div class="step-num">{{ i + 1 }}</div>
        <div class="step-content" v-html="s"></div>
      </div>
      <div class="tip-box">
        API Key 只会显示一次，请妥善保存。丢失了可以重新创建。
      </div>
    </div>

    <!-- 使用说明 -->
    <div class="help-panel">
      <h3>使用说明</h3>
      <p><strong>文生图：</strong>选择「文生图」模式，输入描述，点击生成。支持中文（自动翻译）。</p>
      <p style="margin-top:12px"><strong>图生图：</strong>选择「图生图」模式，上传图片，描述修改内容，点击生成。</p>
      <div class="tip-box">
        图片生成需要一定时间，请耐心等待。超时可换模型或简化提示词。
      </div>
    </div>

    <!-- 联系方式 -->
    <div class="help-panel">
      <h3>联系我们</h3>
      <p>如有任何问题或建议，欢迎通过以下方式联系：</p>
      <div class="contact-box">
        <span class="contact-icon">📧</span>
        <div class="contact-info">
          <span class="contact-label">邮箱</span>
          <a href="mailto:zhangpeng0626@qq.com" class="contact-email">zhangpeng0626@qq.com</a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
const googleSteps = [
  '打开 <a href="https://aistudio.google.com/apikey" target="_blank">Google AI Studio</a>，使用 Google 账号登录。',
  '点击「Create API Key」按钮，创建一个新的 API Key。',
  '复制生成的 API Key，粘贴到 AI 作图页面的「Google API Key」输入框中。',
  '<strong>重要：</strong>国内使用需要在「代理地址」填写你的本地代理，如 Clash 默认 <code>http://127.0.0.1:7890</code>，V2Ray 默认 <code>http://127.0.0.1:10809</code>。'
];

const dmxSteps = [
  '打开 <a href="https://www.dmxapi.cn/rmb" target="_blank">dmxapi.cn</a>（或其他 Gemini 兼容服务），注册账号并登录。',
  '点击右上角头像，选择「余额充值」，充值所需金额。',
  '在左侧菜单找到「API 令牌」，点击「添加令牌」创建 API Key。',
  '复制生成的 API Key（以 <code>sk-</code> 开头），粘贴到 AI 作图页面的密钥输入框中。'
];
</script>

<style scoped>
.page-title {
  font-size: 1.6em;
  color: var(--text-primary);
  margin-bottom: 20px;
}

.help-panel {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-card);
  margin-bottom: 16px;
}

.help-panel h3 {
  font-size: 1.2em;
  color: var(--text-primary);
  border-bottom: 2px solid var(--accent);
  padding-bottom: 8px;
  margin-bottom: 16px;
}

.help-panel p {
  color: var(--text-on-card);
  line-height: 1.8;
}

.help-panel p strong {
  color: var(--text-primary);
}

.step {
  display: flex;
  gap: 14px;
  margin-bottom: 14px;
  padding: 14px;
  background: var(--bg-info);
  border-radius: 8px;
  border-left: 4px solid var(--accent);
}

.step-num {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  background: var(--accent, #333);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.step-content {
  flex: 1;
  color: var(--text-on-card);
  line-height: 1.6;
  align-self: center;
}

.step-content :deep(a) {
  color: var(--accent);
  font-weight: 600;
}

.step-content :deep(code) {
  background: var(--bg-tag);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-primary);
}

.price-table {
  width: 100%;
  border-collapse: collapse;
  margin: 12px 0;
}

.price-table th, .price-table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid var(--border-color);
}

.price-table th {
  background: var(--accent-bg);
  color: var(--text-primary);
  font-weight: 600;
}

.price-table td {
  color: var(--text-on-card);
}

.tip-box {
  background: var(--bg-tip);
  border-left: 4px solid #ffc107;
  padding: 12px 16px;
  border-radius: 6px;
  margin-top: 14px;
  color: var(--text-secondary);
  font-size: 0.95em;
}

.contact-box {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 16px;
  padding: 16px 20px;
  background: var(--bg-info);
  border-radius: 10px;
  border: 1px solid var(--border-color);
}

.contact-icon {
  font-size: 2em;
}

.contact-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.contact-label {
  font-size: 0.85em;
  color: var(--text-muted);
}

.contact-email {
  color: var(--accent);
  font-weight: 600;
  font-size: 1.1em;
  text-decoration: none;
}

.contact-email:hover {
  text-decoration: underline;
}
</style>
