// Synthetic Scripts data shared by browser regression checks. None of these
// records belongs to an application database or real workspace.
export const scriptId = (index) =>
  `00000000-0000-4000-8000-${String(4200 + index).padStart(12, '0')}`

export function emptySnapshot(title = 'Untitled script') {
  return {
    title,
    hook: '',
    scenes: [],
    call_to_action: '',
    caption: '',
    hashtags: [],
    total_duration_seconds: 30,
    equipment_suggestions: [],
    filming_tips: []
  }
}

export function generatedSnapshot() {
  const visuals = [
    'Open curtains and let in daylight',
    'Make coffee',
    'Plan the day'
  ]
  return {
    ...emptySnapshot('A better morning routine'),
    hook: 'Your morning does not need to start in a rush.',
    scenes: visuals.map((visual, index) => ({
      scene_number: index + 1,
      duration_seconds: 10,
      visual_description: visual,
      camera_angle: index === 1 ? 'close up' : 'medium shot',
      camera_movement: 'Static',
      camera_movement_type: 'static',
      camera_movement_direction: 'none',
      dialogue: [
        'Start with one small action.',
        'Leave your phone aside.',
        'Pick one thing that matters.'
      ][index],
      text_overlay: ['Start small', 'No scroll', 'One clear priority'][index],
      music_mood: 'calm',
      transition: index === 2 ? 'Fade' : 'Cut',
      shot_type: index === 1 ? 'close_up' : 'medium',
      camera_height: 1.55,
      camera_distance: index === 1 ? 1.2 : 1.8,
      lens_mm: 35,
      lighting: 'Soft key left',
      voice_emotion: 'confident',
      voice_pace: 1,
      subject_action: visual
    })),
    call_to_action: 'Try it tomorrow',
    caption: 'A slower start, a clearer day',
    hashtags: ['morningroutine', 'creators']
  }
}

export function libraryRecords() {
  const names = [
    'A better morning routine',
    'Inside the creative studio',
    'Three editing shortcuts',
    'Build your first content series',
    'A week behind the scenes',
    'Make your next hook count',
    'A slower weekend'
  ]
  const topics = [
    'A calm morning routine for busy creators',
    'Show the process behind the work.',
    'Small cuts that make a big difference.',
    'Turn one idea into a weekly habit.',
    'A simple look at our studio rhythm.',
    'Open with a reason to keep watching.',
    'Take a quiet break from the usual pace.'
  ]
  return names.map((title, index) => ({
    id: scriptId(index),
    title,
    status: ['draft', 'ready', 'review', 'idea', 'in_production', 'published', 'archived'][index],
    topic: topics[index],
    platform: ['tiktok', 'instagram', 'youtube', 'facebook', 'instagram', 'tiktok', 'youtube'][index],
    language: 'en',
    targetDurationSeconds: 30,
    tone: 'Conversational',
    style: 'Talking head',
    audience: 'Busy creators',
    revision: [3, 5, 2, 1, 4, 6, 2][index],
    archived: index === 6,
    snapshot: { ...generatedSnapshot(), title },
    createdAt: '2026-10-20T06:30:00Z',
    updatedAt: `2026-10-${23 - Math.min(index, 3)}T07:00:00Z`
  }))
}
