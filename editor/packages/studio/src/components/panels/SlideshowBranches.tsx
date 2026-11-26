// Slideshow branches (St-Output-SlideshowBranches, -Rename, -Delete, -NoBranches): a new-branch
// field with "Adaugă", one card per branch with rename and delete (confirmed with the delete
// illustration), and the scenes assigned to each branch.
import { useCallback, useId, useState } from "react";
import type { SlideSequence } from "@hyperframes/core/slideshow";
import type { SceneInfo } from "./slideshowPanelHelpers";
import { t, useLocale } from "../../i18n/translate";
import { OutputButton, OutputIconButton } from "../output/OutputButton";
import { OutputDialog, OutputIllustration } from "../output/OutputDialog";
import { OutputInput } from "../output/OutputFields";
import { illustrationSrc } from "../ui/illustrations";

export interface BranchTreeProps {
  sequences: SlideSequence[];
  scenes: SceneInfo[];
  onCreateSequence: (label: string) => void;
  onRenameSequence: (id: string, label: string) => void;
  onDeleteSequence: (id: string) => void;
  onAssign: (sequenceId: string, sceneId: string, assign: boolean) => void;
  selectedSceneId: string | null;
  selectedSequenceId: string | null;
  onSelectBranchSlide: (sequenceId: string, sceneId: string) => void;
}

export function BranchTree({
  sequences,
  scenes,
  onCreateSequence,
  onRenameSequence,
  onDeleteSequence,
  onAssign,
  selectedSceneId,
  selectedSequenceId,
  onSelectBranchSlide,
}: BranchTreeProps) {
  useLocale();
  const [newLabel, setNewLabel] = useState("");
  const inputId = useId();

  const handleCreate = useCallback(() => {
    const label = newLabel.trim();
    if (!label) return;
    onCreateSequence(label);
    setNewLabel("");
  }, [newLabel, onCreateSequence]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 gap-2">
        <OutputInput
          id={inputId}
          type="text"
          placeholder={t("slides.newBranch")}
          aria-label={t("slides.newBranchAria")}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
        />
        <OutputButton variant="primary" icon="plus" padX={12} onClick={handleCreate}>
          {t("slides.add")}
        </OutputButton>
      </div>
      {sequences.length === 0 ? (
        <span className="text-[13px] font-medium text-[var(--st-t2)]">
          {t("slides.noBranches")}
        </span>
      ) : (
        sequences.map((seq) => (
          <BranchItem
            key={seq.id}
            seq={seq}
            scenes={scenes}
            onRename={onRenameSequence}
            onDelete={onDeleteSequence}
            onAssign={onAssign}
            selectedSceneId={selectedSceneId}
            selectedSequenceId={selectedSequenceId}
            onSelectBranchSlide={onSelectBranchSlide}
          />
        ))
      )}
    </div>
  );
}

interface BranchItemProps {
  seq: SlideSequence;
  scenes: SceneInfo[];
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onAssign: (sequenceId: string, sceneId: string, assign: boolean) => void;
  selectedSceneId: string | null;
  selectedSequenceId: string | null;
  onSelectBranchSlide: (sequenceId: string, sceneId: string) => void;
}

// fallow-ignore-next-line complexity
function BranchItem({
  seq,
  scenes,
  onRename,
  onDelete,
  onAssign,
  selectedSceneId,
  selectedSequenceId,
  onSelectBranchSlide,
}: BranchItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(seq.label);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const commitRename = useCallback(() => {
    const label = draft.trim();
    if (label && label !== seq.label) onRename(seq.id, label);
    setEditing(false);
  }, [draft, onRename, seq.id, seq.label]);

  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-studio-surface p-2.5 shadow-[inset_0_0_0_1px_var(--st-bd)]">
      <div className="flex min-w-0 items-center gap-1">
        {editing ? (
          <OutputInput
            height={36}
            value={draft}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditing(false);
            }}
            aria-label={t("slides.rename", { label: seq.label })}
          />
        ) : (
          <b className="min-w-0 flex-1 truncate text-[13px] font-semibold">{seq.label}</b>
        )}
        <OutputIconButton
          icon="pen"
          label={t("slides.rename", { label: seq.label })}
          size={28}
          iconSize={14}
          pressed={editing}
          onClick={() => {
            setDraft(seq.label);
            setEditing(true);
          }}
        />
        <OutputIconButton
          icon="trash"
          label={t("slides.deleteBranch", { label: seq.label })}
          size={28}
          iconSize={14}
          onClick={() => setConfirmingDelete(true)}
        />
      </div>
      <div className="flex flex-col gap-1">
        {scenes.map((scene) => {
          const assigned = seq.slides.some((s) => s.sceneId === scene.id);
          const isSelected = selectedSequenceId === seq.id && selectedSceneId === scene.id;
          const name = scene.label || scene.id;
          return (
            <div key={scene.id} className="flex min-h-8 min-w-0 items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                aria-label={t("slides.assign", { scene: name, branch: seq.label })}
                checked={assigned}
                onChange={(e) => onAssign(seq.id, scene.id, e.target.checked)}
                className="h-4 w-4 flex-none accent-[var(--st-btn)]"
              />
              {assigned ? (
                <button
                  type="button"
                  aria-pressed={isSelected}
                  className={`min-w-0 flex-1 truncate rounded-lg px-1.5 py-1 text-left outline-none hover:bg-[var(--st-sub)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-btn)] ${
                    isSelected ? "font-semibold" : "font-medium"
                  }`}
                  onClick={() => onSelectBranchSlide(seq.id, scene.id)}
                >
                  {name}
                </button>
              ) : (
                <span className="min-w-0 flex-1 truncate px-1.5 text-[var(--st-t2)]">{name}</span>
              )}
            </div>
          );
        })}
      </div>
      <OutputDialog
        open={confirmingDelete}
        title={t("slides.deleteBranchTitle")}
        onClose={() => setConfirmingDelete(false)}
        width={420}
        footer={
          <>
            <OutputButton onClick={() => setConfirmingDelete(false)}>
              {t("slides.cancel")}
            </OutputButton>
            <OutputButton
              variant="dangerFill"
              onClick={() => {
                setConfirmingDelete(false);
                onDelete(seq.id);
              }}
            >
              {t("slides.delete")}
            </OutputButton>
          </>
        }
      >
        <OutputIllustration src={illustrationSrc("delete")} size={132} caption={seq.label} />
        <span className="text-center text-[13px] font-medium text-[var(--st-t2)]">
          {t("slides.deleteBranchBody")}
        </span>
      </OutputDialog>
    </div>
  );
}
