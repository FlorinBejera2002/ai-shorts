import { UPLOAD_STAGE_KEYS } from './story-processing-model'

type Text = (english: string, romanian: string) => string

/** Five upload stage labels, in the order the stage line shows them. */
export function uploadStageLabels(text: Text) {
  return [
    { key: UPLOAD_STAGE_KEYS[0], label: text('Upload', 'Încărcare') },
    { key: UPLOAD_STAGE_KEYS[1], label: text('Analysis', 'Analiză') },
    { key: UPLOAD_STAGE_KEYS[2], label: text('Moments', 'Momente') },
    { key: UPLOAD_STAGE_KEYS[3], label: text('Edit', 'Montaj') },
    { key: UPLOAD_STAGE_KEYS[4], label: text('Check', 'Verificare') }
  ]
}

/** Card title for each upload stage. */
export function uploadStageTitle(stage: number, text: Text) {
  const titles = [
    text('Uploading your footage', 'Încărcăm filmările'),
    text('Analyzing your footage', 'Analizăm filmările'),
    text('Choosing moments', 'Alegem momentele'),
    text('Editing your clip', 'Montăm clipul'),
    text('Checking your clip', 'Verificăm clipul')
  ]
  return titles[stage] ?? titles[0]
}

/** Illustration alt text for each upload stage. */
export function uploadStageIllustrationAlt(stage: number, text: Text) {
  const alts = [
    text('Ana puts footage into an upload cloud, Radu points at it', 'Ana pune filmări într-un nor de încărcare, Radu arată spre el'),
    text('Ana holds a sound wave, Radu inspects the film strip with a magnifier', 'Ana ține o undă sonoră, Radu cercetează banda de film cu lupa'),
    text('Ana picks a frame from the film strip, Radu holds a basket of chosen frames', 'Ana alege cu penseta un cadru de pe banda de film, Radu ține un coș cu cadre alese'),
    text('Ana and Radu glue frames one after another on the editing table', 'Ana și Radu lipesc cadrele unul după altul pe masa de montaj'),
    text('Ana ticks a list, Radu checks the clip on a phone', 'Ana bifează o listă, Radu verifică clipul pe telefon')
  ]
  return alts[stage] ?? alts[0]
}
