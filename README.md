# Fluent Music Glass

一个使用 **Rust + Tauri 2 + React + Fluent UI React v9** 编写的桌面音乐播放器。Rust 后端负责访问音乐 API，前端通过 Tauri IPC 获取搜索结果、播放链接、歌曲详情、歌单、专辑与歌词。

## V0.2.1 白屏稳定性修复

- 增加启动占位界面，前端资源加载期间不再显示纯白窗口
- 增加 React 全局错误边界；运行异常时显示恢复页，而不是直接白屏
- 增加“清理播放器缓存并重启”按钮，解决旧版本地数据结构不兼容
- 本地缓存读取加入完整类型校验，异常的队列、收藏、历史、音量、音质设置会自动回退
- localStorage 读写全部容错，隐私模式、存储配额异常不会拖垮界面
- 默认开启稳定模式：保留玻璃质感，同时降低多层模糊、动态背景和 Canvas 的 GPU 开销
- Canvas 动态视觉限制刷新率，并在窗口隐藏时暂停绘制
- 为旧版 WebView 增加 ResizeObserver、Canvas roundRect 等兼容回退
- Media Session 全部能力检测与异常隔离，系统媒体接口不完整时不会导致页面崩溃
- 移除开发环境 React StrictMode 的重复副作用执行
- 设置窗口原生背景色，减少 Tauri WebView 创建阶段的白色闪烁

## V0.2 功能

- 全新简洁动态玻璃 UI：Mica/亚克力卡片、动态环境光、封面模糊背景、浅色/深色主题
- 独立音乐播放室：沉浸封面唱片、超大同步歌词、播放队列、动态控制台
- 动态音频视觉：律动柱状与流动波形两种模式，可在设置中切换
- 自适应响应布局：宽屏三栏、中等双栏、窄屏单栏，窗口最小宽度降至 720px
- 播放模式：顺序播放、单曲循环、随机播放
- 定时关闭：15/30/45/60/90 分钟或本曲结束后停止
- 播放速度：0.75×、1×、1.25×、1.5×、2×
- 平滑淡入切歌、静音、重新加载当前音质
- 最近播放、搜索历史、收藏、播放队列本地持久化
- 搜索结果分页加载更多
- 队列拖动排序、单曲移除、清空队列
- 系统 Media Session：系统媒体键、系统播放面板、进度同步
- 快捷键：Space 播放/暂停、F 进入播放室、Esc 返回、Alt+←/→ 切歌
- 尊重系统“减少动态效果”设置

## API 功能

默认接口：

```text
https://api.bugpk.com/api/163_music
```

Rust 命令对应：

| 功能 | type |
| --- | --- |
| 搜索 | `search` |
| 歌曲详情 | `song` |
| 播放链接 | `url` |
| 歌词 | `lyric` |
| 歌单 | `playlist` |
| 专辑 | `album` |
| 链接/ID 综合解析 | `json` |

需要更换接口地址时，可设置环境变量：

```bash
MUSIC_API_BASE=https://example.com/api/163_music npm run tauri dev
```

Windows PowerShell：

```powershell
$env:MUSIC_API_BASE="https://example.com/api/163_music"
npm run tauri dev
```

## 开发运行

1. 安装 Node.js 22 或符合 Vite 8 要求的版本。
2. 安装 Rust stable、Cargo 和 Tauri 2 对应的系统依赖。
3. 在项目目录执行：

```bash
npm install
npm run tauri dev
```

## 构建安装包

```bash
npm run tauri build
```

安装包会生成到：

```text
src-tauri/target/release/bundle/
```

## 仅检查前端

```bash
npm run build
```

## 目录结构

```text
fluent-music-player/
├─ src/
│  ├─ App.tsx          # 应用状态、音乐库、独立播放室与控制逻辑
│  ├─ Visualizer.tsx   # 兼容性优化后的 Canvas 动态音频视觉
│  ├─ ErrorBoundary.tsx # 运行异常恢复页与缓存修复
│  ├─ api.ts           # Tauri IPC 封装
│  ├─ lyrics.ts        # LRC 解析与同步
│  ├─ types.ts         # TypeScript 数据类型
│  └─ styles.css       # Fluent/Mica 动态玻璃与响应式样式
├─ src-tauri/
│  ├─ src/lib.rs       # Rust API 客户端与 Tauri Commands
│  ├─ tauri.conf.json  # 窗口、CSP、打包配置
│  └─ Cargo.toml
└─ package.json
```

## 注意事项

- 播放链接通常带时效，切歌或重新加载音质时会重新请求。
- 部分歌曲受版权、地区、账号或接口能力限制，可能没有播放地址或高音质资源。
- 动态频谱用于播放状态的视觉反馈，不读取或上传用户音频数据。
- “稳定模式”默认开启；高性能设备可在“播放设置”中关闭，以恢复更强的模糊与动画效果。
- 若旧版升级后仍异常，可在恢复页选择“清理播放器缓存并重启”。
- 本项目不实现音乐文件下载，请遵守内容版权、平台条款和当地法律。
- 第三方接口字段变化时，需要同步调整 `src-tauri/src/lib.rs` 的反序列化结构。
