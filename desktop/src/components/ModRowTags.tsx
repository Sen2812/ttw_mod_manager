import { useT } from "../i18n";
import { useWorkshopTagLabel } from "../utils/workshop-tag-label";
import { getModSourceColor, getWorkshopTagColor, type TagColorStyle } from "../utils/workshop-tag-colors";
import clsx from "clsx";
import type { ModSourceType } from "@core/mod-manager/mod-display";

interface ModRowTagsProps {
  source: ModSourceType;
  workshopTags: string[];
  variant?: "row" | "detail";
}

function TagPill({
  label,
  colors,
  title,
  compact,
  emphasized,
}: {
  label: string;
  colors: TagColorStyle;
  title?: string;
  compact?: boolean;
  emphasized?: boolean;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-md shrink-0",
        emphasized ? "font-semibold tracking-wide border-2" : "font-medium border",
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
      )}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        borderColor: colors.border,
      }}
      title={title}
    >
      {label}
    </span>
  );
}

/** Source badge + read-only workshop tags from Steam. */
export default function ModRowTags({
  source,
  workshopTags,
  variant = "row",
}: ModRowTagsProps) {
  const t = useT();
  const tagLabel = useWorkshopTagLabel();
  const isDetail = variant === "detail";
  const isWorkshop = source === "workshop";
  const sourceColors = getModSourceColor(source);

  const sourceBadge = (
    <TagPill
      label={isWorkshop ? t("modlist.sourceWorkshop") : t("modlist.sourceLocal")}
      colors={sourceColors}
      compact={!isDetail}
      emphasized
      title={isWorkshop ? t("modlist.sourceWorkshopHint") : t("modlist.sourceLocalHint")}
    />
  );

  const workshopPills = workshopTags.map(tag => (
    <TagPill
      key={tag}
      label={tagLabel(tag)}
      colors={getWorkshopTagColor(tag)}
      compact={!isDetail}
      title={t("category.workshopTagHint", { tag })}
    />
  ));

  if (isDetail) {
    return (
      <div className="flex flex-wrap gap-1.5 items-center">
        {sourceBadge}
        {workshopPills}
        {workshopTags.length === 0 && (
          <span className="text-xs text-morandi-text-muted">{t("category.noWorkshopTags")}</span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {sourceBadge}
      {workshopPills}
    </div>
  );
}
