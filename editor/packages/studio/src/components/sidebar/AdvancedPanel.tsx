// Avansat (developer tools): Cod | Compoziții segment, the file tree with the source editor card,
// the file preview for media and binary files, the compositions list, and "Verifică" (lint)
// pinned at the bottom with the open findings count.
import { useState, type ReactNode } from "react";
import { t, useLocale } from "../../i18n/translate";
import { FONT_EXT, isMediaFile } from "../../utils/mediaTypes";
import { FileTree } from "../editor/FileTree";
import { MediaPreview } from "../MediaPreview";
import { CompositionsTab } from "./CompositionsTab";
import { CodeEditorCard } from "./CodeEditorCard";
import {
  CountBadge,
  PanelBody,
  PanelCard,
  PanelIconButton,
  PanelPill,
  PanelSegment,
} from "./panelKit";

export type AdvancedView = "code" | "compositions";

export interface AdvancedPanelProps {
  view: AdvancedView;
  onViewChange: (view: AdvancedView) => void;
  projectId: string;
  compositions: string[];
  activeComposition: string | null;
  onSelectComposition: (comp: string) => void;
  onAddCompositionToTimeline?: (path: string) => void;
  onRenderComposition?: (comp: string) => void;
  isRendering?: boolean;
  fileTree?: string[];
  editingFile?: { path: string; content: string | null } | null;
  onSelectFile?: (path: string) => void;
  onCreateFile?: (path: string) => void;
  onCreateFolder?: (path: string) => void;
  onDeleteFile?: (path: string) => void;
  onRenameFile?: (oldPath: string, newPath: string) => void;
  onDuplicateFile?: (path: string) => void;
  onMoveFile?: (oldPath: string, newPath: string) => void;
  onImportFiles?: (files: FileList, dir?: string) => void | Promise<string[] | void>;
  /** The source editor for the open text file. */
  codeChildren?: ReactNode;
  onLint?: () => void;
  linting?: boolean;
  lintFindingCount?: number;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
}

function isPreviewFile(path: string): boolean {
  return isMediaFile(path) || FONT_EXT.test(path);
}

function LintFooter({
  onLint,
  linting,
  count,
}: {
  onLint: () => void;
  linting?: boolean;
  count?: number;
}) {
  const label = count === 1 ? t("code.lintCountOne") : t("code.lintCount", { n: count ?? 0 });
  return (
    <div className="flex items-center gap-2">
      <PanelPill
        icon="lint"
        className="!flex-1"
        disabled={linting}
        aria-busy={linting}
        onClick={onLint}
      >
        {linting ? t("lint.running") : t("lint.run")}
      </PanelPill>
      {!linting && count != null && count > 0 ? <CountBadge count={count} label={label} /> : null}
    </div>
  );
}

// fallow-ignore-next-line complexity
export function AdvancedPanel(props: AdvancedPanelProps) {
  useLocale();
  const { view, onViewChange, editingFile } = props;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [showTree, setShowTree] = useState(false);
  const previewPath = editingFile && isPreviewFile(editingFile.path) ? editingFile.path : null;
  const filePreview = view === "code" && previewPath && !showTree;
  // A media file left with "Înapoi la fișiere" has nothing to edit: show the empty state, not
  // "Nu se poate afișa conținutul", which is for fonts and other non-media binaries.
  const editorState: "empty" | "loading" | "binary" | "editor" = !editingFile
    ? "empty"
    : previewPath
      ? isMediaFile(previewPath)
        ? "empty"
        : "binary"
      : editingFile.content == null
        ? "loading"
        : "editor";
  // Media files keep the preview card visible (St-Shell-FilePreview); fonts and other binaries
  // show "Nu se poate afișa conținutul" in the editor card (St-Shell-FileError).
  const showEditorCard = view === "code" && !(previewPath && isMediaFile(previewPath) && !showTree);

  const selectFile = (path: string) => {
    setShowTree(false);
    props.onSelectFile?.(path);
  };

  return (
    <div ref={setAnchor} data-advanced-panel="" className="contents">
      <PanelCard
        title={filePreview ? t("code.filePreview") : t("advanced.title")}
        actions={
          filePreview ? (
            <PanelIconButton
              icon="chevronLeft"
              label={t("code.backToFiles")}
              onClick={() => setShowTree(true)}
            />
          ) : undefined
        }
        footer={
          props.onLint && !filePreview ? (
            <LintFooter
              onLint={props.onLint}
              linting={props.linting}
              count={props.lintFindingCount}
            />
          ) : undefined
        }
      >
        {filePreview ? (
          <PanelBody>
            <MediaPreview projectId={props.projectId} filePath={previewPath} />
          </PanelBody>
        ) : (
          <>
            <PanelSegment
              label={t("advanced.tools")}
              value={view}
              onChange={onViewChange}
              options={[
                { value: "code", label: t("advanced.code") },
                { value: "compositions", label: t("advanced.comps") },
              ]}
            />
            {view === "code" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <FileTree
                  files={props.fileTree ?? []}
                  activeFile={editingFile?.path ?? null}
                  onSelectFile={selectFile}
                  onCreateFile={props.onCreateFile}
                  onCreateFolder={props.onCreateFolder}
                  onDeleteFile={props.onDeleteFile}
                  onRenameFile={props.onRenameFile}
                  onDuplicateFile={props.onDuplicateFile}
                  onMoveFile={props.onMoveFile}
                  onImportFiles={props.onImportFiles}
                  lintFindingsByFile={props.lintFindingsByFile}
                />
              </div>
            ) : (
              <CompositionsTab
                projectId={props.projectId}
                compositions={props.compositions}
                activeComposition={props.activeComposition}
                onSelect={props.onSelectComposition}
                onAddToTimeline={props.onAddCompositionToTimeline}
                onRenderComposition={props.onRenderComposition}
                isRendering={props.isRendering}
                lintFindingsByFile={props.lintFindingsByFile}
              />
            )}
          </>
        )}
      </PanelCard>
      {showEditorCard ? (
        <CodeEditorCard
          anchor={anchor}
          path={editingFile?.path ?? null}
          state={editorState}
          editor={props.codeChildren}
        />
      ) : null}
    </div>
  );
}
