<template>
  <div class="canvas-page">
    <div class="page-title-bar">
      <div class="page-tab-bar">
        <router-link to="/image-generator" class="page-tab">AI 生图</router-link>
        <button class="page-tab active">图片编辑</button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <div class="tool-group">
        <button
          v-for="t in tools"
          :key="t.id"
          class="tool-btn"
          :class="{ active: currentTool === t.id }"
          @click="currentTool = t.id"
          :title="t.label"
        >{{ t.icon }} {{ t.label }}</button>
      </div>
      <div class="tool-group">
        <label class="tool-label">大小</label>
        <input type="range" v-model.number="brushSize" min="1" max="50" class="range-input" />
        <span class="range-value">{{ brushSize }}px</span>
      </div>
      <div class="tool-group">
        <label class="tool-label">颜色</label>
        <input type="color" v-model="brushColor" class="color-input" />
      </div>
      <div class="tool-group">
        <button class="tool-btn" @click="undo" title="撤销">↩️ 撤销</button>
        <button class="tool-btn" @click="clearCanvas" title="清空">🗑️ 清空</button>
      </div>
      <div class="tool-group tool-actions">
        <button class="tool-btn action-btn" @click="downloadImage">💾 下载</button>
        <button class="tool-btn action-btn primary" @click="sendToImageGen">🎨 发送到图生图</button>
      </div>
    </div>

    <!-- 画布区域 -->
    <div class="canvas-container">
      <canvas
        ref="canvasRef"
        @mousedown="startDraw"
        @mousemove="draw"
        @mouseup="endDraw"
        @mouseleave="endDraw"
        @touchstart.prevent="startDrawTouch"
        @touchmove.prevent="drawTouch"
        @touchend.prevent="endDraw"
      ></canvas>
      <div v-if="!hasImage && !isDrawing" class="canvas-placeholder" @click="triggerUpload">
        <p>点击加载图片，或直接开始绘画</p>
        <small>也可以从 AI 作图页面的"编辑图片"按钮跳转过来</small>
      </div>
      <input ref="fileInputRef" type="file" accept="image/*" style="display:none" @change="loadLocalImage" />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

const canvasRef = ref(null);
const fileInputRef = ref(null);
const currentTool = ref('brush');
const brushSize = ref(5);
const brushColor = ref('#000000');
const isDrawing = ref(false);
const hasImage = ref(false);
const undoStack = ref([]);
let ctx = null;
let lastX = 0, lastY = 0;

const tools = [
  { id: 'brush', icon: '🖌️', label: '画笔' },
  { id: 'eraser', icon: '🧹', label: '橡皮擦' },
  { id: 'fill', icon: '🪣', label: '填充背景' }
];

onMounted(async () => {
  await nextTick();
  initCanvas();
  const imageUrl = route.query.image;
  if (imageUrl) loadImageFromUrl(imageUrl);
});

function initCanvas() {
  const canvas = canvasRef.value;
  canvas.width = 800;
  canvas.height = 600;
  ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  saveState();
}

function saveState() {
  const canvas = canvasRef.value;
  undoStack.value.push(canvas.toDataURL());
  if (undoStack.value.length > 30) undoStack.value.shift();
}

function undo() {
  if (undoStack.value.length <= 1) return;
  undoStack.value.pop();
  const prev = undoStack.value[undoStack.value.length - 1];
  const img = new Image();
  img.onload = () => {
    ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    ctx.drawImage(img, 0, 0);
  };
  img.src = prev;
}

function clearCanvas() {
  if (!confirm('确定要清空画布吗？')) return;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height);
  hasImage.value = false;
  saveState();
}

function getPos(e) {
  const rect = canvasRef.value.getBoundingClientRect();
  const scaleX = canvasRef.value.width / rect.width;
  const scaleY = canvasRef.value.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY
  };
}

function startDraw(e) {
  if (currentTool.value === 'fill') {
    ctx.fillStyle = brushColor.value;
    ctx.fillRect(0, 0, canvasRef.value.width, canvasRef.value.height);
    saveState();
    return;
  }
  isDrawing.value = true;
  const pos = getPos(e);
  lastX = pos.x;
  lastY = pos.y;
}

function draw(e) {
  if (!isDrawing.value) return;
  const pos = getPos(e);
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(pos.x, pos.y);
  ctx.lineWidth = brushSize.value;
  ctx.globalCompositeOperation = 'source-over';
  if (currentTool.value === 'eraser') {
    ctx.strokeStyle = '#ffffff';
  } else {
    ctx.strokeStyle = brushColor.value;
  }
  ctx.stroke();
  lastX = pos.x;
  lastY = pos.y;
}

function endDraw() {
  if (isDrawing.value) {
    isDrawing.value = false;
    ctx.globalCompositeOperation = 'source-over';
    saveState();
  }
}

function startDrawTouch(e) {
  const touch = e.touches[0];
  startDraw({ clientX: touch.clientX, clientY: touch.clientY });
}

function drawTouch(e) {
  const touch = e.touches[0];
  draw({ clientX: touch.clientX, clientY: touch.clientY });
}

function loadImageFromUrl(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const canvas = canvasRef.value;
    const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (canvas.width - w) / 2;
    const y = (canvas.height - h) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, x, y, w, h);
    hasImage.value = true;
    saveState();
  };
  img.src = url;
}

function triggerUpload() {
  fileInputRef.value.click();
}

function loadLocalImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => loadImageFromUrl(ev.target.result);
  reader.readAsDataURL(file);
}

function downloadImage() {
  const link = document.createElement('a');
  link.download = `edited_${Date.now()}.png`;
  link.href = canvasRef.value.toDataURL('image/png');
  link.click();
}

function sendToImageGen() {
  const dataUrl = canvasRef.value.toDataURL('image/png');
  sessionStorage.setItem('canvasImage', dataUrl);
  router.push('/image-generator?from=canvas');
}
</script>

<style scoped>
.page-title-bar {
  margin-bottom: 16px;
}
.page-tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--border-color);
}
.page-tab {
  padding: 8px 20px;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 0.95em;
  font-weight: 500;
  color: var(--text-muted);
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.15s;
  text-decoration: none;
}
.page-tab:hover { color: var(--text-primary); }
.page-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  margin-bottom: 16px;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tool-label {
  font-size: 0.85em;
  font-weight: 600;
  color: var(--text-secondary);
}

.tool-btn {
  padding: 6px 12px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
  cursor: pointer;
  font-size: 0.85em;
  font-weight: 600;
  color: var(--text-on-card);
  transition: all 0.2s;
}

.tool-btn:hover { border-color: var(--accent); color: var(--accent); }
.tool-btn.active { border-color: var(--accent); background: var(--accent-bg); color: var(--accent); }

.action-btn.primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-color: transparent;
}

.range-input { width: 100px; cursor: pointer; }
.range-value { font-size: 0.8em; color: var(--text-muted); min-width: 36px; }
.color-input { width: 32px; height: 32px; border: none; cursor: pointer; border-radius: 6px; }

.tool-actions { margin-left: auto; }

.canvas-container {
  position: relative;
  background: var(--bg-card);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.canvas-container canvas {
  max-width: 100%;
  cursor: crosshair;
  display: block;
}

.canvas-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  pointer-events: auto;
}

.canvas-placeholder p { font-weight: 600; font-size: 1.1em; color: var(--text-secondary); }
.canvas-placeholder small { margin-top: 6px; font-size: 0.85em; }
</style>
