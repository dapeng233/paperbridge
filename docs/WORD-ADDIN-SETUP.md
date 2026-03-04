# SciTools Word 插件配置指南

本指南帮助你在 Word 中配置 SciTools 引用助手插件，实现在 Word 文档中一键插入文献引用。

---

## 快速配置（推荐）

### Windows 用户

1. 双击运行 `scripts/setup-word-addin.bat`
2. 按提示操作，脚本会自动：
   - 下载 mkcert 工具
   - 生成并安装 HTTPS 证书
   - 提示你在 Word 中添加插件

---

## 手动配置

如果自动脚本无法运行，请按以下步骤手动配置：

### 步骤 1：生成 HTTPS 证书

Word Add-in 要求使用 HTTPS，需要生成本地自签名证书。

#### 方法 A：使用 mkcert（推荐）

1. 下载 mkcert：https://github.com/FiloSottile/mkcert/releases
2. 下载 `mkcert-v1.4.4-windows-amd64.exe`，重命名为 `mkcert.exe`
3. 打开命令提示符（管理员）：
   ```bash
   # 安装本地根证书
   mkcert -install

   # 进入项目目录并生成证书
   cd F:\proma\scitools\certs
   mkcert localhost 127.0.0.1 ::1

   # 重命名文件
   ren localhost+2.pem localhost.pem
   ren localhost+2-key.pem localhost-key.pem
   ```

#### 方法 B：使用 OpenSSL

```bash
cd F:\proma\scitools\certs

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout localhost-key.pem \
  -out localhost.pem \
  -subj "/CN=localhost"
```

然后双击 `localhost.pem`，安装到"受信任的根证书颁发机构"。

### 步骤 2：启动 SciTools

确保 SciTools 应用正在运行。开发模式运行：

```bash
cd F:\proma\scitools
npm run electron:dev
```

验证 HTTPS 服务：
- 打开浏览器访问 https://localhost:3443/addin/taskpane.html
- 如果看到插件页面，说明服务正常

### 步骤 3：在 Word 中添加插件

#### 方法 A：通过共享文件夹（推荐）

1. 打开 Word
2. 点击 **文件** → **选项** → **信任中心** → **信任中心设置**
3. 选择 **受信任的加载项目录**
4. 在 **目录 URL** 中输入：
   ```
   F:\proma\scitools\word-addin
   ```
5. 勾选 **在菜单中显示**
6. 点击 **添加目录** → **确定** → **确定**
7. **重启 Word**
8. 在 **插入** → **加载项** → **我的加载项** → **共享文件夹**
9. 找到 **SciTools 引用助手**，点击 **添加**

#### 方法 B：直接上传 manifest

1. 打开 Word
2. 点击 **插入** → **加载项** → **我的加载项**
3. 点击 **上传我的加载项**
4. 选择 `F:\proma\scitools\word-addin\manifest.xml`
5. 点击 **上传**

---

## 使用说明

### 在 Word 中使用插件

1. 打开任意 Word 文档
2. 点击 **插入** → **我的加载项** → **SciTools 引用助手**
3. 侧边栏会显示插件界面

### 插入引用

1. 在插件中选择 **引用样式**（如 GB/T 7714、APA 等）
2. 搜索或点击选择要引用的题录（可多选）
3. 将光标放在 Word 文档中要插入的位置
4. 点击 **插入文内引用** 或 **生成参考文献列表**

### 从 SciTools 主程序推送

1. 在 SciTools 主程序的文献管理页面
2. 选择题录，点击 **Insert** 按钮
3. 如果 Word 插件开启了"自动接收主程序推送"
4. 引用会自动插入到 Word 光标位置

---

## 常见问题

### Q: 插件显示"加载样式失败"

**A:** 检查：
1. SciTools 应用是否正在运行
2. 访问 https://localhost:3443 是否正常
3. 证书是否已信任

### Q: Word 找不到插件

**A:** 检查：
1. 是否已添加信任的加载项目录
2. 路径是否正确（不要有中文）
3. 尝试重启 Word

### Q: 浏览器提示证书不受信任

**A:**
1. 使用 mkcert 并执行 `mkcert -install`
2. 或手动将 `localhost.pem` 安装到受信任的根证书

### Q: manifest.xml 上传失败

**A:**
1. 确保 HTTPS 服务正在运行
2. 检查 manifest.xml 中的 URL 是否正确
3. Word 可能需要能访问这些 URL

---

## 文件说明

```
scitools/
├── word-addin/
│   ├── manifest.xml      # Word Add-in 配置清单
│   ├── taskpane.html     # 插件 UI
│   ├── icon-32.png       # 小图标
│   └── icon-64.png       # 大图标
├── certs/
│   ├── localhost.pem     # HTTPS 证书
│   └── localhost-key.pem # HTTPS 私钥
└── scripts/
    ├── setup-word-addin.bat  # Windows 一键配置
    └── setup-word-addin.ps1  # PowerShell 脚本
```

---

## 技术说明

- Word Add-in 通过 Office.js API 与 Word 交互
- 插件连接 `https://localhost:3443` 获取数据
- 需要 HTTPS 是 Office Add-in 的安全要求
- 轮询机制每 2 秒检查一次主程序推送
