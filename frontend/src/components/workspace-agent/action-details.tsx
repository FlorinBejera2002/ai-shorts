import type { AgentAction } from './model'

const names: Record<string, [string, string]> = {
  'publishing.options': ['Check current publishing options', 'Verifică opțiunile curente de publicare'],
  'studio.layer.remove': ['Remove the selected layer', 'Elimină elementul selectat'], 'studio.layer.split': ['Split the selected layer', 'Împarte elementul selectat'],
  'studio.assets.list': ['Find Studio assets', 'Caută resurse Studio'], 'studio.assets.get': ['Inspect the Studio asset', 'Verifică resursa Studio'], 'studio.assets.duplicate': ['Duplicate the Studio asset', 'Duplică resursa Studio'], 'studio.assets.delete': ['Delete the Studio asset', 'Șterge resursa Studio'], 'studio.assets.rename': ['Rename the Studio asset', 'Redenumește resursa Studio'],
  'studio.renders.list': ['Find Studio renders', 'Caută exporturi Studio'], 'studio.export': ['Prepare Studio export', 'Pregătește exportul Studio'], 'studio.renders.delete': ['Delete the Studio render', 'Șterge exportul Studio'],
  'sources.list': ['Find media sources', 'Caută surse media'], 'resources.list': ['Find saved resources', 'Caută resurse salvate'], 'resources.get': ['Read the resource', 'Citește resursa'],
  'jobs.list': ['Inspect processing jobs', 'Verifică procesările'], 'jobs.get': ['Check processing results', 'Verifică rezultatele procesării'], 'jobs.cancel': ['Stop processing', 'Oprește procesarea'],
  'stories.cancel': ['Stop clip generation', 'Oprește generarea clipului'], 'stories.restyle': ['Update clip appearance', 'Modifică aspectul clipului'],
  'stories.rollback': ['Restore a clip version', 'Restaurează o versiune a clipului'], 'stories.remove_asset': ['Remove a project source', 'Elimină o filmare din proiect'],
  'studio.list': ['Find Studio projects', 'Caută proiecte Studio'], 'studio.get': ['Inspect the composition', 'Verifică compoziția'], 'studio.create': ['Create a composition', 'Creează o compoziție'],
  'studio.edit': ['Edit the selected layer', 'Editează elementul selectat'], 'studio.revise': ['Revise the composition', 'Revizuiește compoziția'], 'studio.render': ['Render the composition', 'Randează compoziția'], 'studio.restore': ['Restore the composition', 'Restaurează compoziția'],
  'clips.style': ['Update clip appearance', 'Modifică aspectul clipului'], 'clips.transitions': ['Improve clip transitions', 'Îmbunătățește tranzițiile'], 'clips.export': ['Prepare clip export', 'Pregătește exportul clipului'], 'clips.metadata': ['Update clip details', 'Modifică detaliile clipului'], 'clips.list': ['Find clips', 'Caută clipuri'],
  'brand.update': ['Update brand settings', 'Modifică setările brandului'], 'brand.restore': ['Restore brand settings', 'Restaurează setările brandului'], 'brand.logo.update': ['Update the logo', 'Modifică logo-ul'], 'brand.logo.restore': ['Restore the logo', 'Restaurează logo-ul'],
  'calendar.list': ['Read the calendar', 'Verifică calendarul'], 'calendar.get': ['Inspect the post', 'Verifică postarea'], 'calendar.create_draft': ['Create a calendar draft', 'Creează o ciornă în calendar'], 'calendar.update': ['Update the calendar draft', 'Modifică ciorna din calendar'],
  'publishing.accounts': ['Check connected accounts', 'Verifică conturile conectate'], 'publishing.status': ['Verify publication', 'Verifică publicarea'],
  'scripts.versions': ['Read script versions', 'Verifică versiunile scenariului'], 'scripts.restore_version': ['Restore a script version', 'Restaurează o versiune a scenariului'], 'scripts.archive': ['Archive the script', 'Arhivează scenariul'],
  'settings.preferences.read': ['Read preferences', 'Verifică preferințele'], 'settings.preferences.update': ['Update preferences', 'Modifică preferințele'], 'settings.read': ['Read profile settings', 'Verifică setările profilului'], 'settings.update': ['Update profile settings', 'Modifică setările profilului'],
  'runs.list': ['Check current work', 'Verifică activitățile curente'], 'runs.control': ['Update the operation', 'Actualizează activitatea'], 'analytics.activity': ['Read workspace activity', 'Verifică activitatea spațiului de lucru'],
  'publishing.disconnect': ['Disconnect publishing account', 'Deconectează contul de publicare'], 'calendar.delete': ['Delete calendar draft', 'Șterge ciorna din calendar'],
  'calendar.attach_media': ['Attach publishing media', 'Atașează media pentru publicare'], 'scripts.export': ['Export script JSON', 'Exportă scenariul JSON'],
  'jobs.create': ['Generate clips from a source', 'Generează clipuri dintr-o sursă'],
  'clips.delete': ['Delete the clip permanently', 'Șterge definitiv clipul'],
  'stories.delete': ['Delete the story permanently', 'Șterge definitiv proiectul'],
  'projects.brand.read': ['Read project brand', 'Verifică brandul proiectului'],
  'projects.brand.update': ['Update project brand', 'Modifică brandul proiectului'],
  'projects.brand.restore': ['Restore project brand', 'Restaurează brandul proiectului'],
  'library.get': ['Inspect project folders', 'Verifică folderele proiectului'],
  'folders.create': ['Create a folder', 'Creează un folder'], 'folders.update': ['Update the folder', 'Modifică folderul'],
  'folders.delete': ['Remove the folder', 'Șterge folderul'], 'clips.move': ['Move the clip into a folder', 'Mută clipul într-un folder'],
  'stories.update': ['Update project settings', 'Modifică setările proiectului'],
  'publishing.create': ['Create a publishing draft', 'Creează o ciornă de publicare'],
  'publishing.update': ['Update the publishing draft', 'Modifică ciorna de publicare'],
  'publishing.publish': ['Publish the post', 'Publică postarea'],
  'publishing.schedule': ['Schedule the post', 'Programează postarea'],
  'publishing.reschedule': ['Reschedule the post', 'Reprogramează postarea'],
  'publishing.unschedule': ['Cancel the scheduled post', 'Anulează programarea postării'],
  'projects.list': ['List projects', 'Listează proiectele'], 'projects.rename': ['Rename the project', 'Redenumește proiectul'],
  'brand.read': ['Read brand settings', 'Verifică setările brandului'], 'stories.list': ['List projects', 'Listează proiectele'],
  'scripts.list': ['List scripts', 'Listează scenariile'], 'scripts.get': ['Read the script', 'Citește scenariul'],
  'scripts.update': ['Update the script', 'Modifică scenariul'], 'scripts.restore': ['Restore the script', 'Restaurează scenariul'],
  'analytics.read': ['Read workspace totals', 'Verifică totalurile spațiului de lucru'], 'workspace.open': ['Open a workspace page', 'Deschide o pagină'],
  'clips.trim': ['Trim the clip', 'Scurtează clipul'], 'clips.recut': ['Reassemble clip segments', 'Reasamblează segmentele clipului'],
  'stories.create': ['Create a clip project', 'Creează un proiect de clipuri'], 'stories.get': ['Read project progress', 'Verifică progresul proiectului'],
  'stories.generate': ['Generate the story', 'Generează clipul'], 'stories.revise': ['Revise the story', 'Revizuiește clipul'],
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
  title: ['Title', 'Titlu'], name: ['Name', 'Nume'], new_name: ['New name', 'Nume nou'], brief: ['Brief', 'Descriere'], text: ['Text', 'Text'],
  instructions: ['Requested changes', 'Modificări cerute'], prompt: ['Instructions', 'Instrucțiuni'],
  target_seconds: ['Duration (seconds)', 'Durată (secunde)'], project_id: ['Project', 'Proiect'], story_id: ['Moments', 'Momente'],
  clip_id: ['Clip', 'Clip'], language: ['Language', 'Limbă'], aspect_ratio: ['Format', 'Format'],
  captions: ['Captions', 'Subtitrări'], mode: ['Mode', 'Mod'], preserve_order: ['Keep source order', 'Păstrează ordinea'],
  scheduled_at: ['Scheduled time', 'Ora programată'], platform: ['Platform', 'Platformă'], options: ['Settings', 'Setări'],
  id: ['Target', 'Țintă'], revision: ['Revision', 'Revizie'], version: ['Version', 'Versiune'], document: ['Document', 'Document']
}
function actionLabel(action: AgentAction, ro: boolean) {
  return names[action.name]?.[ro ? 1 : 0] ?? (ro ? 'Acțiune în spațiul de lucru' : 'Workspace action')
}
function visibleField(key: string) {
  return !['id', 'route', 'revision', 'digest', 'receipt_id', 'reference', 'path'].includes(key) && !/^expected_/.test(key) && !/(?:_(?:ids?|path)|Ids?|ID)$/.test(key)
}
function display(value: unknown, ro: boolean): string {
  if (typeof value === 'boolean') return value ? (ro ? 'Da' : 'Yes') : (ro ? 'Nu' : 'No')
  if (Array.isArray(value)) return value.map(item => display(item, ro)).join(', ')
  if (value && typeof value === 'object') return Object.entries(value).filter(([key]) => visibleField(key)).map(([key, item]) => `${fields[key]?.[ro ? 1 : 0] ?? key.replaceAll('_', ' ')}: ${display(item, ro)}`).join('\n')
  return String(value ?? '—')
}
export function ActionTitle({ action, ro }: { action: AgentAction; ro: boolean }) { return <>{actionLabel(action, ro)}</> }
export function ActionDetails({ action, ro }: { action: AgentAction; ro: boolean }) {
  return <dl className="mt-2 space-y-2 text-xs">{Object.entries(action.input).filter(([key]) => visibleField(key)).map(([key, value]) => <div key={key}>
    <dt className="font-medium">{fields[key]?.[ro ? 1 : 0] ?? key.replaceAll('_', ' ')}</dt>
    <dd className="whitespace-pre-wrap break-words text-muted-foreground">{display(value, ro)}</dd>
  </div>)}</dl>
}

