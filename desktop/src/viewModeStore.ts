/**
 * 每个 profile 的 mod 列表显示模式（自动记忆 + 自动持久化）。
 *
 * 模式：
 *   - "all"      显示全部 mod
 *   - "enabled"  只显示启用的 mod
 *   - "disabled" 只显示禁用的 mod
 *
 * 按 `${gameId}:${profileName}` 记忆，切换 profile / 游戏时自动恢复。
 * 通过 persist 中间件写入 localStorage，无需手动保存（UI 偏好，非关键数据）。
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ViewMode = "all" | "enabled" | "disabled";

const STORAGE_KEY = "viewmode-storage";

interface ViewModeState {
  /** 所有记忆的模式，key = `${gameId}:${profileName}` */
  modes: Record<string, ViewMode>;
  /** 当前应用的模式（由当前 game + profile 决定） */
  current: ViewMode;
  /** 设置当前模式并记忆到对应的 game+profile 键下。 */
  setMode: (gameId: string, profileName: string, mode: ViewMode) => void;
  /** 切换 game / profile 时加载已记忆的模式。 */
  loadMode: (gameId: string, profileName: string) => void;
}

export const useViewModeStore = create<ViewModeState>()(
  persist(
    (set, get) => ({
      modes: {},
      current: "all",
      setMode: (gameId, profileName, mode) => {
        const key = `${gameId}:${profileName}`;
        set((s) => ({
          modes: { ...s.modes, [key]: mode },
          current: mode,
        }));
      },
      loadMode: (gameId, profileName) => {
        const key = `${gameId}:${profileName}`;
        const mode = get().modes[key] ?? "all";
        set({ current: mode });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ modes: s.modes }), // 只持久化记忆表，current 每次启动重新 load
    },
  ),
);
