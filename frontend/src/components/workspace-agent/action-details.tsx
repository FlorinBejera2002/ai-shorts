import type { AgentAction } from './model'

const names: Record<string, [string, string]> = {
  'publishing.disconnect': ['Disconnect publishing account', 'Deconectează contul de publicare'], 'calendar.delete': ['Delete calendar draft', 'Șterge ciorna din calendar'],
  'calendar.attach_media': ['Attach publishing media', 'Atașează media pentru publicare'], 'scripts.export': ['Export script JSON', 'Exportă scenariul JSON'],
  'jobs.create': ['Generate clips from a source', 'Generează clipuri dintr-o sursă'],
  'clips.delete': ['Delete the clip permanently', 'Șterge definitiv clipul'],
  'stories.delete': ['Delete the story permanently', 'Șterge definitiv povestea'],
  'projects.brand.read': ['Read project brand', 'Verifică brandul proiectului'],
  'projects.brand.update': ['Update project brand', 'Modifică brandul proiectului'],
  'projects.brand.restore': ['Restore project brand', 'Restaurează brandul proiectului'],
  'library.get': ['Inspect project folders', 'Verifică folderele proiectului'],
  'folders.create': ['Create a folder', 'Creează un folder'], 'folders.update': ['Update the folder', 'Modifică folderul'],
  'folders.delete': ['Remove the folder', 'Șterge folderul'], 'clips.move': ['Move the clip into a folder', 'Mută clipul într-un folder'],
  'stories.update': ['Update story settings', 'Modifică setările poveștii'],
  'publishing.create': ['Create a publishing draft', 'Creează o ciornă de publicare'],
  'publishing.update': ['Update the publishing draft', 'Modifică ciorna de publicare'],
  'publishing.publish': ['Publish the post', 'Publică postarea'],
  'publishing.schedule': ['Schedule the post', 'Programează postarea'],
  'publishing.reschedule': ['Reschedule the post', 'Reprogramează postarea'],
  'publishing.unschedule': ['Cancel the scheduled post', 'Anulează programarea postării'],
  'projects.list': ['List projects', 'Listează proiectele'], 'projects.rename': ['Rename the project', 'Redenumește proiectul'],
  'brand.read': ['Read brand settings', 'Verifică setările brandului'], 'stories.list': ['List stories', 'Listează poveștile'],
  'scripts.list': ['List scripts', 'Listează scenariile'], 'scripts.get': ['Read the script', 'Citește scenariul'],
  'scripts.update': ['Update the script', 'Modifică scenariul'], 'scripts.restore': ['Restore the script', 'Restaurează scenariul'],
  'analytics.read': ['Read workspace totals', 'Verifică totalurile spațiului de lucru'], 'workspace.open': ['Open a workspace page', 'Deschide o pagină'],
  'clips.trim': ['Trim the clip', 'Scurtează clipul'], 'clips.recut': ['Reassemble clip segments', 'Reasamblează segmentele clipului'],
  'stories.create': ['Create a story', 'Creează o poveste'], 'stories.get': ['Read story progress', 'Verifică progresul poveștii'],
  'stories.generate': ['Generate the story', 'Generează povestea'], 'stories.revise': ['Revise the story', 'Revizuiește povestea'],
  'clips.update': ['Update the clip', 'Modifică clipul'], 'clips.get': ['Read clip details', 'Verifică detaliile clipului'],
  'scripts.create': ['Create a script', 'Creează un scenariu'], 'scripts.generate': ['Generate a script', 'Generează un scenariu'],
  'posts.create': ['Create a post', 'Creează o postare'], 'posts.schedule': ['Schedule a post', 'Programează o postare'],
  'workspace.get': ['Read workspace details', 'Verifică spațiul de lucru']
}
const fields: Record<string, [string, string]> = {
  source_type: ['Source type', 'Tip sursă'], source_url: ['Source URL', 'Adresa sursei'], num_clips: ['Number of clips', 'Număr de clipuri'], num_clips_requested: ['Number of clips', 'Număr de clipuri'],
  settings: ['Settings', 'Setări'], primaryColor: ['Primary color', 'Culoare principală'], secondaryColor: ['Secondary color', 'Culoare secundară'],
  fontFamily: ['Font', 'Font'], subtitleFont: ['Caption font', 'Font subtitrări'], subtitleColor: ['Caption color', 'Culoare subtitrări'],
  logo_resource_id: ['Attached logo', 'Logo atașat'],
  start: ['Start (seconds)', 'Început (secunde)'], end: ['End (seconds)', 'Sfârșit (secunde)'],
  start_time: ['Start (seconds)', 'Început (secunde)'], end_time: ['End (seconds)', 'Sfârșit (secunde)'],
  order: ['Order', 'Ordine'], segments: ['Segments', 'Segmente'], page: ['Page', 'Pagină'], edit: ['Requested edit', 'Editare cerută'],
  title: ['Title', 'Titlu'], name: ['Name', 'Nume'], brief: ['Brief', 'Descriere'], text: ['Text', 'Text'],
  instructions: ['Requested changes', 'Modificări cerute'], prompt: ['Instructions', 'Instrucțiuni'],
  target_seconds: ['Duration (seconds)', 'Durată (secunde)'], project_id: ['Project', 'Proiect'], story_id: ['Story', 'Poveste'],
  clip_id: ['Clip', 'Clip'], language: ['Language', 'Limbă'], aspect_ratio: ['Format', 'Format'],
  captions: ['Captions', 'Subtitrări'], mode: ['Mode', 'Mod'], preserve_order: ['Keep source order', 'Păstrează ordinea'],
  scheduled_at: ['Scheduled time', 'Ora programată'], platform: ['Platform', 'Platformă'], options: ['Settings', 'Setări'],
  id: ['Target', 'Țintă'], revision: ['Revision', 'Revizie'], version: ['Version', 'Versiune'], document: ['Document', 'Document']
}
function actionLabel(action: AgentAction, ro: boolean) {
  return names[action.name]?.[ro ? 1 : 0] ?? (ro ? 'Acțiune în spațiul de lucru' : 'Workspace action')
}
function display(value: unknown, ro: boolean): string {
  if (typeof value === 'boolean') return value ? (ro ? 'Da' : 'Yes') : (ro ? 'Nu' : 'No')
  if (Array.isArray(value)) return value.map(item => display(item, ro)).join(', ')
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${fields[key]?.[ro ? 1 : 0] ?? key.replaceAll('_', ' ')}: ${display(item, ro)}`).join('\n')
  return String(value ?? '—')
}
export function ActionTitle({ action, ro }: { action: AgentAction; ro: boolean }) { return <>{actionLabel(action, ro)}</> }
export function ActionDetails({ action, ro }: { action: AgentAction; ro: boolean }) {
  return <dl className="mt-2 space-y-2 text-xs">{Object.entries(action.input).filter(([key]) => !['expected_state', 'digest', 'receipt_id'].includes(key)).map(([key, value]) => <div key={key}>
    <dt className="font-medium">{fields[key]?.[ro ? 1 : 0] ?? key.replaceAll('_', ' ')}</dt>
    <dd className="whitespace-pre-wrap break-words text-muted-foreground">{display(value, ro)}</dd>
  </div>)}</dl>
}

