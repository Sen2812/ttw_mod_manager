# TTW Mod Manager Agent 指南

## 项目概述

TTW Mod Manager 是一个 Total War 系列游戏的模组管理工具，采用前后端分离架构：

- **core**: 核心库 + CLI 工具（TypeScript/Node.js）
- **desktop**: 桌面 GUI（React + Electron + Vite + Tailwind CSS）

## 项目结构

```
ttw_mod_manager/
├── core/                    # 核心库
│   ├── src/                 # 源代码
│   │   ├── cli.ts           # CLI 入口
│   │   ├── index.ts         # 库入口
│   │   ├── types/           # 类型定义
│   │   ├── game-definitions/ # 游戏注册表
│   │   ├── mod-manager/     # 核心业务逻辑
│   │   ├── pack-file/       # Pack 文件读取
│   │   ├── config/          # 配置持久化
│   │   └── compat/          # 兼容性检测
│   ├── dist/                # 编译输出
│   ├── package.json
│   └── tsconfig.json
│
├── desktop/                 # 桌面应用
│   ├── src/                 # 源代码
│   │   ├── App.tsx          # 主应用组件
│   │   ├── main.tsx         # 入口文件
│   │   ├── store.ts         # Zustand 状态管理
│   │   ├── types.ts         # 类型定义
│   │   └── components/      # React 组件
│   ├── electron/            # Electron 主进程
│   ├── dist/                # Vite 构建输出
│   ├── dist-electron/       # Electron 构建输出
│   ├── package.json
│   └── vite.config.ts
│
└── .gitignore
```

## 开发环境要求

- Node.js >= 18
- npm >= 9
- TypeScript >= 5.9

## 快速开始

### 安装依赖

```bash
# 安装 core 依赖
cd core
npm install

# 安装 desktop 依赖
cd ../desktop
npm install
```

### 开发模式

```bash
# 启动 desktop 开发服务器（自动启动 Electron）
cd desktop
npm run dev
```

### 使用 CLI

```bash
# 查看帮助
cd core
npx ts-node src/cli.ts help

# 列出所有 mod
npx ts-node src/cli.ts list

# 启用/禁用 mod
npx ts-node src/cli.ts enable "Better_Camera.pack"
npx ts-node src/cli.ts disable "Better_Camera.pack"

# 预设管理
npx ts-node src/cli.ts preset list
npx ts-node src/cli.ts preset create "My Modpack"
npx ts-node src/cli.ts preset apply "My Modpack"

# 切换游戏
npx ts-node src/cli.ts game list
npx ts-node src/cli.ts game set wh2
```

## 构建

### 构建 Core

```bash
cd core
npm run build
```

### 构建 Desktop

```bash
cd desktop
npm run build
```

## 架构说明

### Core 模块

| 模块 | 职责 |
|------|------|
| `types/` | 定义 Mod、Preset、GameDefinition 等核心类型 |
| `game-definitions/` | 游戏注册表，支持 9 款 Total War 游戏 |
| `mod-manager/` | 核心业务逻辑：mod 发现、排序、预设管理 |
| `pack-file/` | 读取 .pack 文件头部，解析依赖关系 |
| `config/` | 配置持久化，支持去抖写入和原子保存 |
| `compat/` | 文件级和表级冲突检测 |
| `cli.ts` | CLI 入口，可直接运行 |

### Desktop 模块

| 模块 | 职责 |
|------|------|
| `App.tsx` | 主应用组件 |
| `store.ts` | Zustand 状态管理 |
| `components/` | React UI 组件（ModList、Sidebar、TopBar 等） |
| `electron/` | Electron 主进程代码 |

## 核心能力

- **游戏自动发现**: 从 Steam 注册表/libraryfolders.vdf 自动找到游戏安装路径
- **Mod 扫描**: 扫描 data/、data/modding/、Workshop content/ 目录
- **Pack 头部读取**: 解析 .pack 文件获取依赖和 movie 标记
- **排序/过滤**: 12 种排序策略 + 正则过滤
- **预设管理**: 创建/应用/删除/更新预设，支持二分调试
- **配置持久化**: 去抖写入、原子保存、备份
- **碰撞检测**: 文件级和表级冲突检测
- **多游戏支持**: 9 款 Total War 游戏

## 作为库使用

```typescript
import { ModManager } from "mod-manager-core";

const mm = new ModManager({
  configDir: "./my-config",
  log: console.log,
});

await mm.init();

const mods = mm.getMods();
console.log(`Found ${mods.length} mods`);

mm.enableMod("my_mod.pack");
mm.createPreset("My Modpack");
mm.applyPreset("My Modpack");

await mm.setGame("wh2");
```

## 贡献指南

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 许可证

MIT License
