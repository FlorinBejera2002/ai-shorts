// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { syncStoredElementStateFromPreview } from "./elementStateStoreSync";
import { usePlayerStore, type TimelineElement } from "../store/playerStore";

const TWO_POINTS = '{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":1}]}]}';
const RESTORED =
  '{"version":1,"lanes":[{"target":"volume","points":[{"t":0,"v":1},{"t":4,"v":0}]}]}';

const el = (over: Partial<TimelineElement> = {}): TimelineElement => ({
  id: "bgm",
  key: "bgm",
  tag: "audio",
  start: 0,
  duration: 10,
  track: 1,
  domId: "bgm",
  ...over,
});

/** A stand-in preview document carrying the attributes an undo would have written. */
function previewWith(attrs: Record<string, string>): Document {
  const doc = document.implementation.createHTMLDocument("preview");
  const audio = doc.createElement("audio");
  audio.id = "bgm";
  for (const [name, value] of Object.entries(attrs)) audio.setAttribute(name, value);
  doc.body.append(audio);
  return doc;
}

beforeEach(() => {
  usePlayerStore.getState().reset();
});

describe("syncStoredElementStateFromPreview", () => {
  it("reads back an envelope an undo restored on the preview", () => {
    // The bug: a soft undo patches the preview document and re-runs the timeline, but
    // the store keeps its own copy of the attributes and that copy is what a lane
    // draws — so an undone delete stayed invisible until the page was reloaded.
    usePlayerStore.setState({ elements: [el({ automation: TWO_POINTS })] });
    syncStoredElementStateFromPreview(previewWith({ "data-automation": RESTORED }));
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(RESTORED);
  });

  it("reads back an undone FX chain too, since a lane's targets come from it", () => {
    const chain = '{"version":1,"nodes":[{"type":"lowpass","id":"n1","params":{}}]}';
    usePlayerStore.setState({ elements: [el()] });
    syncStoredElementStateFromPreview(previewWith({ "data-fx-chain": chain }));
    expect(usePlayerStore.getState().elements[0]?.fxChain).toBe(chain);
  });

  it("clears an attribute the undo removed", () => {
    usePlayerStore.setState({ elements: [el({ automation: TWO_POINTS })] });
    syncStoredElementStateFromPreview(previewWith({}));
    expect(usePlayerStore.getState().elements[0]?.automation).toBeUndefined();
  });

  it("re-reads the eye: an undo that restores data-hidden hides the element again", () => {
    // The reported bug: hide a track, undo, and the timeline still showed it hidden
    // because the store's `hidden` was only ever written by the optimistic toggle.
    usePlayerStore.setState({ elements: [el({ hidden: true })] });
    syncStoredElementStateFromPreview(previewWith({}));
    expect(usePlayerStore.getState().elements[0]?.hidden).toBeUndefined();

    usePlayerStore.setState({ elements: [el()] });
    syncStoredElementStateFromPreview(previewWith({ "data-hidden": "" }));
    expect(usePlayerStore.getState().elements[0]?.hidden).toBe(true);
  });

  it("re-reads a group's mute from the group node its members belong to", () => {
    const doc = document.implementation.createHTMLDocument("preview");
    const group = doc.createElement("hf-audio-group");
    group.id = "voiceover";
    group.setAttribute("data-hidden", "");
    const audio = doc.createElement("audio");
    audio.id = "bgm";
    audio.setAttribute("data-audio-group", "voiceover");
    doc.body.append(group, audio);

    usePlayerStore.setState({
      elements: [el({ audioGroup: "voiceover", audioGroupHidden: false })],
    });
    syncStoredElementStateFromPreview(doc);
    expect(usePlayerStore.getState().elements[0]?.audioGroupHidden).toBe(true);
  });

  it("finds the node by data-hf-id when the dom id does not match", () => {
    // Studio stamps hf-ids; an element discovered under a suffixed dom id still has
    // to resolve, or the sync silently skips it.
    const doc = document.implementation.createHTMLDocument("preview");
    const audio = doc.createElement("audio");
    audio.setAttribute("data-hf-id", "hf-snao");
    audio.setAttribute("data-automation", RESTORED);
    doc.body.append(audio);
    usePlayerStore.setState({ elements: [el({ domId: "bgm-2", hfId: "hf-snao" })] });
    syncStoredElementStateFromPreview(doc);
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(RESTORED);
  });

  it("keeps the same array when nothing changed, so nothing re-renders", () => {
    usePlayerStore.setState({ elements: [el({ automation: RESTORED })] });
    const before = usePlayerStore.getState().elements;
    syncStoredElementStateFromPreview(previewWith({ "data-automation": RESTORED }));
    expect(usePlayerStore.getState().elements).toBe(before);
  });

  it("does nothing without a preview document", () => {
    usePlayerStore.setState({ elements: [el({ automation: TWO_POINTS })] });
    syncStoredElementStateFromPreview(null);
    expect(usePlayerStore.getState().elements[0]?.automation).toBe(TWO_POINTS);
  });

  // The reported symptom: automate a parameter on a GROUP from the FX rack and
  // the group's row shows no automation. The rack is not group-aware — it
  // writes the attribute on the group node through the ordinary element path —
  // and the timeline reads a group's lanes from the mirrors its MEMBERS carry,
  // which that path used to leave untouched.
  it("re-reads what the group carries onto every member that belongs to it", () => {
    const chain = '{"version":1,"nodes":[{"type":"gain","id":"n1","params":{"gain":0}}]}';
    const groupAutomation =
      '{"version":1,"lanes":[{"target":"fx.n1.gain","points":[{"t":0,"v":0}]}]}';
    const doc = document.implementation.createHTMLDocument("preview");
    const group = doc.createElement("hf-audio-group");
    group.id = "voiceover";
    group.setAttribute("data-fx-chain", chain);
    group.setAttribute("data-automation", groupAutomation);
    const audio = doc.createElement("audio");
    audio.id = "bgm";
    audio.setAttribute("data-audio-group", "voiceover");
    doc.body.append(group, audio);

    usePlayerStore.setState({ elements: [el({ audioGroup: "voiceover" })] });
    syncStoredElementStateFromPreview(doc);

    const stored = usePlayerStore.getState().elements[0];
    expect(stored?.audioGroupAutomation).toBe(groupAutomation);
    expect(stored?.audioGroupFxChain).toBe(chain);
  });
});
