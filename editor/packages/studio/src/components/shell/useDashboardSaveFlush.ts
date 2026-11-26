// Flushes every pending Studio save (DOM edits, the code editor, captions). The dashboard save
// bridge calls it before the SneepCut app leaves Studio.
import { useDashboardSaveBridge } from "../../hooks/useDashboardSaveBridge";

interface PendingSaves {
  waitForPendingDomEditSaves: () => Promise<unknown>;
  flushPendingSourceSave: () => Promise<{ status: string; error?: unknown }>;
  flushCaptions: () => Promise<unknown>;
}

export function useDashboardSaveFlush(
  projectId: string | null,
  saves: PendingSaves,
  showToast: (message: string, tone: "error") => void,
) {
  useDashboardSaveBridge(
    projectId,
    async () => {
      await saves.waitForPendingDomEditSaves();
      const source = await saves.flushPendingSourceSave();
      if (source.status !== "clean") throw source.error;
      await saves.flushCaptions();
    },
    showToast,
  );
}
