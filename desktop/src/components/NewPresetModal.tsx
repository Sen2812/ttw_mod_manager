import { useState } from "react";
import { useStore } from "../store";
import { useT } from "../i18n";
import { X, Copy, FilePlus } from "lucide-react";

export default function NewPresetModal() {
  const t = useT();
  const { showNewPresetModal, setShowNewPresetModal, setPresets, setActivePresetName } = useStore();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createFromCurrent, setCreateFromCurrent] = useState(true);

  if (!showNewPresetModal) return null;

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t("newPreset.errorEmpty"));
      return;
    }
    if (trimmed === "Default") {
      setError(t("newPreset.errorReserved"));
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const result = await window.api.createPreset(trimmed, createFromCurrent);
      if (!Array.isArray(result)) {
        setError(result.error ?? t("newPreset.errorFailed"));
        return;
      }
      setPresets(result);
      setActivePresetName(trimmed);
      setName("");
      setShowNewPresetModal(false);
    } catch (e: any) {
      setError(e.message || t("newPreset.errorFailed"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setName("");
    setShowNewPresetModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-morandi-text/20 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative card-morandi w-80 p-6">
        <button onClick={handleClose} className="absolute top-3 right-3 p-1 rounded hover:bg-morandi-hover transition-colors">
          <X className="w-4 h-4 text-morandi-text-secondary" />
        </button>
        <h3 className="text-base font-semibold text-morandi-text mb-4">{t("newPreset.title")}</h3>

        <input type="text" value={name} onChange={e => { setName(e.target.value); setError(null); }}
          onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") handleClose(); }}
          placeholder={t("newPreset.placeholder")} autoFocus className="input-morandi mb-3" />

        <div className="mb-4 space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={createFromCurrent} onChange={() => setCreateFromCurrent(true)}
              className="w-4 h-4 text-morandi-accent" />
            <div className="flex items-center gap-1.5">
              <Copy className="w-3.5 h-3.5 text-morandi-text-secondary" />
              <span className="text-sm text-morandi-text">{t("newPreset.copyCurrent")}</span>
            </div>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={!createFromCurrent} onChange={() => setCreateFromCurrent(false)}
              className="w-4 h-4 text-morandi-accent" />
            <div className="flex items-center gap-1.5">
              <FilePlus className="w-3.5 h-3.5 text-morandi-text-secondary" />
              <span className="text-sm text-morandi-text">{t("newPreset.createEmpty")}</span>
            </div>
          </label>
        </div>

        {error && <p className="text-xs text-morandi-danger mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={handleClose} className="btn-morandi-ghost">{t("common.cancel")}</button>
          <button onClick={handleCreate} disabled={!name.trim() || isCreating} className="btn-morandi">
            {isCreating ? t("newPreset.creating") : t("common.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
