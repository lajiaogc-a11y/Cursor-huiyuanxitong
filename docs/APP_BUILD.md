# FastGC 多端应用打包指南

本文档说明如何将 FastGC 礼品卡系统打包为：

- **PC 桌面端**：Windows / macOS 可安装程序
- **Android 应用**：手机 + 平板
- **iOS 应用**：iPhone + iPad

---

## 一、环境准备

### 1. 通用依赖

```bash
npm install
```

### 2. PC 桌面端（Electron）

- **Node.js** 18+
- **Windows**：无需额外工具
- **macOS**：打包 macOS 应用需在 Mac 上执行

### 3. Android 应用（Capacitor）

- **Android Studio**：https://developer.android.com/studio
- **JDK 17**
- 安装后配置 `ANDROID_HOME` 环境变量

### 4. iOS 应用（Capacitor）

- **macOS** 系统
- **Xcode**：从 App Store 安装
- **CocoaPods**：`sudo gem install cocoapods`
- **Apple 开发者账号**（用于真机测试和上架）

---

## 二、PC 桌面端打包

### Windows 安装包

```bash
npm run build:electron:win
```

输出目录：`release/`，可得到 `.exe` 安装程序。

### macOS 安装包

在 Mac 上执行：

```bash
npm run build:electron:mac
```

输出：`release/` 目录下的 `.dmg` 文件。

### 本地运行（开发调试）

```bash
# 先构建
cross-env VITE_BUILD_TARGET=electron vite build

# 再启动 Electron
npm run electron:dev
```

---

## 三、Android 应用打包

### 首次初始化

```bash
npm run cap:add:android
```

会生成 `android/` 目录。

### 构建并打开 Android Studio

```bash
npm run cap:android
```

或分步执行：

```bash
npm run build:capacitor
npx cap open android
```

### 在 Android Studio 中

1. 等待 Gradle 同步完成
2. 菜单 **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
3. 生成 APK 路径：`android/app/build/outputs/apk/`

### 发布到应用商店

- 选择 **Build** → **Generate Signed Bundle / APK**
- 创建或选择签名密钥
- 生成 AAB 用于 Google Play 上架

---

## 四、iOS 应用打包

### 首次初始化

```bash
npm run cap:add:ios
```

会生成 `ios/` 目录，并自动执行 `pod install`。

### 构建并打开 Xcode

```bash
npm run cap:ios
```

或分步执行：

```bash
npm run build:capacitor
npx cap open ios
```

### 在 Xcode 中

1. 选择目标设备（模拟器或真机）
2. 菜单 **Product** → **Archive** 生成归档
3. 使用 **Distribute App** 上传到 App Store Connect

### 真机测试

- 用数据线连接 iPhone/iPad
- 在 Xcode 中选择真机
- 点击运行按钮安装到设备

---

## 五、平板支持

- **Android 平板**：与手机使用同一 APK，自动适配大屏
- **iPad**：与 iPhone 使用同一工程，自动适配大屏

无需单独打包，同一应用在手机和平板上均可使用。

---

## 六、常用命令速查

| 命令 | 说明 |
|------|------|
| `npm run build:electron:win` | 打包 Windows 桌面端 |
| `npm run build:electron:mac` | 打包 macOS 桌面端 |
| `npm run build:capacitor` | 构建 Web 并同步到 Capacitor |
| `npm run cap:android` | 构建并打开 Android 工程 |
| `npm run cap:ios` | 构建并打开 iOS 工程 |
| `npm run cap:add:android` | 首次添加 Android 平台 |
| `npm run cap:add:ios` | 首次添加 iOS 平台 |

---

## 七、注意事项

1. **Web 部署**：`npm run build` 和 `npm run deploy` 仍用于网页版，不受多端打包影响。
2. **环境变量**：打包前确认 `.env` 中 Supabase 等配置正确。
3. **iOS 证书**：上架 App Store 需配置签名与描述文件。
4. **Android 签名**：发布前需配置 release 签名密钥。
