export const CAPTION_ANIMATIONS = [
  "none",
  "phrase-pop",
  "subtle-fade",
  "word-pop",
  "word-fade",
] as const;
export type CaptionAnimation = (typeof CAPTION_ANIMATIONS)[number];
export interface CaptionAnimationCue {
  id: string;
  start: number;
  end: number;
  words: { id: string; start: number; end: number }[];
}

export function captionAnimation(value: unknown, preset = "classic"): CaptionAnimation {
  if (typeof value === "string" && CAPTION_ANIMATIONS.some((item) => item === value))
    return CAPTION_ANIMATIONS.find((item) => item === value)!;
  return preset === "phrase-pop" || preset === "subtle-fade" ? preset : "none";
}

/** Authored GSAP calls use the same source clock in Studio and frame export. */
export function captionAnimationScript(
  cues: CaptionAnimationCue[],
  animation: CaptionAnimation,
  timeline = "main",
): string {
  const root = `window.__timelines[${JSON.stringify(timeline)}]`;
  const snippets: string[] = [];
  for (const cue of cues) {
    if (!(cue.end > cue.start)) continue;
    const selector = JSON.stringify(
      `#${cue.id} .story-caption-text, #${cue.id} [data-caption-text]`,
    );
    const duration = Math.min(0.14, (cue.end - cue.start) / 2);
    if (animation === "phrase-pop")
      snippets.push(
        `${root}.fromTo(${selector},{scale:.88},{scale:1,duration:${Math.min(0.12, duration)},ease:"none"},${cue.start});`,
      );
    if (animation === "subtle-fade")
      snippets.push(
        `${root}.fromTo(${selector},{opacity:0},{opacity:1,duration:${duration},ease:"none"},${cue.start}).to(${selector},{opacity:0,duration:${duration},ease:"none"},${cue.end - duration});`,
      );
    if (animation === "word-pop" || animation === "word-fade") {
      for (const word of cue.words) {
        const start = Math.max(cue.start, word.start);
        const end = Math.min(cue.end, word.end);
        if (!(end > start)) continue;
        const target = JSON.stringify(`#${word.id}`);
        const from = animation === "word-pop" ? "{opacity:0,scale:.8}" : "{opacity:0,yPercent:15}";
        const to = animation === "word-pop" ? "opacity:1,scale:1" : "opacity:1,yPercent:0";
        snippets.push(
          `${root}.fromTo(${target},${from},{${to},duration:${Math.min(0.14, end - start)},ease:"none"},${start});`,
        );
      }
    }
  }
  return snippets.join("");
}
