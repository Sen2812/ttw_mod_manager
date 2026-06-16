# Total War Mod Manager

[English](./README.md)

这是一个**个人使用**的全面战争系列桌面 Mod 管理器。目前仅在 **Windows 11** 下测试过 **战锤 3**，用起来还算顺手；其他全面战争游戏尚未着手适配。

本项目完全由 **Cursor** 辅助开发。如有使用上的问题，欢迎提 Issue。

## 功能

- ~~**多游戏支持** — 战锤 2、三国、特洛伊、法老、阿提拉、罗马 2、幕府 2 等~~ **战锤 3**
- **Profile 管理** — 创建、重命名、切换预设；需手动保存更改
- **加载顺序** — 拖拽排序，显示覆盖 / 冲突提示
- **工坊集成** — 依赖缺失警告、分类标签、更新检测
- **启动游戏** — 写入 `used_mods.txt` 并启动游戏可执行文件
- **导出 / 导入排序** — 以 JSON 分享 Profile 排序（默认文件名：`<profile名>.json`）。如果你愿意和朋友一起用这个 Mod 管理器的话，也许会很有用
- **未保存保护** — 关闭应用或启动游戏前提示保存
- **双语界面** — 中文 / English

## 截图

![主界面 — Mod 列表、Profile 与加载顺序](docs/screenshots/image.png)

## 环境要求

- **Node.js** 18+ 与 npm
- 已安装至少一款受支持的全面战争游戏（**Steam**）
- **Windows**（主要目标平台；core 中含 Linux 启动路径）

## 快速开始

### 1. 安装依赖

```bash
cd core
npm install

cd ../desktop
npm install
```

### 2. 开发模式运行

```bash
cd desktop
npm run dev
```

### 3. 构建

```bash
cd core
npm run build

cd ../desktop
npm run build
```

## 项目结构

```
ttw_mod_manager/
├── core/          # Mod 管理核心库 + CLI
├── desktop/       # Electron 桌面应用（React UI）
└── docs/
    └── screenshots/   # README 截图放这里
```

| 目录                     | 说明                                                     |
| ------------------------ | -------------------------------------------------------- |
| [`core/`](./core/)       | 游戏路径发现、Mod 扫描、预设、Pack 读取、启动器辅助、CLI |
| [`desktop/`](./desktop/) | 图形界面：Mod 列表、Profile、设置、启动游戏              |

CLI 用法与库 API 见 [`core/README.md`](./core/README.md)。

## 支持的游戏

| ID                  | 游戏                     |
| ------------------- | ------------------------ |
| `wh3`               | 全面战争：战锤 3         |
| ~~`wh2`~~           | ~~全面战争：战锤 2~~     |
| ~~`threeKingdoms`~~ | ~~全面战争：三国~~       |
| ~~`troy`~~          | ~~全面战争传奇：特洛伊~~ |
| ~~`pharaoh`~~       | ~~全面战争：法老~~       |
| ~~`dynasties`~~     | ~~全面战争：法老王朝~~   |
| ~~`attila`~~        | ~~全面战争：阿提拉~~     |
| ~~`rome2`~~         | ~~全面战争：罗马 2~~     |
| ~~`shogun2`~~       | ~~全面战争：幕府 2~~     |

## 许可证

MIT — 见 [`core/package.json`](./core/package.json)。
