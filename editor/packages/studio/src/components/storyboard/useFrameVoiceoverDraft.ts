import { useCallback, useEffect, useState } from "react";
import { setFrameVoiceover } from "@hyperframes/core/storyboard";
import { useFileManagerContext } from "../../contexts/FileManagerContext";
import { useViewMode } from "../../contexts/ViewModeContext";
import { t } from "../../i18n/translate";

export interface FrameVoiceoverDraft {
  draft: string;
  setDraft: (text: string) => void;
  dirty: boolean;
  busy: boolean;
  error: string | null;
  saveVoiceover: () => Promise<void>;
  /** Resolves true when leaving the frame may proceed (not dirty, or the user confirmed). */
  confirmLeave: () => boolean;
}

interface FrameVoiceoverDraftOptions {
  storyboardPath: string;
  frameIndex: number;
  initialVoiceover: string;
  /** Re-parse the manifest after an edit is saved. */
  onSaved: () => void;
}

/**
 * Editable voiceover for one frame, written back to STORYBOARD.md. Guards both
 * tab close (beforeunload) and leaving the frame while the draft is unsaved.
 */
export function useFrameVoiceoverDraft({
  storyboardPath,
  frameIndex,
  initialVoiceover,
  onSaved,
}: FrameVoiceoverDraftOptions): FrameVoiceoverDraft {
  const { readProjectFile, writeProjectFile } = useFileManagerContext();
  const { registerViewModeGuard } = useViewMode();
  const [draft, setDraft] = useState(initialVoiceover);
  const [savedVoiceover, setSavedVoiceover] = useState(initialVoiceover);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyEdit = useCallback(
    async (edit: (source: string) => string) => {
      if (busy) return false; // one read-modify-write at a time; avoids a lost update
      setBusy(true);
      setError(null);
      try {
        const source = await readProjectFile(storyboardPath);
        await writeProjectFile(storyboardPath, edit(source));
        onSaved();
        return true;
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "failed to save");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [readProjectFile, writeProjectFile, storyboardPath, onSaved, busy],
  );

  const dirty = draft !== savedVoiceover;

  const saveVoiceover = useCallback(async () => {
    const saved = await applyEdit((src) => setFrameVoiceover(src, frameIndex, draft));
    if (saved) setSavedVoiceover(draft);
  }, [applyEdit, frameIndex, draft]);

  // Closing the tab with a dirty voiceover would lose it silently — same
  // guard the sibling markdown editor registers for the same class of loss.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Leaving the frame drops the in-memory voiceover draft; confirm while it's
  // dirty. An in-flight save does NOT count as safe: if it fails after unmount
  // the error lands on an unmounted component and the draft is silently lost,
  // so keep confirming until the save actually lands (dirty clears on success).
  const confirmLeave = useCallback(
    () => !dirty || window.confirm(t("story.discardVoice")),
    [dirty],
  );
  useEffect(() => registerViewModeGuard(confirmLeave), [confirmLeave, registerViewModeGuard]);

  return { draft, setDraft, dirty, busy, error, saveVoiceover, confirmLeave };
}
