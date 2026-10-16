import type { GsapAnimation } from "@hyperframes/core/gsap-parser";
import type { DomEditSelection } from "../components/editor/domEditingTypes";
import { readTextResizeFont } from "../components/editor/manualTextResize";
import {
  commitStaticGsapSize,
  findSizeSetAnimation,
  type GsapDragCommitCallbacks,
} from "./gsapDragCommit";
import { isInstantHold, writeTargetSelector } from "./gsapShared";
import type { GsapEditOutcome } from "./gsapEditOutcome";

/** Typography is a global size choice; entrance opacity/scale animations stay intact. */
export async function tryTextResizeIntercept(
  selection: DomEditSelection,
  size: { width: number; height: number },
  animations: GsapAnimation[],
  commitMutation: GsapDragCommitCallbacks["commitMutation"],
): Promise<GsapEditOutcome | null> {
  const fontSize = readTextResizeFont(selection.element);
  if (fontSize == null) return null;
  const selector = writeTargetSelector(selection);
  if (!selector) return { status: "blocked", reason: "no-selector" };
  const fontAnimations = animations.filter((animation) => "fontSize" in animation.properties);
  if (fontAnimations.some((animation) => !isInstantHold(animation)))
    return { status: "blocked", reason: "source-uneditable" };
  const fontHold = fontAnimations[0];
  await commitMutation(
    selection,
    fontHold
      ? {
          type: "update-properties",
          animationId: fontHold.id,
          properties: { fontSize },
        }
      : {
          type: "add",
          targetSelector: selector,
          method: "set",
          position: 0,
          properties: { fontSize },
          global: true,
        },
    { label: "Resize text", skipReload: true },
  );
  await commitStaticGsapSize(
    selection,
    size,
    selector,
    findSizeSetAnimation(animations, selector, selection.element),
    { commitMutation },
  );
  return { status: "persisted" };
}
