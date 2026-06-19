import { useT } from "../i18n";
import { X, ExternalLink, FolderOpen, Copy, Check, Package, Loader2 } from "lucide-react";
import { useState } from "react";
import clsx from "clsx";
import { useStore } from "../store";
import type { Mod } from "../types";
import ModCategorySelect from "./ModCategorySelect";
import { getModCategory, normalizeWorkshopTags } from "@core/mod-manager/category-utils";
import { getModDisplayName } from "@core/mod-manager/mod-display";
import { getModUpdateStatus } from "@core/mod-manager/workshop-update-status";

interface ModDetailModalProps {
  mod: Mod;
  onClose: () => void;
  categories: string[];
  onCategoryChange: (modName: string, category: string | null) => void;
  onAddCategory: (name: string) => void;
  onShowUpdate?: (modName: string) => void;
}

export default function ModDetailModal({ mod, onClose, categories, onCategoryChange, onAddCategory, onShowUpdate }: ModDetailModalProps) {
  const t = useT();
  const [copied, setCopied] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const isCheckingPrerequisites = useStore(s => !!s.prerequisiteChecking[mod.name]);
  const updateStatus = getModUpdateStatus(mod);

  const displayName = getModDisplayName(mod);
  const workshopUrl = /^\d{5,15}$/.test(mod.workshopId)
    ? `https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.workshopId}`
    : null;

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  const handleOpenWorkshop = async () => {
    if (workshopUrl) {
      try {
        await window.api.openUrl(workshopUrl);
      } catch (e) {
        console.error("Failed to open workshop URL:", e);
      }
    }
  };

  // 打开 mod 所在文件夹，并选中 pack 文件
  const handleOpenFolder = async () => {
    try {
      // 优先选中 pack 文件本身（资源管理器会高亮该文件）。
      // mod.path 是 pack 文件的完整路径。
      const target = mod.path || mod.modDirectory;
      if (target) {
        const result = await window.api.openFolder(target);
        if (!result.ok && result.error) console.error("Failed to open folder:", result.error);
      }
    } catch (e) {
      console.error("Failed to open folder:", e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel w-[480px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-morandi-border-light">
          <h2 className="text-base font-semibold text-morandi-text truncate pr-4">{displayName}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-morandi-hover transition-colors shrink-0">
            <X className="w-4 h-4 text-morandi-text-secondary" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* 封面大图 - contain 模式显示完整图片，不裁剪 */}
          <div className="w-full max-h-[360px] bg-morandi-sidebar flex items-center justify-center overflow-hidden">
            {mod.imgPath && !imgError ? (
              <img
                src={`file:///${mod.imgPath.replace(/\\/g, '/')}`}
                className="w-full h-auto max-h-[360px] object-contain"
                alt={displayName}
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex flex-col items-center gap-2 text-morandi-text-muted py-12">
                <Package className="w-12 h-12" />
                <span className="text-xs">{t("moddetail.noPreview")}</span>
              </div>
            )}
          </div>

          {/* 信息列表 */}
          <div className="px-5 py-4 space-y-4">
            <InfoField label={t("moddetail.workshopName")}>
              <p className="text-sm text-morandi-text">{displayName}</p>
            </InfoField>

            {mod.author && (
              <InfoField label={t("moddetail.author")}>
                <p className="text-sm text-morandi-text">{mod.author}</p>
              </InfoField>
            )}

            <InfoField label={t("moddetail.filename")}>
              <CopyableCode value={mod.name} copied={copied === 'filename'}
                onCopy={() => handleCopy(mod.name, 'filename')} copyTitle={t("moddetail.copyFilename")} />
            </InfoField>

            <InfoField label={t("moddetail.localPath")}>
              <CopyableCode value={mod.path} small copied={copied === 'path'}
                onCopy={() => handleCopy(mod.path, 'path')} copyTitle={t("moddetail.copyPath")} breakAll />
            </InfoField>

            {mod.workshopId && (
              <InfoField label={t("moddetail.workshopId")}>
                <CopyableCode value={mod.workshopId} copied={copied === 'workshopId'}
                  onCopy={() => handleCopy(mod.workshopId, 'workshopId')} copyTitle={t("moddetail.copyWorkshopId")} />
              </InfoField>
            )}

            {workshopUrl && (
              <InfoField label={t("moddetail.workshopPage")}>
                <button
                  onClick={handleOpenWorkshop}
                  className="inline-flex items-center gap-2 text-sm text-morandi-accent hover:text-morandi-accent-hover hover:underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t("moddetail.viewOnWorkshop")}
                </button>
              </InfoField>
            )}

            <div className="grid grid-cols-2 gap-4">
              {mod.size != null && (
                <InfoField label={t("moddetail.fileSize")}>
                  <p className="text-sm text-morandi-text">{formatFileSize(mod.size)}</p>
                </InfoField>
              )}
              <InfoField label={t("moddetail.type")}>
                <p className="text-sm text-morandi-text">
                  {mod.isMovie ? t("moddetail.moviePack") : t("moddetail.modPack")}
                  {mod.isInData && t("moddetail.inData")}
                  {mod.isInModding && t("moddetail.inModding")}
                </p>
              </InfoField>
              {mod.lastChangedLocal && (
                <InfoField label={t("moddetail.lastModified")}>
                  <p className="text-sm text-morandi-text">{new Date(mod.lastChangedLocal).toLocaleDateString()}</p>
                </InfoField>
              )}
              {mod.lastChanged && !mod.isInData && (
                <InfoField label={t("update.workshopVersion")}>
                  <p className="text-sm text-morandi-text">{new Date(mod.lastChanged).toLocaleDateString()}</p>
                </InfoField>
              )}
              {mod.subbedTime && (
                <InfoField label={t("moddetail.subscribed")}>
                  <p className="text-sm text-morandi-text">{new Date(mod.subbedTime).toLocaleDateString()}</p>
                </InfoField>
              )}
            </div>

            <InfoField label={t("category.workshopCategory")}>
              <ModCategorySelect
                value={getModCategory(mod)}
                categories={categories}
                workshopTags={normalizeWorkshopTags(mod.tags)}
                onChange={(cat) => onCategoryChange(mod.name, cat)}
                onAddCategory={onAddCategory}
              />
            </InfoField>

            {!mod.isInData && mod.workshopId && updateStatus !== "ok" && (
              <InfoField label={t("update.title")}>
                <div className="flex items-center gap-2">
                  <span className={clsx(
                    "text-sm",
                    updateStatus === "outdated" ? "text-morandi-warning font-medium" : "text-morandi-text-muted",
                  )}>
                    {t(`update.status.${updateStatus}`)}
                  </span>
                  {updateStatus === "outdated" && onShowUpdate && (
                    <button
                      onClick={() => { onClose(); onShowUpdate(mod.name); }}
                      className="btn-morandi-ghost text-xs"
                    >
                      {t("update.viewDetails")}
                    </button>
                  )}
                </div>
              </InfoField>
            )}

            {isCheckingPrerequisites ? (
              <InfoField label={t("moddetail.workshopPrerequisites")}>
                <div className="space-y-1.5">
                  <div className="prerequisite-skeleton" />
                  <div className="prerequisite-skeleton w-4/5" />
                </div>
                <p className="text-[11px] text-morandi-accent mt-2 flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                  {t("dependency.checking")}
                </p>
              </InfoField>
            ) : (mod.reqModIdToName && mod.reqModIdToName.length > 0) && (
              <InfoField label={t("moddetail.workshopPrerequisites")}>
                <div className="space-y-1">
                  {mod.reqModIdToName.map(([id, name], i) => (
                    <div key={i} className="text-xs text-morandi-text bg-morandi-sidebar px-2 py-1 rounded flex justify-between gap-2">
                      <span className="truncate">{name}</span>
                      <span className="text-morandi-text-muted font-mono shrink-0">{id}</span>
                    </div>
                  ))}
                </div>
              </InfoField>
            )}

            {mod.dependencyPacks && mod.dependencyPacks.length > 0 && (
              <InfoField label={t("moddetail.dependencies")}>
                <div className="space-y-1">
                  {mod.dependencyPacks.map((dep, i) => (
                    <code key={i} className="block text-xs text-morandi-text font-mono bg-morandi-sidebar px-2 py-1 rounded">
                      {dep}
                    </code>
                  ))}
                </div>
              </InfoField>
            )}

            {mod.tags && mod.tags.length > 0 && (
              <InfoField label={t("category.workshopTags")}>
                <div className="flex flex-wrap gap-1">
                  {mod.tags.map((tag, i) => (
                    <span key={i} className="text-xs bg-morandi-sidebar text-morandi-text-secondary px-2 py-0.5 rounded">
                      {tag}
                    </span>
                  ))}
                </div>
              </InfoField>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-morandi-border-light flex items-center justify-between">
          <div className="flex items-center gap-2">
            {workshopUrl && (
              <button onClick={handleOpenWorkshop} className="btn-morandi-ghost text-xs flex items-center gap-1.5">
                <ExternalLink className="w-3.5 h-3.5" />
                {t("moddetail.openWorkshop")}
              </button>
            )}
            <button onClick={handleOpenFolder} className="btn-morandi-ghost text-xs flex items-center gap-1.5">
              <FolderOpen className="w-3.5 h-3.5" />
              {t("moddetail.openFolder")}
            </button>
          </div>
          <button onClick={onClose} className="btn-morandi text-xs">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 信息字段：统一的 label + content 布局 */
function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-morandi-text-secondary uppercase tracking-wider">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** 可复制的代码块 */
function CopyableCode({ value, copied, onCopy, copyTitle, small, breakAll }: {
  value: string; copied: boolean; onCopy: () => void; copyTitle: string;
  small?: boolean; breakAll?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <code className={clsx(
        "flex-1 text-morandi-text font-mono bg-morandi-sidebar px-2.5 py-1.5 rounded",
        small ? "text-xs" : "text-sm",
        breakAll && "break-all",
      )}>
        {value}
      </code>
      <button onClick={onCopy} className="p-1.5 rounded hover:bg-morandi-hover transition-colors shrink-0" title={copyTitle}>
        {copied ? (
          <Check className="w-4 h-4 text-morandi-success" />
        ) : (
          <Copy className="w-4 h-4 text-morandi-text-muted" />
        )}
      </button>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
