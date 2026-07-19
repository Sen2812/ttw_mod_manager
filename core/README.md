# Mod Manager Core

**可运行的** Total War Mod 管理器核心库 + CLI 工具。

从 WH3-Mod-Manager 提取，零 UI 依赖，可在 Node.js 环境中独立运行。

## 快速开始

```bash
cd core
npm install
npx ts-node src/cli.ts help
```

## CLI 命令

```bash
# 查看帮助
npx ts-node src/cli.ts help

# 列出所有 mod
npx ts-node src/cli.ts list

# 按名称过滤
npx ts-node src/cli.ts list "camera"

# 启用/禁用 mod
npx ts-node src/cli.ts enable "Better_Camera.pack"
npx ts-node src/cli.ts disable "Better_Camera.pack"

# 扫描 mod 目录
npx ts-node src/cli.ts scan

# 预设管理
npx ts-node src/cli.ts preset list
npx ts-node src/cli.ts preset create "My Modpack"
npx ts-node src/cli.ts preset apply "My Modpack"

# 切换游戏
npx ts-node src/cli.ts game list
npx ts-node src/cli.ts game set wh2

# 查看状态
npx ts-node src/cli.ts info
```

## 架构

```
core/src/
├── types/                  # 类型定义
│   ├── mod.ts              # Mod, Preset
│   ├── game.ts             # GameDefinition, SupportedGame
│   ├── pack.ts             # Pack, PackedFile, SchemaField
│   └── compat.ts           # 碰撞检测类型
│
├── game-definitions/       # 游戏注册表
│   ├── registry.ts         # GameRegistry 类
│   └── builtin-games.ts    # 9 款全战游戏定义
│
├── mod-manager/            # 核心业务逻辑
│   ├── mod-discovery.ts    # 文件系统扫描 + Steam 路径发现
│   ├── mod-sorting.ts      # 12 种排序策略 + 过滤
│   ├── preset-manager.ts   # 预设 CRUD/应用/二分调试
│   └── mod-manager.ts      # ModManager 主类 (编排层)
│
├── pack-file/              # Pack 文件读取
│   ├── pack-header-reader.ts   # 头部解析器
│   └── node-binary-reader.ts   # Node.js 二进制读取实现
│
├── config/                 # 配置持久化
│   └── config-manager.ts   # 去抖写入、原子保存
│
├── compat/                 # 文件级覆盖分析
│   └── overwrite-detector.ts
│
└── cli.ts                  # CLI 入口 (可直接运行)
```

## 作为库使用

```typescript
import { ModManager } from "./src";

const mm = new ModManager({
  configDir: "./my-config",
  log: console.log,
});

// 初始化（自动检测 Steam 路径、扫描 mod）
await mm.init();

// 列出 mod
const mods = mm.getMods();
console.log(`Found ${mods.length} mods`);

// 操作 mod
mm.enableMod("my_mod.pack");
mm.disableMod("another_mod.pack");
mm.setModLoadOrder("my_mod.pack", 0);

// 预设
mm.createPreset("My Modpack");
mm.applyPreset("My Modpack");

// 切换游戏
await mm.setGame("wh2");
```

## 核心能力

| 能力 | 说明 |
|------|------|
| **游戏自动发现** | 自动从 Steam 注册表/libraryfolders.vdf 找到所有游戏安装路径 |
| **Mod 扫描** | 扫描 data/、data/modding/、Workshop content/ 三个目录 |
| **Pack 头部读取** | 读取 .pack 文件头部，获取依赖关系和 movie 标记 |
| **排序/过滤** | 12 种排序策略 + 正则过滤 |
| **预设管理** | 创建/应用/删除/更新预设，支持二分调试 |
| **配置持久化** | 去抖写入、原子保存、备份 |
| **覆盖分析** | 启用 mod 间文件覆盖检测 |
| **多游戏支持** | 9 款全战游戏，可通过注册表扩展 |

## 从原项目提取的代码量

| 来源文件 | 提取行数 | 目标文件 |
|----------|----------|----------|
| `supportedGames.ts` | ~200 行 | `game-definitions/` |
| `modSortingHelpers.ts` | ~150 行 | `mod-sorting.ts` |
| `modsHelpers.ts` | ~50 行 | `mod-sorting.ts` |
| `appSlice.ts` (preset 相关) | ~400 行 | `preset-manager.ts` |
| `appConfigFunctions.ts` | ~150 行 | `config-manager.ts` |
| `modFunctions.ts` (discovery) | ~200 行 | `mod-discovery.ts` |
| `packFileHandler.ts` | ~50 行 | `pack-header-reader.ts` |
| `modCompat/` | ~100 行 | `overwrite-detector.ts` |
| **新增** (CLI + ModManager) | ~800 行 | `cli.ts` + `mod-manager.ts` |
| **总计** | ~2876 行 | |
