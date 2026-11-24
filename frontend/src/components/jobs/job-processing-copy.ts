type Text = (english: string, romanian: string) => string

/** Stage line labels shared by every job card state. */
export function jobStageLabels(text: Text): Array<{ key: string; label: string }> {
  return [
    { key: 'download', label: text('Download', 'Descărcare') },
    { key: 'transcribe', label: text('Transcription', 'Transcriere') },
    { key: 'analyze', label: text('Analysis', 'Analiză') },
    { key: 'edit', label: text('Editing', 'Montaj') },
    { key: 'done', label: text('Done', 'Gata') }
  ]
}

/** Stage titles for the running card, indexed by the job's stage. */
export function jobStageTitle(stage: number, text: Text) {
  const titles = [
    text('Downloading the video', 'Descărcăm videoclipul'),
    text('Transcribing speech', 'Transcriem vorbirea'),
    text('Analyzing the video', 'Analizăm videoclipul'),
    text('Editing the clips', 'Montăm clipurile'),
    text('All clips are ready!', 'Toate clipurile sunt gata!')
  ]
  return titles[stage] ?? titles[0]
}

/** Illustration alt text for the running card, indexed by the job's stage. */
export function jobStageIllustrationAlt(stage: number, text: Text) {
  const alts = [
    text('Video cards move from a laptop into a box', 'Cartonașe video trec dintr-un laptop într-o cutie'),
    text(
      'Radu listens with headphones while Ana holds the transcript',
      'Radu ascultă cu căștile, Ana ține foaia de transcriere'
    ),
    text(
      'Ana holds a sound wave, Radu inspects the film strip with a magnifier',
      'Ana ține o undă sonoră, Radu cercetează banda de film cu lupa'
    ),
    text(
      'Ana and Radu glue frames one after another on the editing table',
      'Ana și Radu lipesc cadrele unul după altul pe masa de montaj'
    ),
    text('Ana and Radu high-five', 'Ana și Radu bat palma')
  ]
  return alts[stage] ?? alts[0]
}
