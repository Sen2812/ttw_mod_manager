# Companion mods

附加 Mod，**不属于** TTW Mod Manager 的安装/打包内容。在仓库中单独维护，需自行构建并启用。

## WH3 — `ttw_campaign_helpers`

战役辅助（单位能力 + 派系/军队/将领数值）。依赖 **Mod Configuration Tool (MCT)**。

| 项 | 值 |
|----|-----|
| Pack | `wh3/ttw_campaign_helpers/ttw_campaign_helpers.pack` |
| MCT key | `ttw_campaign_helpers` |
| 配置方式 | 游戏内 MCT 面板 |

### 构建

```powershell
cd mods/wh3/ttw_campaign_helpers
.\build.ps1
```

需要本机 [RPFM CLI](https://github.com/FrodoWazEre/rpfm) 与 WH3 schema。可用环境变量 `TTW_RPFM_CLI` 指定 CLI 路径。

### 使用

1. 安装并**启用** MCT（常见包名含 `mod_configuration_tool`）
2. 启用本 mod：`ttw_campaign_helpers.pack`（可放入游戏 `data`，或作为本地/工坊 mod 在管理器中勾选）
3. 启动游戏后在 MCT 中调节选项，载入/重载战役生效

管理器「功能」页仅显示该辅助是否可用（需同时启用 MCT 与本 mod），**不再注入或打包**此内容。
