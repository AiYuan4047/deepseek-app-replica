# DeepSeek App Replica

尽可能复刻 DeepSeek 官方手机端（Android）交互与视觉体验的客户端。

与官方客户端的区别在于未接入官方账号体系，改为直接输入用户自己的 DeepSeek 开放平台 API Key。官方 App 通过账号登录受限于日常用量配额，而直接接入个人 API Key 采用按量计费（Pay-as-you-go），只要账户额度充裕即可自由使用不受限额打断；同时所有会话数据均保存在设备本地。

---

## 核心特性

- **流式深度思考**：还原 DeepSeek-R1 思考链展示，支持折叠/展开动画、思考状态高亮扫光微动效与自动跟随滚动。
- **联网搜索与引用溯源**：支持智能搜索模式，提供底部上拉式引用来源抽屉，点击来源可直接在内置独立浏览器中阅读网页原文。
- **按住说话（Hold to Talk）**：还原长按录音交互面板与实时声波振幅动画，支持上滑取消与平滑色彩过渡。
- **相册与多模态输入**：内置原生相册选取抽屉，支持相机拍照、相册多选、最近图片快速预取与微缩预览。
- **原生沉浸与布局适配**：适配全面屏手势与系统安全区，软键盘弹起时输入框自适应对齐（`adjustResize`）。
- **完善的内容排版**：内置完整 Markdown 解析引擎，支持 KaTeX 数学公式排版、代码语法高亮与一键复制、Mermaid 结构图表。
- **深浅色主题自适应**：跟随系统自动切换深色/浅色模式，支持中英文双语界面。
- **历史记录导入与导出**：支持将本地会话与图片打包为 ZIP 归档导出或恢复。

---

## 技术架构

项目采用 Android 原生容器承载高性能 Web 交互内核的架构：

- **Android 原生层**：基于 Java 17 与 Android SDK 37（最低兼容 Android 12 / API 32）。通过 WebView 加载本地构建产物，并封装系统级能力：API Key 经 Android Keystore 加密存储、原生麦克风录音采集（`AudioRecord`）、系统相册快速预取以及独立的网页浏览器（`SourceBrowserActivity`）。
- **Web 交互层**：React 18 + TypeScript + Zustand 状态管理，基于 CSS Modules 进行交互细节调优，引入 KaTeX、Mermaid 与 Prism.js 提供排版渲染。
- **构建系统**：Rspack 2 高速打包，与 Gradle `buildWeb` 构建任务无缝联动。

---

## 快速开始

### 开发环境准备
- **Node.js**：22.12 或更高版本
- **pnpm**：包管理器
- **JDK**：Java Development Kit 17 或更高版本
- **Android SDK**：API Level 32 ~ 37

### 1. 克隆代码与安装依赖
```sh
git clone https://github.com/lijiahua1024/DeepSeek-App-Replica.git
cd DeepSeek-App-Replica
pnpm install
```

### 2. 构建 Android APK
在项目根目录下执行 Gradle 构建脚本（构建过程会自动运行 `pnpm build` 打包前端资源至 Android assets）：

```powershell
.\android\gradlew.bat -p android :app:assembleDebug
```

构建完成后，生成的调试安装包位于：
```text
android/app/build/outputs/apk/debug/app-debug.apk
```

### 3. 本地独立调试（可选）
如果仅需调试界面布局与交互逻辑，可启动本地开发服务器：

```sh
pnpm dev
```
启动后在浏览器中打开 `http://localhost:8090` 即可预览。

---

## 使用说明

1. 首次打开应用后，点击左上角抽屉菜单进入「设置」。
2. 在 API 配置中填入在 DeepSeek 开放平台申请的 API Key。
3. 返回聊天界面，即可体验完整的多轮对话、深度思考、联网搜索与多模态能力。

---

## 项目结构

```text
├── android/            # Android 原生容器源码与 Gradle 工程
│   └── app/src/main/   # 原生代码（Keystore 存储、录音机、相册、沙箱浏览器）
├── src/
│   ├── app/            # 应用整体布局、主题体系与 Android 平台适配
│   ├── components/     # UI 组件库（聊天流、输入框、搜索抽屉、设置面板等）
│   ├── services/       # 业务逻辑（API 请求、流式解析、会话存储与备份）
│   ├── i18n/           # 多语言文案（中/英）
│   └── utils/          # 通用工具函数
├── rspack.config.ts    # Rspack 打包配置
└── package.json        # 项目配置与脚本入口
```

---

## 免责声明

本项目仅供个人技术研究与前端/移动端交互学习交流使用，非 DeepSeek 官方发布版本。项目内所有商标、标识及版权均归其各自所有者所有。

## 开源协议

本项目采用 [GPL-3.0 许可证](LICENSE)。部分基础代码源自 DeepSeek 官方开源的 [chat-demo](https://github.com/deepseek-ai/chat-demo)（基于 MIT 许可证），依其条款保留原作者版权声明。
