# Creation settings and brand rendering (CF057)

The worker loads persisted job language/subtitle style and the owner's brand kit.
Creation flags for captions, smart crop and aspect ratio remain in the durable
delivery payload. Selected aspect ratio is applied before captions. Saved subtitle
font/color/background/opacity/position are passed to the caption renderer. Brand
logos use owner-scoped storage keys and selected watermark position/opacity.
Hiding the platform badge remains restricted by the server-side Agency plan.

When branding is enabled and an AI hook is present, the hook is rasterized using
the brand's general font and primary/secondary palette. Text is wrapped and bounded
inside the frame; palette/font values cannot inject FFmpeg filters. Installed
fonts are resolved through fontconfig, with a deterministic Pillow fallback.
Without an applicable text element, the palette does not arbitrarily recolor video.

Historical intro/outro/watermark-path database columns are not exposed as editable
settings by the current brand API and are not claimed as supported media insertion
controls. The supported editable settings above are covered by pipeline option,
actual FFmpeg framing/logo/brand-text, subtitle and input-validation tests.
