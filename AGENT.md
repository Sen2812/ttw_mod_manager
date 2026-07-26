# TTW Mod Manager — Agent 指南

面向 AI 协作者的规则手册。**维护原则：只写「下次写代码时必须看到」的约定与红线，不写变更流水账。**

## 项目概览

Total War 系列模组管理器，monorepo 两包：

| 包 | 路径 | 职责 |
|---|---|---|
| **core** | `core/` | 无 UI 的业务库 + CLI（TypeScript / Node.js） |
| **desktop** | `desktop/` | Electron 桌面 GUI（React + Vite + Tailwind + Zustand） |

**实际测试范围**：Windows 11 + Steam + **Warhammer III (`wh3`)**。`core` 注册了 9 款游戏定义，但 README 仅对外宣称 WH3；改其他游戏前先确认路径/启动逻辑。

## 项目结构

```
ttw_mod_manager/
├── core/src/
│   ├── types/              # Mod, Preset, GameDefinition, compat 类型
│   ├── game-definitions/   # 内置 9 款游戏 + GameRegistry
│   ├── mod-manager/        # 扫描、排序、预设、Workshop、依赖检测
│   ├── pack-file/          # .pack 头部 / 索引读取
│   ├── config/             # mod-manager-config.json 持久化
│   ├── compat/             # 文件级冲突 + 覆盖分析
│   ├── launcher/           # used_mods.txt、CA Launcher 同步
│   ├── cli.ts              # CLI 入口
│   └── index.ts            # 库公共导出
├── desktop/
│   ├── src/                # React 渲染进程
│   │   ├── App.tsx, store.ts
│   │   ├── components/     # ModList, Sidebar, TopBar, SettingsPage 等
│   │   ├── i18n/           # zh / en 双语
│   │   └── types.ts        # window.api 类型（与 preload 对齐）
│   ├── electron/
│   │   ├── main.ts         # IPC 主进程、ModManager 生命周期
│   │   ├── preload.cjs     # contextBridge → window.api
│   │   ├── steam-client.ts # fork steam-sub 子进程
│   │   └── steam-sub.cjs   # steamworks 原生调用（Workshop）
│   └── steamworks/         # steamworks.js 绑定 + steam_api64.dll
└── docs/screenshots/       # README 截图
```

## 环境要求

- **Node.js 24+**（见 `.nvmrc`：`24.14.1`）
- npm
- TypeScript 5.9
- **Windows** 为主目标；core 含 Linux 启动路径但未充分测试
- 开发 desktop 需本地 **Steam**（Workshop 订阅/更新/依赖查询走 steamworks IPC）

## 常用命令

```bash
# 安装
cd core && npm install
cd ../desktop && npm install

# 开发（Vite + Electron，勿单独用浏览器打开 Vite 页面）
cd desktop && npm run dev

# 构建
cd core && npm run build
cd ../desktop && npm run build          # tsc + vite + electron 编译
cd desktop && npm run dist              # electron-builder → release/

# CLI（core 目录）
npx ts-node src/cli.ts help
npx ts-node src/cli.ts list
npx ts-node src/cli.ts preset list
npx ts-node src/cli.ts game set wh3
```

## 架构要点

### 分层

```
React (renderer)  ←window.api→  preload.cjs  ←IPC→  main.ts  →  ModManager (core)
                                                                    ↓
                                                          steam-sub.cjs (steamworks)
```

- **业务逻辑放 core**，desktop 只做 UI 编排与平台能力（对话框、Steam 子进程、启动 exe）。
- 渲染进程通过 `@core` alias 引用类型/纯函数；**禁止**在 renderer 侧 import 会拉入 `fs`/`path` 的 core 模块（见 `vite.config.ts` 的 `optimizeDeps.exclude`）。
- Electron 主进程直接 `import` `../../core/src`（dev 时源码；build 后打包进 dist-electron）。

### Steam 集成

- `steam-client.ts` 通过 **fork `steam-sub.cjs`** 串行调用 steamworks，避免并发 `init()` 干扰下载。
- core 侧 Workshop 网络能力通过 **injectable fetcher** 注入：
  - `setWorkshopRequiredIdsFetcher` — 依赖 mod ID
  - `setWorkshopSubscriptionsFetcher` — 已订阅 ID 列表
- Steam 离线 / IPC 不可用时，依赖查询会降级；Workshop **下载/更新直接尝试**（对齐 WH3MM，无前置 ping 门禁）。`SteamStatusHint` 仅提示，不禁用操作。
- **强制更新**只触发 Steam 下载（保留本地 pack）；缺封面时用 Web API `preview_url` 补全。启动后台 enrichment 也会批量补缺图。

### 数据持久化

