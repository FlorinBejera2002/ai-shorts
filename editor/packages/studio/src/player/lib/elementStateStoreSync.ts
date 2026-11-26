/**
 * Keeping the player store's preview-owned element state true.
 *
 * The store is what the timeline draws from, and it is populated by element discovery — a
 * message from the preview runtime, which only arrives on load. Anything that edits an
 * element afterwards writes to the preview document and the source file, and the store
 * would go on holding the value it was born with until a reload. That covers automation
 * and FX lanes, the eye (`data-hidden`), and a group's mute.
 *
 * One reader, called from the two places a change lands: the resync every dom-edit
 * attribute commit already runs, and the soft restore an undo or redo applies. It
 * reads the preview rather than being told, because those callers know a file
 * changed, not which attribute — and because several separate writers shipped without
 * remembering to sync, which is what a single sink prevents.
 */

import { HF_AUDIO_AUTOMATION_ATTR } from "@hyperframes/core/audio-automation";
import { HF_AUDIO_FX_ATTR } from "@hyperframes/core/audio-fx";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";
import { groupInfoFor } from "./timelineGroupInfo";

/** The preview node an element stands for, by dom id and then by `data-hf-id`. */
function previewNodeFor(doc: Document, element: TimelineElement): Element | null {
  const domId = element.domId ?? element.id;
  const byId = domId ? doc.getElementById(domId) : null;
  if (byId) return byId;
  return element.hfId ? doc.querySelector(`[data-hf-id="${element.hfId}"]`) : null;
}

/**
 * What an element's synced fields SHOULD read, given the preview.
 *
 * Its own fields come off its node; the group fields are its copy of what its group
 * carries. The timeline derives a group's lanes, chain and mute from these mirrors,
 * never from the group element — and the FX rack is not group-aware: selecting a group
 * and automating one of its parameters writes `data-automation` on the group node
 * through the ordinary element path, so the group's row would otherwise go on reading
 * the value it was born with.
 *
 * `hidden` follows the eye: the `data-hidden` attribute is the only thing that makes
 * an element hidden on load, so an undo that restores it must be read back the same way.
 */
function syncedFields(doc: Document, element: TimelineElement, node: Element) {
  const group = element.audioGroup ? groupInfoFor(doc, element.audioGroup) : null;
  return {
    hidden: node.hasAttribute("data-hidden") ? true : undefined,
    automation: node.getAttribute(HF_AUDIO_AUTOMATION_ATTR) ?? undefined,
    fxChain: node.getAttribute(HF_AUDIO_FX_ATTR) ?? undefined,
    audioGroupHidden: group?.hidden,
    audioGroupAutomation: group?.automation,
    audioGroupFxChain: group?.fxChain,
  };
}

/**
 * Re-read every element's preview-owned state from the preview document, for a change
 * that reached the DOM without going through this store.
 *
 * That is undo and redo. A soft restore patches the reverted attributes onto the live
 * preview and re-runs the timeline — deliberately, so the frame does not blank — but the
 * store it does not touch is the one the timeline draws, so an undone hide, mute or
 * envelope edit stayed on screen until a reload. A full restore already clears the store
 * and waits for discovery, so it needs nothing from here.
 *
 * Reads rather than being told: an undo restores whole files, so the attribute it
 * reverted is only known by looking.
 */
export function syncStoredElementStateFromPreview(doc: Document | null | undefined): void {
  if (!doc) return;
  usePlayerStore.setState((state) => {
    let changed = false;
    const elements = state.elements.map((element) => {
      const node = previewNodeFor(doc, element);
      if (!node) return element;
      const fields = syncedFields(doc, element, node);
      // Same array back when nothing moved: `elements` keys memos all over the
      // timeline, and a fresh object per sync would re-render every one.
      const keys = Object.keys(fields) as (keyof typeof fields)[];
      if (keys.every((key) => fields[key] === element[key])) return element;
      changed = true;
      return { ...element, ...fields };
    });
    return changed ? { elements } : {};
  });
}
