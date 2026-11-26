// Readable titles for agent actions shown in run cards (same wording as the app agent).
import type { StudioLocale } from "../../i18n/dictionary";
import type { AgentAction } from "./agentModel";

const LOCALE_INDEX: Record<StudioLocale, 0 | 1 | 2> = { en: 0, ro: 1, es: 2 };

const NAMES: Record<string, readonly [en: string, ro: string, es: string]> = {
  "studio.list": ["Find Studio projects", "Caută proiecte Studio", "Busca proyectos de Studio"],
  "studio.get": ["Inspect the composition", "Verifică compoziția", "Revisa la composición"],
  "studio.create": ["Create a composition", "Creează o compoziție", "Crea una composición"],
  "studio.edit": ["Edit the selected layer", "Editează elementul selectat", "Edita el elemento seleccionado"],
  "studio.revise": ["Revise the composition", "Revizuiește compoziția", "Revisa la composición"],
  "studio.render": ["Render the composition", "Randează compoziția", "Renderiza la composición"],
  "studio.restore": ["Restore the composition", "Restaurează compoziția", "Restaura la composición"],
  "studio.export": ["Prepare Studio export", "Pregătește exportul Studio", "Prepara la exportación de Studio"],
  "studio.layer.remove": ["Remove the selected layer", "Elimină elementul selectat", "Elimina el elemento seleccionado"],
  "studio.layer.split": ["Split the selected layer", "Împarte elementul selectat", "Divide el elemento seleccionado"],
  "studio.assets.list": ["Find Studio assets", "Caută resurse Studio", "Busca recursos de Studio"],
  "studio.assets.get": ["Inspect the Studio asset", "Verifică resursa Studio", "Revisa el recurso de Studio"],
  "studio.assets.duplicate": ["Duplicate the Studio asset", "Duplică resursa Studio", "Duplica el recurso de Studio"],
  "studio.assets.delete": ["Delete the Studio asset", "Șterge resursa Studio", "Elimina el recurso de Studio"],
  "studio.assets.rename": ["Rename the Studio asset", "Redenumește resursa Studio", "Renombra el recurso de Studio"],
  "studio.renders.list": ["Find Studio renders", "Caută exporturi Studio", "Busca renders de Studio"],
  "studio.renders.delete": ["Delete the Studio render", "Șterge exportul Studio", "Elimina el render de Studio"],
  "clips.style": ["Update clip appearance", "Modifică aspectul clipului", "Cambia el aspecto del clip"],
  "clips.transitions": ["Improve clip transitions", "Îmbunătățește tranzițiile", "Mejora las transiciones"],
  "clips.trim": ["Trim the clip", "Scurtează clipul", "Recorta el clip"],
  "clips.recut": ["Reassemble clip segments", "Reasamblează segmentele clipului", "Vuelve a montar los segmentos del clip"],
  "clips.export": ["Prepare clip export", "Pregătește exportul clipului", "Prepara la exportación del clip"],
  "clips.get": ["Read clip details", "Verifică detaliile clipului", "Consulta los detalles del clip"],
  "clips.update": ["Update the clip", "Modifică clipul", "Modifica el clip"],
  "brand.read": ["Read brand settings", "Verifică setările brandului", "Consulta la configuración de marca"],
  "workspace.open": ["Open a workspace page", "Deschide o pagină", "Abre una página"],
  "runs.list": ["Check current work", "Verifică activitățile curente", "Revisa el trabajo actual"],
  "runs.control": ["Control the run", "Controlează activitatea", "Controla la ejecución"],
  "projects.list": ["Show projects", "Arată proiectele", "Muestra los proyectos"],
  "projects.rename": ["Rename the project", "Redenumește proiectul", "Renombra el proyecto"],
  "projects.restore": ["Restore the project", "Restaurează proiectul", "Restaura el proyecto"],
  "projects.brand.read": ["Read project brand", "Verifică brandul proiectului", "Consulta la marca del proyecto"],
  "projects.brand.update": ["Update project brand", "Modifică brandul proiectului", "Modifica la marca del proyecto"],
  "projects.brand.restore": ["Restore project brand", "Restaurează brandul proiectului", "Restaura la marca del proyecto"],
  "stories.list": ["Find clip projects", "Caută proiectele de clipuri", "Busca proyectos de clips"],
  "stories.create": ["Create a clip from uploads", "Construiește un clip din filmări", "Crea un clip a partir de las subidas"],
  "stories.get": ["Inspect the clip edit", "Verifică montajul clipului", "Revisa el montaje del clip"],
  "stories.update": ["Update the clip edit", "Modifică montajul clipului", "Modifica el montaje del clip"],
  "stories.generate": ["Build the clip", "Construiește clipul", "Construye el clip"],
  "stories.revise": ["Revise the clip edit", "Revizuiește montajul clipului", "Revisa el montaje del clip"],
  "stories.restyle": ["Restyle the clip", "Schimbă stilul clipului", "Cambia el estilo del clip"],
  "stories.cancel": ["Cancel the clip build", "Anulează construirea clipului", "Cancela la creación del clip"],
  "stories.rollback": ["Roll back the clip edit", "Revine la o versiune a montajului", "Vuelve a una versión del montaje"],
  "stories.restore_settings": ["Restore clip settings", "Restaurează setările clipului", "Restaura la configuración del clip"],
  "stories.remove_asset": ["Remove the clip upload", "Elimină filmarea din clip", "Quita la subida del clip"],
  "stories.delete": ["Delete the clip project", "Șterge proiectul de clip", "Elimina el proyecto de clip"],
  "clips.list": ["Find clips", "Caută clipuri", "Busca clips"],
  "clips.metadata": ["Update clip details", "Modifică detaliile clipului", "Modifica los detalles del clip"],
  "clips.move": ["Move the clip", "Mută clipul", "Mueve el clip"],
  "clips.delete": ["Delete the clip", "Șterge clipul", "Elimina el clip"],
  "studio.render_status": ["Check the Studio render", "Verifică exportul Studio", "Revisa el render de Studio"],
  "studio.render_cancel": ["Cancel the Studio render", "Anulează exportul Studio", "Cancela el render de Studio"],
  "brand.update": ["Update brand settings", "Modifică setările brandului", "Modifica la configuración de marca"],
  "brand.restore": ["Restore brand settings", "Restaurează setările brandului", "Restaura la configuración de marca"],
  "brand.logo.update": ["Update the brand logo", "Modifică logoul brandului", "Modifica el logotipo de la marca"],
  "brand.logo.restore": ["Restore the brand logo", "Restaurează logoul brandului", "Restaura el logotipo de la marca"],
  "analytics.activity": ["Check recent activity", "Verifică activitatea recentă", "Revisa la actividad reciente"],
  "analytics.read": ["Read workspace totals", "Verifică totalurile", "Consulta los totales del espacio"],
  "calendar.list": ["Find calendar posts", "Caută postările din calendar", "Busca publicaciones del calendario"],
  "calendar.get": ["Inspect the calendar post", "Verifică postarea din calendar", "Revisa la publicación del calendario"],
  "calendar.create_draft": ["Create a calendar draft", "Creează o ciornă în calendar", "Crea un borrador en el calendario"],
  "calendar.update": ["Update the calendar post", "Modifică postarea din calendar", "Modifica la publicación del calendario"],
  "calendar.attach_media": ["Attach media to the post", "Atașează media la postare", "Adjunta material a la publicación"],
  "calendar.delete": ["Delete the calendar post", "Șterge postarea din calendar", "Elimina la publicación del calendario"],
  "folders.create": ["Create a folder", "Creează un dosar", "Crea una carpeta"],
  "folders.update": ["Rename or move the folder", "Redenumește sau mută dosarul", "Renombra o mueve la carpeta"],
  "folders.delete": ["Delete the folder", "Șterge dosarul", "Elimina la carpeta"],
  "jobs.list": ["Check processing jobs", "Verifică procesările în curs", "Revisa los procesos en curso"],
  "jobs.get": ["Inspect the processing job", "Verifică procesarea", "Revisa el proceso"],
  "jobs.create": ["Start a processing job", "Pornește o procesare", "Inicia un proceso"],
  "jobs.cancel": ["Cancel the processing job", "Anulează procesarea", "Cancela el proceso"],
  "library.get": ["Read the library item", "Verifică elementul din bibliotecă", "Consulta el elemento de la biblioteca"],
  "resources.list": ["Find uploaded files", "Caută fișierele încărcate", "Busca archivos subidos"],
  "resources.get": ["Inspect the uploaded file", "Verifică fișierul încărcat", "Revisa el archivo subido"],
  "publishing.accounts": ["Check connected accounts", "Verifică conturile conectate", "Revisa las cuentas conectadas"],
  "publishing.options": ["Check publishing options", "Verifică opțiunile de publicare", "Revisa las opciones de publicación"],
  "publishing.status": ["Check publishing status", "Verifică starea publicării", "Revisa el estado de la publicación"],
  "publishing.publish": ["Publish the post", "Publică postarea", "Publica el contenido"],
  "publishing.schedule": ["Schedule the post", "Programează postarea", "Programa el contenido"],
  "publishing.reschedule": ["Reschedule the post", "Reprogramează postarea", "Reprograma el contenido"],
  "publishing.unschedule": ["Unschedule the post", "Anulează programarea postării", "Quita la programación del contenido"],
  "publishing.disconnect": ["Disconnect the account", "Deconectează contul", "Desconecta la cuenta"],
  "scripts.list": ["Find scripts", "Caută scripturi", "Busca guiones"],
  "scripts.get": ["Inspect the script", "Verifică scriptul", "Revisa el guion"],
  "scripts.create": ["Create a script", "Creează un script", "Crea un guion"],
  "scripts.generate": ["Generate the script", "Generează scriptul", "Genera el guion"],
  "scripts.update": ["Update the script", "Modifică scriptul", "Modifica el guion"],
  "scripts.archive": ["Archive the script", "Arhivează scriptul", "Archiva el guion"],
  "scripts.restore": ["Restore the script", "Restaurează scriptul", "Restaura el guion"],
  "scripts.versions": ["Check script versions", "Verifică versiunile scriptului", "Revisa las versiones del guion"],
  "scripts.restore_version": ["Restore a script version", "Restaurează o versiune a scriptului", "Restaura una versión del guion"],
  "scripts.export": ["Export the script", "Exportă scriptul", "Exporta el guion"],
  "settings.read": ["Read settings", "Verifică setările", "Consulta los ajustes"],
  "settings.update": ["Update settings", "Modifică setările", "Modifica los ajustes"],
  "settings.restore": ["Restore settings", "Restaurează setările", "Restaura los ajustes"],
  "settings.preferences.read": ["Read preferences", "Verifică preferințele", "Consulta las preferencias"],
  "settings.preferences.update": ["Update preferences", "Modifică preferințele", "Modifica las preferencias"],
  "sources.list": ["Find sources", "Caută sursele", "Busca fuentes"],
};

/**
 * Readable fallback for an action without a translated title: "publishing.disconnect" becomes
 * "Publishing disconnect". Keeps the backend's name recognisable without showing the raw key.
 */
export function humanizeActionName(name: string): string {
  const words = name.split(/[._]+/).filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Title for an action in the active locale; unknown actions get a humanized name. */
export function actionTitle(action: AgentAction, locale: StudioLocale): string {
  const names = NAMES[action.name];
  if (names) return names[LOCALE_INDEX[locale]];
  return humanizeActionName(action.name);
}
