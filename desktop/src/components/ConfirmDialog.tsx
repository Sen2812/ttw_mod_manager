import { useEffect } from "react";
import { useT } from "../i18n";
import { AlertTriangle, Trash2, Info, X } from "lucide-react";
import clsx from "clsx";

export type ConfirmVariant = "warning" | "danger" | "primary";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  /** 可选的次要操作按钮（位于取消和确认之间），用于三选一场景如关闭确认 */
  secondaryText?: string;
  onSecondary?: () => void;
  /** 视觉变体：warning（琥珀）/ danger（粉红）/ primary（灰褐） */
  variant?: ConfirmVariant;
  onConfirm: () => void;
  onCancel: () => void;
}

const VARIANT_STYLES: Record<
  ConfirmVariant,
  { iconBg: string; iconColor: string; icon: typeof AlertTriangle; btn: string }
> = {
  warning: {
    iconBg: "bg-morandi-warning-light/70",
    iconColor: "text-morandi-warning",
    icon: AlertTriangle,
    btn: "btn-morandi-warning",
  },
  danger: {
    iconBg: "bg-morandi-danger-light/70",
    iconColor: "text-morandi-danger",
    icon: Trash2,
    btn: "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 bg-morandi-danger text-white hover:opacity-90 active:scale-[0.97]",
  },
  primary: {
    iconBg: "bg-morandi-accent/10",
    iconColor: "text-morandi-accent",
    icon: Info,
    btn: "btn-morandi",
  },
};

/**
 * 统一的确认对话框。Morandi 风格，带顶部圆形图标。
 *
 * 快捷键：Enter 确认，Esc 取消。
 * 点遮罩取消。open=false 时不渲染。
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  secondaryText,
  onSecondary,
  variant = "warning",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); onConfirm(); }
      else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onConfirm, onCancel, onSecondary]);

  if (!open) return null;

  const s = VARIANT_STYLES[variant];
  const Icon = s.icon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-morandi-text/30 backdrop-blur-sm animate-[fadeIn_150ms_ease-out]"
        onClick={onCancel}
      />
      <div className="relative card-morandi w-[380px] p-6 shadow-morandi-lg">
        <button
          onClick={onCancel}
          className="absolute top-3 right-3 p-1 rounded hover:bg-morandi-hover transition-colors"
          aria-label={t("common.close")}
        >
          <X className="w-4 h-4 text-morandi-text-muted" />
        </button>

        {/* 顶部圆形图标 */}
        <div className={clsx("w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4", s.iconBg)}>
          <Icon className={clsx("w-6 h-6", s.iconColor)} />
        </div>

        <h3 className="text-base font-semibold text-morandi-text text-center mb-2">{title}</h3>
        <p className="text-sm text-morandi-text-secondary text-center mb-6 leading-relaxed">{message}</p>

        <div className="flex justify-center gap-2">
          <button onClick={onCancel} className="btn-morandi-ghost min-w-[88px] justify-center">
            {cancelText ?? t("common.cancel")}
          </button>
          {onSecondary && (
            <button onClick={onSecondary}
              className="btn-morandi-danger min-w-[88px] justify-center">
              {secondaryText}
            </button>
          )}
          <button onClick={onConfirm} className={clsx(s.btn, "min-w-[88px]")}>
            {confirmText ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
