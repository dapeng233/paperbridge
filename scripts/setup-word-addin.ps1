# SciTools Word Add-in 一键配置脚本 (Windows)
# 运行方式: 右键 -> 使用 PowerShell 运行

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$CertsDir = Join-Path $ProjectRoot "certs"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   SciTools Word Add-in 配置向导" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: 检查并创建证书目录
Write-Host "[1/4] 检查证书目录..." -ForegroundColor Yellow
if (-not (Test-Path $CertsDir)) {
    New-Item -ItemType Directory -Path $CertsDir | Out-Null
    Write-Host "      已创建 certs 目录" -ForegroundColor Green
} else {
    Write-Host "      certs 目录已存在" -ForegroundColor Green
}

# Step 2: 检查 mkcert 是否安装
Write-Host ""
Write-Host "[2/4] 检查 mkcert 工具..." -ForegroundColor Yellow

$mkcertPath = $null
$possiblePaths = @(
    (Get-Command mkcert -ErrorAction SilentlyContinue).Source,
    "$env:LOCALAPPDATA\mkcert\mkcert.exe",
    "$ProjectRoot\tools\mkcert.exe"
)

foreach ($path in $possiblePaths) {
    if ($path -and (Test-Path $path)) {
        $mkcertPath = $path
        break
    }
}

if (-not $mkcertPath) {
    Write-Host "      mkcert 未安装，正在下载..." -ForegroundColor Yellow

    # 创建 tools 目录
    $toolsDir = Join-Path $ProjectRoot "tools"
    if (-not (Test-Path $toolsDir)) {
        New-Item -ItemType Directory -Path $toolsDir | Out-Null
    }

    $mkcertPath = Join-Path $toolsDir "mkcert.exe"
    $mkcertUrl = "https://github.com/FiloSottile/mkcert/releases/download/v1.4.4/mkcert-v1.4.4-windows-amd64.exe"

    try {
        # 尝试直接下载
        Invoke-WebRequest -Uri $mkcertUrl -OutFile $mkcertPath -UseBasicParsing
        Write-Host "      mkcert 下载完成" -ForegroundColor Green
    } catch {
        # 如果 GitHub 下载失败，尝试使用 npmmirror 镜像
        Write-Host "      GitHub 下载失败，尝试镜像..." -ForegroundColor Yellow
        $mkcertMirror = "https://registry.npmmirror.com/-/binary/mkcert/v1.4.4/mkcert-v1.4.4-windows-amd64.exe"
        try {
            Invoke-WebRequest -Uri $mkcertMirror -OutFile $mkcertPath -UseBasicParsing
            Write-Host "      mkcert 下载完成 (镜像)" -ForegroundColor Green
        } catch {
            Write-Host ""
            Write-Host "      下载失败！请手动下载 mkcert：" -ForegroundColor Red
            Write-Host "      https://github.com/FiloSottile/mkcert/releases" -ForegroundColor White
            Write-Host "      下载后放到: $toolsDir" -ForegroundColor White
            Read-Host "按回车键退出"
            exit 1
        }
    }
}

Write-Host "      mkcert 路径: $mkcertPath" -ForegroundColor Green

# Step 3: 安装本地 CA 并生成证书
Write-Host ""
Write-Host "[3/4] 生成 HTTPS 证书..." -ForegroundColor Yellow

$certFile = Join-Path $CertsDir "localhost.pem"
$keyFile = Join-Path $CertsDir "localhost-key.pem"

if ((Test-Path $certFile) -and (Test-Path $keyFile)) {
    Write-Host "      证书已存在，跳过生成" -ForegroundColor Green
} else {
    Write-Host "      安装本地根证书 (需要管理员权限)..." -ForegroundColor Yellow

    # 以管理员身份安装 CA
    Start-Process -FilePath $mkcertPath -ArgumentList "-install" -Wait -Verb RunAs

    Write-Host "      生成 localhost 证书..." -ForegroundColor Yellow
    Push-Location $CertsDir
    & $mkcertPath localhost 127.0.0.1 ::1

    # 重命名为项目期望的文件名
    if (Test-Path "localhost+2.pem") {
        Rename-Item "localhost+2.pem" "localhost.pem" -Force
        Rename-Item "localhost+2-key.pem" "localhost-key.pem" -Force
    }
    Pop-Location

    Write-Host "      证书生成完成" -ForegroundColor Green
}

# Step 4: 配置 Word Add-in
Write-Host ""
Write-Host "[4/4] 配置 Word Add-in..." -ForegroundColor Yellow

$manifestSource = Join-Path $ProjectRoot "word-addin\manifest.xml"
$wordAddinsFolder = "$env:USERPROFILE\AppData\Local\Microsoft\Office\16.0\Wef"

# 检查 Word 版本并创建目录
if (-not (Test-Path $wordAddinsFolder)) {
    New-Item -ItemType Directory -Path $wordAddinsFolder -Force | Out-Null
}

# 创建共享文件夹配置（用于 Word 侧加载）
$sharedFolder = Join-Path $ProjectRoot "word-addin"
Write-Host "      Add-in 文件夹: $sharedFolder" -ForegroundColor Gray

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   配置完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "接下来请按以下步骤在 Word 中加载插件：" -ForegroundColor White
Write-Host ""
Write-Host "1. 确保 SciTools 应用正在运行" -ForegroundColor Cyan
Write-Host ""
Write-Host "2. 打开 Word，点击 [文件] -> [选项] -> [信任中心]" -ForegroundColor Cyan
Write-Host "   -> [信任中心设置] -> [受信任的加载项目录]" -ForegroundColor Cyan
Write-Host ""
Write-Host "3. 在 [目录 URL] 中添加以下路径：" -ForegroundColor Cyan
Write-Host "   $sharedFolder" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. 勾选 [在菜单中显示]，点击 [添加目录]，然后 [确定]" -ForegroundColor Cyan
Write-Host ""
Write-Host "5. 重启 Word，在 [插入] -> [我的加载项] -> [共享文件夹]" -ForegroundColor Cyan
Write-Host "   中找到 [SciTools 引用助手] 并添加" -ForegroundColor Cyan
Write-Host ""
Write-Host "提示：首次加载可能需要信任 localhost 证书" -ForegroundColor Gray
Write-Host ""

# 询问是否打开文件夹
$openFolder = Read-Host "是否打开 Add-in 文件夹？(Y/N)"
if ($openFolder -eq "Y" -or $openFolder -eq "y") {
    Start-Process explorer.exe -ArgumentList $sharedFolder
}

Read-Host "按回车键退出"
