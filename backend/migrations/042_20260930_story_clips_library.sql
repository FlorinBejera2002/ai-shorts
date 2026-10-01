-- revision: 20260930_story_clips_library
-- parent: 20260923_agent_platform
INSERT INTO clips(
    id, job_id, user_id, title, viral_score, start_time, end_time, duration,
    segments, file_path, file_storage_key, thumbnail_path,
    thumbnail_storage_key, file_size, resolution, aspect_ratio,
    has_subtitles, transcript_text, story_project_id, story_version, created_at
)
SELECT
    gen_random_uuid(), p.id, p.user_id,
    left(coalesce(nullif(btrim(v.version->'plan'->>'title'), ''), 'Story clip'), 255),
    0, 0, (v.version->'output'->>'duration')::double precision,
    (v.version->'output'->>'duration')::double precision, '[]'::jsonb,
    v.version->'output'->>'key', v.version->'output'->>'key',
    nullif(v.version->'output'->>'thumbnail_key', ''),
    nullif(v.version->'output'->>'thumbnail_key', ''),
    (v.version->'output'->>'size')::bigint, v.version->'output'->>'resolution',
    coalesce(nullif(p.options->>'aspect_ratio', ''), '9:16'),
    coalesce((v.version->'output'->>'captions')::boolean, false), '', p.id,
    p.current_version, p.updated_at
FROM story_projects p
JOIN story_versions v ON v.project_id=p.id AND v.number=p.current_version
WHERE p.current_version>0
  AND coalesce((v.version->>'accepted')::boolean, false)
  AND coalesce((v.version->'report'->>'version')::integer, 0)=v.number
  AND coalesce((v.version->'report'->'coverage'->>'plan')::boolean, false)
  AND coalesce((v.version->'report'->'coverage'->>'file')::boolean, false)
  AND coalesce(v.version->'output'->>'key', '')<>''
  AND coalesce((v.version->'output'->>'duration')::double precision, 0)>0
  AND coalesce((v.version->'output'->>'size')::bigint, 0)>0
  AND coalesce(v.version->'output'->>'resolution', '')<>''
  AND jsonb_array_length(coalesce(v.version->'timeline', '[]'::jsonb))>0
  AND NOT EXISTS(SELECT 1 FROM clips c WHERE c.story_project_id=p.id);
