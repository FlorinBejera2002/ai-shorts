import { describe, expect, test } from "bun:test";
import {
  linkedStoryComposition,
  musicCreditMarkup,
  parseStoryImport,
  storySourceComposition,
  storyBrowserProxy,
} from "./story-import";
import { mediaDownloadURL } from "./import-media";

test("camera-codec and HDR sources use browser proxies while H264/AAC retains original quality", () => {
  const source = {
    name: "camera.mov",
    source_url: "https://app.test/media/source.mov",
    proxy_url: "https://app.test/media/proxy.mp4",
    has_audio: true,
  };
  expect(storyBrowserProxy({ ...source, video_codec: "prores", audio_codec: "pcm_s16le" })).toBe(
    source.proxy_url,
  );
  expect(storyBrowserProxy({ ...source, video_codec: "hevc", audio_codec: "aac" })).toBe(
    source.proxy_url,
  );
  expect(storyBrowserProxy({ ...source, video_codec: "h264", audio_codec: "pcm_s16le" })).toBe(
    source.proxy_url,
  );
  expect(storyBrowserProxy(source)).toBe(source.proxy_url);
  expect(storyBrowserProxy({ ...source, video_codec: "h264", audio_codec: "aac" })).toBeUndefined();
  expect(
    storyBrowserProxy({
      ...source,
      video_codec: "h264",
      audio_codec: "aac",
      color_transfer: "smpte2084",
    }),
  ).toBe(source.proxy_url);
  expect(storyBrowserProxy({ ...source, video_codec: "h264", has_audio: false })).toBeUndefined();
});

const fixture = () => ({
  id: "story",
  options: { aspect_ratio: "9:16", captions: false },
  assets: [
    {
      id: "a",
      name: "First <source>",
      source_url: "https://app.test/media/a.mp4",
      duration: 20,
      has_audio: true,
    },
    {
      id: "b",
      name: "Second",
      source_url: "https://app.test/media/b.mp4",
      duration: 30,
      has_audio: true,
    },
  ],
  versions: [
    {
      number: 1,
      accepted: true,
      timeline: [
        {
          block_id: "one",
          output_in: 0,
          output_out: 4,
          video: { source_id: "a", in: 3, out: 7 },
          audio: { source_id: "a", in: 3, out: 7 },
          crop: "fit",
        },
        {
          block_id: "two",
          output_in: 4,
          output_out: 9,
          video: { source_id: "b", in: 10, out: 15 },
          audio: { source_id: "a", in: 7, out: 12 },
          crop: "track",
        },
      ],
    },
  ],
});

