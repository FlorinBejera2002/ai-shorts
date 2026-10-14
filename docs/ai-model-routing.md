# AI models in production

Administrators select models in **Modele AI** in the admin application. The
configuration is global and stored in PostgreSQL. Every cloud AI call reads the
latest committed route before choosing a client. An active call keeps its model;
the next call uses the saved selection without restarting API, worker or Studio.

The independent responsibilities are source image analysis, speech verification,
highlight selection, Story/narration planning, plan review, transition decisions,
final video review, scripts, the assistant, Workspace AI and Studio composition
editing. Workspace actions that delegate to scripts or Story use those tasks'
own selections. Rendering and deterministic editing operations do not call a
language model.

Studio background removal is also registered centrally when the Studio service
credential is configured. This version supports the shipped `u2net_human_seg`
ONNX model only; the admin displays that limitation and does not advertise
unsupported alternatives. Every background job checks its central route before
entering the isolated renderer.

## Providers and defaults

OpenRouter gives the application access to multiple vendors through its existing
server credential. Direct Gemini is also supported. `AI_PROVIDER` chooses the
initial provider: `auto` prefers an installed Gemini credential, otherwise
OpenRouter. With OpenRouter, initial models are:

| Responsibility | Initial model |
| --- | --- |
| Source images and speech verification | Qwen 3.8 Omni Flash |
| Highlights, Story planning, Workspace AI | GPT-6.1 Sol |
| Plan review, scripts, Studio editing | Claude Sonnet 5.5 |
| Transitions and assistant | GPT-6 Luna |
| Final multimodal video review | Gemini 3.8 Flash |

These are starting assignments, not a benchmark claim. Production evaluation on
representative Romanian videos should inform later choices. Direct Gemini uses
Gemini 3.8 Flash, with Gemini 4 Argon for planning, plan review and Workspace AI.
The previous global `GEMINI_MODEL_NAME` and `OPENROUTER_MODEL_NAME` values no longer
override API/worker tasks. They remain available only for standalone Studio.

The admin catalog comes from OpenRouter's public model API (five-minute cache)
and the direct Gemini adapter's curated list. Selection is limited to configured
providers and the modalities required by each task. Native audio/video review
cannot use a text-only model. A missing catalog disables saving; it does not
interrupt inference with already selected models. There is no automatic
cross-provider fallback. Changes can affect model cost and quality.

## Installed processing models

The same page includes standard Whisper transcription, Story/narration Whisper,
Silero voice detection and Pigo face tracking when those engines are installed.
The API image and worker share the model inventory. The admin chooses opaque
IDs, never paths, URLs, commands or uploaded model files. Only nonempty regular
files in the configured model locations are offered; symlinks are excluded.
Additional models with recognized family filenames are discovered in the same
directories. Installing an entirely new engine requires the normal server setup.

Each processing operation snapshots native choices into its own processor copy.
Cache identities use the selected files' signatures, including Story ASR/VAD
and face tracking. A missing selected file fails instead of silently selecting
another model. The shipped inventory has two Whisper alternatives and one each
for Silero and Pigo; more choices require installing compatible models.

## Initial rollout

Apply migration `045_20261014_ai_stage_routing.sql` before the new API and worker.
The singleton starts at version 0 with no overrides. Build and deploy API, worker,
admin and Studio together. API readiness checks for the new table.

Production and local Studio Compose configurations set `SNEEPCUT_AI_ROUTING=central`.
Set the same random `STUDIO_AGENT_SECRET` (at least 32 characters) for API and
Studio; production Compose requires it. Configure `STUDIO_AGENT_URL` together
with that secret: production Compose defaults the API's URL to
`http://studio:5191` and preserves an explicit override. Outside Compose, a secret
without its paired Studio URL prevents API startup. Studio reads only its provider/model from
`GET /api/internal/ai-routing/studio`, authenticated with the service secret.
AI credentials stay in each server process. A failed routing request or missing
selected credential makes Studio unavailable instead of bypassing the admin.
Outside these Compose deployments, explicitly standalone Studio retains its
custom OpenAI-compatible endpoint configuration.

Only a recently authenticated administrator may save. Changes require an audit
reason and the loaded version. Configuration and audit commit in one transaction;
concurrent stale edits return 409 and must reload. API responses never contain
provider keys or installed model paths.

## Verification

Go regression coverage exercises routing, native selection, media cache changes,
catalog filtering, authorization and transactional persistence. The PostgreSQL
integration test requires `SNEEPCUT_TEST_DATABASE_URL` pointing to the dedicated
loopback `sneepcut_integration_test` database; it creates and removes a disposable
schema. `admin/tests/ai-routing.browser.mjs` runs against its own synthetic mock
API and supports `VERIFY_ADMIN_FAST_REFRESH=1` to check component state preservation. Studio's
`packages/sneepcut-server/src/ai.test.ts` covers live route changes and fail-closed
central mode. No test calls a paid inference provider.

Provider capability references: [OpenRouter video inputs](https://openrouter.ai/docs/guides/overview/multimodal/videos),
[Qwen Omni](https://www.alibabacloud.com/help/en/model-studio/qwen-omni),
[Claude models](https://platform.claude.com/docs/en/models/overview),
[GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol).
