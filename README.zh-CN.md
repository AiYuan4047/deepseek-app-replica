# chat-demo

## Android 复刻

Android 版复用本仓库中的 MIT 版 [DeepSeek Chat Demo](https://github.com/deepseek-ai/chat-demo)。首次打开时输入 DeepSeek 开放平台 API Key，校验通过后由 Android Keystore 加密保存。会话数据保存在应用本地。

需要 Node.js 22.12+、pnpm、JDK 17+ 和 Android SDK 37。构建后，调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

```powershell
pnpm install --frozen-lockfile
.\android\gradlew.bat -p android :app:assembleDebug
```

界面参考设备为小米 10（1080×2340，440 dpi），参考应用为 DeepSeek 2.8.0（298）。鲸鱼图标来自 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/web/public/favicon.svg)。

安装 FFmpeg 后可以用下列命令比较同一台设备的无损 PNG。裁剪是 `x,y,宽,高`，单位为物理像素。示例裁掉状态栏时钟和系统图标。

```powershell
node scripts/compare-pixels.mjs captures/official/home.png captures/replica/home.png --crop 0,90,1080,2250
```

对于录屏，可用 `--frames 参考帧,复刻帧` 选取两边从零起算的解码帧。Android 的 MP4 录屏存在有损编码和可变间隔，可用于比较动画轨迹与时间。静态画面是否逐像素一致，以 `adb exec-out screencap -p` 输出的 PNG 为准。脚本返回 0 表示匹配，1 表示存在像素差异，2 表示输入或解码错误。

在 1080×2340 参考机上打开待测 App 的聊天页，从关闭的抽屉开始运行以下命令。脚本通过测试机现有的 `su` 权限按下、移动、停顿并截图。最后一档会反向拖动，并在松开后另存一张状态图。对两个 App 使用相同参数，即可对比每次停顿。

```powershell
.\scripts\capture-drawer-pauses.ps1 -Device 192.168.1.78:5555 -OutputDirectory captures/replica/drawer-pauses
```

[English](README.md) | 简体中文

基于 DeepSeek API 的静态聊天示例。无需应用后端，浏览器直接请求配置的 API 服务。

点击 [在线体验](https://deepseek-ai.github.io/chat-demo/) 即可使用，也可以前往 [Releases](https://github.com/deepseek-ai/deepseek-chat-demo/releases) 下载压缩包，解压后双击 `index.html` 在本地使用，无需安装或构建。首次使用时，请在设置中填写 API Key。

## 运行

准备 Node.js 22.12+ 和 pnpm：

```sh
git clone https://github.com/deepseek-ai/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

打开 http://localhost:8090 。

生成静态产物：

```sh
pnpm build
```

产物位于 `dist/`，可部署到静态服务器，也可直接打开 `dist/index.html`。直接打开时，浏览器和 API 服务需允许 `file://` 页面的存储与跨域请求。

## 功能

- 多会话、自动标题、重命名与删除；编辑提问、重新生成和切换消息分支。
- 流式回答、深度思考、智能搜索、链接阅读与来源引用；支持停止和符合条件的继续生成。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导入导出。

## 数据

API Key 和设置保存在浏览器 localStorage，会话及附件原件保存在 IndexedDB，本地数据按浏览器用户配置和站点源（origin）隔离。发送对话、上传附件和使用语音功能时，相应内容会提交给配置的 API 服务。

设置中的历史导入导出使用 ZIP 格式。导入会在确认并校验成功后替换全部本地会话和附件；导出包含会话与本地可用的图片原件，不包含 API Key、设置或非图片附件原件。格式与保留范围见[历史导入导出](src/services/chat/history/README.md)。

设置 → 数据管理 → 删除所有对话，会在确认后清空全部本地会话、附件原件和未发送的草稿，停止正在生成的回复并回到新对话。API Key 和其他设置保留，已上传到 API 服务的文件不受影响。

## 开发

| 命令          | 用途                |
| ------------- | ------------------- |
| `pnpm dev`    | 启动开发服务器      |
| `pnpm build`  | 构建到 `dist/`      |
| `pnpm type`   | TypeScript 类型检查 |
| `pnpm lint`   | oxlint 检查         |
| `pnpm format` | oxfmt 格式化        |

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`。`createConfig({ apiOrigin, devServer })` 支持自定义 API 地址和开发服务器代理。

聊天默认使用 `deepseek-flash`，通过 Anthropic 兼容的 Messages / Files API 通信；语音使用 ASR / TTS 接口。请求使用搜索、链接阅读、标题和 `latest_reminder` 等扩展，接入服务需支持相应能力。附件实际支持的格式以服务端校验为准。

```text
src/
  app/                 应用布局、主题与全局样式
  components/          聊天、设置、Markdown 等界面组件
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、本地存储与历史导入导出
    markdown/          Markdown 解析、代码高亮与图表
    speech/            录音与朗读
  utils/               通用工具
```

## 许可证

[MIT](LICENSE)。构建会将许可证复制到 `dist/LICENSE`，分发时请一并保留；第三方依赖遵循各自的许可证。
