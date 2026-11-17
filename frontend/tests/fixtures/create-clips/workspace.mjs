// Synthetic records only. Never import production API clients or user media.
export const creationId = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
export const photoURL = '/__creation-fixtures/studio-source.png'
export const videoURL = '/__creation-fixtures/studio-source.mp4'
export const audioURL = '/__creation-fixtures/original.wav'
export const defaultOptions = {
  brief: 'A calm tour of the studio.', target_seconds: 45, aspect_ratio: '9:16',
  dynamic_range: 'sdr', language: 'auto', mode: 'smart', preserve_order: true,
  captions: false, caption_mode: 'off', audio_cleanup: { enabled: false }
}
export const limits = {
  max_files: 0, max_file_bytes: 2 * 1024 ** 3, max_total_bytes: 10 * 1024 ** 3,
  max_source_seconds: 900, max_total_seconds: 3600
}
export const previewUser = {
  id: creationId(7800), name: 'Alex Morgan', email: 'creation-preview@example.invalid',
  credits: 360, plan: 'pro', access_role: 'member'
}
export const musicTrack = {
  id: 'synthetic-studio-ambient', title: 'Studio ambient', artist: 'Synthetic fixture',
  duration_seconds: 120, bpm: 90, genres: ['ambient'], moods: ['calm'],
  preview_url: audioURL, source_url: '/__creation-preview', license: 'Synthetic test fixture',
  license_url: '/__creation-preview', attribution: 'Synthetic studio ambient — local verification fixture'
}
export const storyStates = ['draft', 'ready', 'needs-review', 'error', 'processing', 'empty']
export const storyId = (state) => creationId(7801 + storyStates.indexOf(state))
export const jobStates = ['processing', 'completed', 'failed', 'audio-recovery', 'load-error']
export const jobId = (state) => creationId(7901 + jobStates.indexOf(state))

export function sourceAssets() {
  return ['studio-tour.mp4', 'desk-detail.mov', 'window-light.mp4'].map((name, index) => ({
    id: creationId(7820 + index), name, size: 3_400_000 + index * 550_000,
    duration: [24, 18, 21][index], role: 'auto', include: 'auto', order: index,
    kind: 'video', source_url: videoURL, proxy_url: videoURL, thumbnail_url: photoURL,
    candidates: [{
      id: creationId(7830 + index), source_id: creationId(7820 + index), in: 0, out: 4,
      text: 'A little space to create.', reason: 'Synthetic studio moment', role: 'main',
      confidence: 0.96, words: [
        { text: 'A', start: 0, end: 0.2 }, { text: 'little', start: 0.2, end: 0.6 },
        { text: 'space', start: 0.6, end: 1.1 }, { text: 'to', start: 1.1, end: 1.3 },
        { text: 'create.', start: 1.3, end: 1.9 }
      ]
    }],
    transcript_proposals: [{
      id: creationId(7840 + index), candidate_id: creationId(7830 + index), in: 0, out: 4,
      confidence: 0.96, reason: 'Synthetic transcript', timing_verified: true, reviewed: false,
      words: [{ text: 'A little space to create.', start: 0, end: 1.9 }]
    }]
  }))
}

export function resultVersion(needsReview = false) {
  return {
    number: 1, parent: 0, accepted: false, clip_id: creationId(7850),
    preview_url: videoURL, export_url: videoURL, thumbnail_url: photoURL,
    render_options: structuredClone(defaultOptions), output: { duration: 45, captions: false },
    plan: { title: 'Studio day', summary: 'A calm tour of the studio.', blocks: [] },
    timeline: [{ block_id: creationId(7851), output_in: 0, output_out: 45,
      video: { source_id: creationId(7820), in: 0, out: 24 } }],
    report: {
      status: needsReview ? 'needs_review' : 'ready',
      coverage: { plan: true, file: true, audio: !needsReview, visual: true,
        captions: true, semantics: true, boundaries: true },
      issues: needsReview ? [{ id: creationId(7852), type: 'audio_timing', severity: 'warning',
        start: 4, end: 7, evidence: 'Check the audio timing in this draft.', resolved: false }] : []
    }
  }
}

export function storyProject(state = 'draft') {
  const hasResult = state === 'ready' || state === 'needs-review'
  return {
    id: storyId(state), title: state === 'draft' ? 'Studio day' : `Studio day — ${state}`,
    options: structuredClone(defaultOptions),
    status: hasResult ? 'ready' : state === 'error' ? 'failed' : state === 'processing' ? 'analyzing' : 'draft',
    stage: state === 'processing' ? 'analyzing' : undefined,
    message: state === 'processing' ? 'Reviewing source footage' : undefined,
    error: state === 'error' ? 'Could not build your story. Your files and settings are saved.' : undefined,
    assets: state === 'empty' ? [] : sourceAssets(),
    versions: hasResult ? [resultVersion(state === 'needs-review')] : [],
    current_version: hasResult ? 1 : 0, limits: structuredClone(limits)
  }
}

export function youtubeJob(state = 'processing', id = jobId(state)) {
  const failed = state === 'failed' || state === 'audio-recovery'
  return {
    id, user_id: previewUser.id, status: failed ? 'failed' : state === 'completed' ? 'completed' : 'transcribing',
    source_type: 'youtube', source_url: 'https://youtu.be/ScDemoA0001',
    title: 'Morning studio tour', video_title: 'Morning studio tour', thumbnail_url: photoURL,
    progress: state === 'completed' ? 100 : 42,
    message: failed ? 'Processing stopped' : state === 'completed' ? 'All clips ready' : 'Building transcript…',
    error_message: failed ? 'Synthetic processing failure' : null,
    num_clips_requested: 5, aspect_ratio: '9:16', clips: [],
    ...(state === 'audio-recovery' ? { audio_cleanup: { status: 'failed' }, original_audio_url: audioURL } : {})
  }
}

export function silentWav(seconds = 2, rate = 8000) {
  const bytes = Math.ceil(seconds * rate) * 2
  const buffer = Buffer.alloc(44 + bytes)
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + bytes, 4); buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36); buffer.writeUInt32LE(bytes, 40)
  return buffer
}
