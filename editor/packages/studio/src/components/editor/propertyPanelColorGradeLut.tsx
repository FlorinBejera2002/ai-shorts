// "LUT" block. Compact (St-Grade): the LUT select and its strength side by side. Full
// (St-Inspector-LUT, St-Inspector-LUTError): the select, the loaded .cube files with their size and
// a delete action, and the import button. A .cube that cannot be read is not applied: the error
// card shows above the select and the file is marked in the list.
import { useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedHfColorGrading } from "@hyperframes/core/color-grading";
import { useTrackDesignInput } from "../../contexts/DesignPanelInputContext";
import { useFileManagerContextOptional } from "../../contexts/FileManagerContext";
import { t, useLocale } from "../../i18n/translate";
import { LUT_EXT } from "../../utils/mediaTypes";
import { DeleteConfirmDialog } from "../sidebar/PanelDialog";
import { PillButton } from "../ui/PillButton";
import type { createColorGradingActions } from "./propertyPanelColorGradingControls";
import { formatFileSize, readCubeFile, useLutFileSizes } from "./propertyPanelColorGradeLutFiles";
import { LookMenuSelect } from "./propertyPanelColorLookSelect";
import {
  LOOK_ICONS,
  LOOK_ROW,
  LookAlert,
  LookBlock,
  LookIcon,
  LookIconButton,
  LookSlider,
} from "./propertyPanelColorLookUi";

type GradeActions = ReturnType<typeof createColorGradingActions>;

const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

export function GradeLutBlock({
  grading,
  assets,
  actions,
  onImportAssets,
  variant = "full",
}: {
  grading: NormalizedHfColorGrading;
  assets: string[];
  actions: GradeActions;
  onImportAssets?: (files: FileList, dir?: string) => Promise<string[]>;
  variant?: "compact" | "full";
}) {
  const locale = useLocale();
  const track = useTrackDesignInput();
  const files = useFileManagerContextOptional();
  const inputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [failedName, setFailedName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // A deleted file's LUT is cleared from the clip once the file is really gone from the project.
  // A ref, not state: it only marks a pending clear and nothing renders from it.
  const deletedPathRef = useRef<string | null>(null);
  const lutAssets = useMemo(
    () => assets.filter((asset) => LUT_EXT.test(asset)).sort((a, b) => a.localeCompare(b)),
    [assets],
  );
  const lut = grading.lut;
  const sizes = useLutFileSizes(variant === "full" ? lutAssets : []);
  useEffect(() => {
    const deletedPath = deletedPathRef.current;
    if (!deletedPath || lutAssets.includes(deletedPath)) return;
    if (lut?.src === deletedPath) actions.applyLut(null);
    deletedPathRef.current = null;
  }, [actions, lut?.src, lutAssets]);
  const lutOptions = [
    { value: "", label: t("look.lut.none") },
    ...(lut?.src && !lutAssets.includes(lut.src)
      ? [{ value: lut.src, label: fileName(lut.src) }]
      : []),
    ...lutAssets.map((asset) => ({ value: asset, label: fileName(asset) })),
  ];

  const importFiles = async (picked: FileList | null) => {
    if (!picked?.length) return;
    const name = picked[0]?.name ?? null;
    setImporting(true);
    setFailedName(null);
    let imported = false;
    try {
      const file = picked[0];
      if (file && !(await readCubeFile(file))) {
        setFailedName(name ?? "");
        return;
      }
      await actions.importLut(picked, onImportAssets, () => {
        imported = true;
        track("button", "Import LUT");
      });
      if (!imported) setFailedName(name ?? "");
    } catch {
      setFailedName(name ?? "");
    } finally {
      setImporting(false);
    }
  };

  const confirmDelete = async (path: string) => {
    setPendingDelete(null);
    track("button", "Delete LUT");
    deletedPathRef.current = path;
    await files?.handleDeleteFile(path);
  };

  const select = (
    <div data-flat-grade-lut-select="true" className="min-w-0">
      <LookMenuSelect
        name="lut"
        popupAnchor="parent"
        label={t("look.lut.title")}
        value={lut?.src ?? ""}
        options={lutOptions}
        onChange={(src) => {
          track("select", "Custom LUT");
          setFailedName(null);
          actions.applyLut(src || null, src && lut?.src === src ? lut.intensity : 1);
        }}
      />
    </div>
  );

  if (variant === "compact") {
    return (
      <LookBlock title={t("look.lut.title")} data-flat-grade-lut="compact">
        <div className="relative grid grid-cols-2 items-end gap-2.5">
          {select}
          <LookSlider
            label={t("look.lut.strength")}
            value={Math.round((lut?.intensity ?? 1) * 100)}
            min={0}
            max={100}
            disabled={!lut}
            tier={!lut || lut.intensity === 1 ? "default" : "explicitCustom"}
            displayValue={`${Math.round((lut?.intensity ?? 1) * 100)}%`}
            onCommit={(value) => lut && actions.applyLut(lut.src, value / 100)}
            onReset={() => lut && actions.applyLut(lut.src, 1)}
          />
        </div>
      </LookBlock>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col gap-6" data-flat-grade-lut="true">
      {failedName !== null && <LookAlert>{t("look.lut.error")}</LookAlert>}
      <LookBlock title={t("look.lut.title")}>
        <div className="relative">{select}</div>
      </LookBlock>
      {(lutAssets.length > 0 || failedName) && (
        <LookBlock title={t("look.lut.loaded")} data-flat-grade-lut-list="true">
          {failedName && (
            <LutRow
              name={failedName}
              status={t("look.lut.readError")}
              onDelete={() => setFailedName(null)}
            />
          )}
          {lutAssets.map((asset) => (
            <LutRow
              key={asset}
              name={fileName(asset)}
              status={sizes[asset] ? formatFileSize(sizes[asset], locale) : undefined}
              onDelete={files ? () => setPendingDelete(asset) : undefined}
            />
          ))}
        </LookBlock>
      )}
      <PillButton
        variant="secondary"
        className="mt-auto w-full"
        disabled={!onImportAssets || importing}
        onClick={() => inputRef.current?.click()}
        title={t("look.lut.import")}
      >
        <LookIcon d={LOOK_ICONS.upload} />
        {importing ? t("look.lut.importing") : t("look.lut.import")}
      </PillButton>
      <input
        ref={inputRef}
        type="file"
        accept=".cube"
        className="hidden"
        data-flat-grade-lut-input="true"
        onChange={(event) => {
          // The FileList is live: clearing the input before the import has read it empties it.
          const input = event.currentTarget;
          void importFiles(input.files).finally(() => {
            input.value = "";
          });
        }}
      />
      {pendingDelete && (
        <DeleteConfirmDialog
          title={t("look.lut.deleteTitle")}
          message={t("look.lut.deleteMessage", { name: fileName(pendingDelete) })}
          onConfirm={() => void confirmDelete(pendingDelete)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function LutRow({
  name,
  status,
  onDelete,
}: {
  name: string;
  status?: string;
  onDelete?: () => void;
}) {
  return (
    <div
      data-flat-grade-lut-row={name}
      className={`flex min-h-[52px] items-center gap-2 py-2 pr-2 pl-3 ${LOOK_ROW}`}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] font-medium text-studio-text">{name}</span>
        {status && <span className="truncate text-[11px] text-studio-muted">{status}</span>}
      </span>
      {onDelete && (
        <LookIconButton
          label={t("look.lut.delete", { name })}
          icon={LOOK_ICONS.trash}
          data-flat-grade-lut-delete={name}
          onClick={onDelete}
        />
      )}
    </div>
  );
}