describe("source-backed Story import", () => {
  test("retains an editable visible music licence credit in the final five seconds", () => {
    const html = musicCreditMarkup(
      "Music <Title> by Artist. CC BY 4.0 https://creativecommons.org/licenses/by/4.0/",
      12,
      { width: 1080, height: 1350 },
    );
    expect(html).toContain('data-start="7" data-duration="5"');
    expect(html).toContain("Music &lt;Title&gt; by Artist. CC BY 4.0");
    expect(html).toContain('id="music-attribution" class="clip"');
    expect(html).not.toContain("<Title>");
  });
  test("preserves 4:5 canvas dimensions in the parent and source scenes", () => {
    const story = parseStoryImport(
      { ...fixture(), options: { aspect_ratio: "4:5", captions: false } },
      "story",
      1,
    );
    const linked = linkedStoryComposition(
      story,
      "Title",
      new Map([
        ["a", "assets/a.mp4"],
        ["b", "assets/b.mp4"],
      ]),
      new Map(),
    );
    expect(linked.html).toContain('data-width="1080" data-height="1350"');
    for (const html of linked.scenes.values())
      expect(html).toContain('data-width="1080" data-height="1350"');
  });
  test("links source speech and captions to the same composition trim clock", () => {
    const input = fixture();
    const version = input.versions[0];
    const story = parseStoryImport(
      {
        ...input,
        options: { ...input.options, captions: true },
        versions: [
          {
            ...version,
            output: { captions: true },
            timeline: version.timeline.map((entry, index) => ({
              ...entry,
              words: index === 0 ? [{ text: "Camera speech", start: 0.2, end: 1.2 }] : [],
            })),
          },
        ],
      },
      "story",
      1,
    );
    const linked = linkedStoryComposition(
      story,
      "Title",
      new Map([
        ["a", "assets/a.mp4"],
        ["b", "assets/b.mp4"],
      ]),
      new Map([["a", "assets/clean.wav"]]),
    );
    expect(linked.html).toContain('data-playback-start="3" data-source-duration="20"');
    expect(linked.html).toContain('data-composition-src="source-scene-1.html"');
    expect(linked.html).not.toContain("Camera speech");
    const scene = linked.scenes.get("source-scene-1.html")!;
    expect(scene).toContain('data-start="3.2"');
    expect(scene).toContain("Camera speech");
    expect(scene).toContain('src="assets/clean.wav"');
    expect(scene).toContain('data-media-start="0" data-source-duration="20"');
    expect(linked.html).toContain('id="narration-2"');
    expect(linked.scenes.get("source-scene-2.html")).not.toContain('src="assets/clean.wav"');
  });
  test("keeps distinct full sources and their true trim offsets, including independent audio", () => {
    const story = parseStoryImport(fixture(), "story", 1);
    const html = storySourceComposition(
      "Title",
      story,
      new Map([
        ["a", "assets/a.mp4"],
        ["b", "assets/b.mp4"],
      ]),
      new Map(),
      { html: "", css: "" },
    );
    expect(html.match(/<video /g)).toHaveLength(2);
    expect(html).toContain(
      'data-media-start="3" data-source-duration="20" data-has-audio="true" src="assets/a.mp4"',
    );
    expect(html).toContain(
      'data-media-start="10" data-source-duration="30" data-has-audio="false" src="assets/b.mp4"',
    );
    expect(html).toContain('data-label="First &lt;source&gt;"');
    expect(html).toContain('<audio id="audio-2"');
    expect(html).toContain('data-media-start="7" data-source-duration="20"');
    expect(html).toContain('data-width="1080" data-height="1920"');
  });
  test("uses processed speech while muting the source camera audio", () => {
    const html = storySourceComposition(
      "Title",
      parseStoryImport(fixture(), "story", 1),
      new Map([
        ["a", "assets/a.mp4"],
        ["b", "assets/b.mp4"],
      ]),
      new Map([["a", "assets/clean.wav"]]),
      { html: "", css: "" },
    );
    expect(html).toContain('<audio id="audio-1"');
    expect(html.match(/src="assets\/clean.wav"/g)).toHaveLength(2);
    expect(html).toContain("playsinline muted");
  });
  test("rejects stale versions, wrong project, missing sources and out-of-bounds intervals", () => {
    expect(() => parseStoryImport(fixture(), "other", 1)).toThrow();
    expect(() => parseStoryImport(fixture(), "story", 2)).toThrow();
    const missing = fixture();
    missing.assets.pop();
    expect(() => parseStoryImport(missing, "story", 1)).toThrow();
    const invalid = fixture();
    invalid.versions[0].timeline[0].video.out = 200;
    expect(() => parseStoryImport(invalid, "story", 1)).toThrow();
  });
  test("only downloads signed public media through the configured internal transport", () => {
    expect(
      String(
        mediaDownloadURL(
          "https://app.test/media/a.mp4?sig=secret",
          "https://app.test",
          "http://nginx",
        ),
      ),
    ).toBe("http://nginx/media/a.mp4?sig=secret");
    for (const url of [
      "http://169.254.169.254/media/token",
      "https://app.test/private",
      "https://user:pass@app.test/media/file.mp4",
    ])
      expect(() => mediaDownloadURL(url, "https://app.test")).toThrow();
  });
});