| 文件 | 位置 | 内容 |
|---|---|---|
| `settings.json` | Electron `userData` | 可选自定义 `dataDir` |
| `mod-manager-config.json` | `dataDir`（默认 = userData） | 预设、游戏路径、分类、偏好 |
| `presets-{gameId}.json` | `dataDir` | 按游戏拆分的预设快照 |
| `ui-state.json` | `dataDir` | profile 过滤模式等 UI 状态 |
| `app.log` | `dataDir` | 会话日志（用户反馈用） |

用户可在 Settings 修改 `dataDir`；切换后 ModManager 用新目录重建。

### 状态管理（renderer）

| Store | 文件 | 持久化 |
|---|---|---|
| 主应用状态 | `store.ts` | 无（靠 IPC 保存到 dataDir） |
| 语言 | `i18n/index.ts` | localStorage |

**脏数据流**：用户改 mod 顺序/启用 → `isDirty` → 显式 Save 或关闭/启动前确认 → `save-mod-state` / `save-presets` IPC。

## Core 模块职责

| 模块 | 关键文件 | 职责 |
|---|---|---|
| `mod-manager/` | `mod-manager.ts` | 编排层，桌面/CLI 主 API |
| | `mod-discovery.ts` | Steam 路径发现、mod 扫描、Workshop 元数据 |
| | `mod-sorting.ts` | 排序、过滤、去重 |
| | `preset-manager.ts` | Profile CRUD、应用、二分调试 |
| | `preset-order.ts` | Profile 顺序 JSON 导入/导出 |
| | `workshop-update*.ts` | Workshop 更新检测与触发 |
| | `dependency-checker.ts` | 必须 mod / 缺失依赖 |
| | `local-pack-import.ts` | 本地 .pack 导入 |
| `compat/` | `overwrite-detector.ts` | 启用 mod 间文件覆盖分析 |
| `launcher/` | `used-mods.ts`, `launcher-sync.ts` | 写 `used_mods.txt`、同步 CA Launcher |
| `pack-file/` | `pack-header-reader.ts`, `pack-index-reader.ts` | 读 pack 头与文件索引 |

## Desktop 组件地图

| 组件 | 用途 |
|---|---|
| `ModList` | 主列表、拖拽排序、启用/禁用 |
| `Sidebar` | Profile 切换与管理 |
| `TopBar` | 保存、启动、更新检查、设置入口 |
| `CompatPanel` | 覆盖/冲突详情 |
| `ModDependencyModal` | 依赖查看 |
| `ModUpdateModal` | Workshop 单项/批量更新 |
| `SettingsPage` | 数据目录、偏好、路径 |
| `SteamStatusHint` | Steam 连接状态 |

新增 UI 字符串必须同时更新 `desktop/src/i18n/locales/en.ts` 与 `zh.ts`。

## IPC 约定

- 通道命名：`kebab-case`（如 `check-mod-updates`）。
- 新增 IPC：**三处同步** — `main.ts` handler → `preload.cjs` 暴露 → `types.ts` 的 `window.api` 类型。
- 长耗时 Workshop 操作在 main 进程异步执行，通过 `mods-updated` 事件推送结果，避免阻塞 toggle/enable 返回。
- 主进程推送事件：`mods-updated`、`prerequisites-check-started/done`、`confirm-close`、`save-before-close`。

## 红线与约定

1. **Node 24+**，与 CI（`.github/workflows/release.yml`）保持一致。
2. **默认游戏 `wh3`**；示例代码、测试假设优先 WH3。
3. **core 零 UI 依赖** — 不在 core 引入 React/Electron。
4. **Steam 子进程串行** — 不要并行 fork 多个 `steam-sub.cjs`。
5. **Windows 写配置** — `ConfigManager` 在 desktop 环境用直接 `writeFile`（避免 rename 权限问题）；改持久化逻辑时注意。
6. **i18n 双语** — 用户可见文案走 `useT()`，禁止硬编码中文/英文（开发调试日志除外）。
7. **不要提交** `mod-manager-config.json`、`ui-state.json`、本地日志（已在 `.gitignore`）。
8. 改 `window.api` _surface 时跑 `desktop` 的 `tsc`，确保 `types.ts` 与 preload 一致。

## 作为库使用

```typescript
import { ModManager } from "mod-manager-core";

const mm = new ModManager({ configDir: "./my-config", log: console.log });
await mm.init();

mm.enableMod("my_mod.pack");
mm.createPreset("My Modpack");
await mm.setGame("wh3");
```

桌面端注入 Workshop fetcher 的示例见 `desktop/electron/main.ts` 初始化段。

## 深入文档

| 文档 | 内容 |
|---|---|
| [README.md](./README.md) | 功能列表、安装、支持游戏 |
| [README.zh-CN.md](./README.zh-CN.md) | 中文说明 |
| [core/README.md](./core/README.md) | CLI 命令、core 架构、库 API |

## 许可证

MIT — 见 `core/package.json`。
