// Readable titles for agent actions shown in run cards (same wording as the app agent).
import type { AgentAction } from "./agentModel";

const NAMES: Record<string, readonly [en: string, ro: string]> = {
  "studio.list": ["Find Studio projects", "Caută proiecte Studio"],
  "studio.get": ["Inspect the composition", "Verifică compoziția"],
  "studio.create": ["Create a composition", "Creează o compoziție"],
  "studio.edit": ["Edit the selected layer", "Editează elementul selectat"],
  "studio.revise": ["Revise the composition", "Revizuiește compoziția"],
  "studio.render": ["Render the composition", "Randează compoziția"],
  "studio.restore": ["Restore the composition", "Restaurează compoziția"],
  "studio.export": ["Prepare Studio export", "Pregătește exportul Studio"],
  "studio.layer.remove": ["Remove the selected layer", "Elimină elementul selectat"],
  "studio.layer.split": ["Split the selected layer", "Împarte elementul selectat"],
  "studio.assets.list": ["Find Studio assets", "Caută resurse Studio"],
  "studio.assets.get": ["Inspect the Studio asset", "Verifică resursa Studio"],
  "studio.assets.duplicate": ["Duplicate the Studio asset", "Duplică resursa Studio"],
  "studio.assets.delete": ["Delete the Studio asset", "Șterge resursa Studio"],
  "studio.assets.rename": ["Rename the Studio asset", "Redenumește resursa Studio"],
  "studio.renders.list": ["Find Studio renders", "Caută exporturi Studio"],
  "studio.renders.delete": ["Delete the Studio render", "Șterge exportul Studio"],
  "clips.style": ["Update clip appearance", "Modifică aspectul clipului"],
  "clips.transitions": ["Improve clip transitions", "Îmbunătățește tranzițiile"],
  "clips.trim": ["Trim the clip", "Scurtează clipul"],
  "clips.recut": ["Reassemble clip segments", "Reasamblează segmentele clipului"],
  "clips.export": ["Prepare clip export", "Pregătește exportul clipului"],
  "clips.get": ["Read clip details", "Verifică detaliile clipului"],
  "clips.update": ["Update the clip", "Modifică clipul"],
  "brand.read": ["Read brand settings", "Verifică setările brandului"],
  "workspace.open": ["Open a workspace page", "Deschide o pagină"],
  "runs.list": ["Check current work", "Verifică activitățile curente"],
};

/** Title for an action in the active locale; unknown actions show their name. */
export function actionTitle(action: AgentAction, locale: "ro" | "en"): string {
  const names = NAMES[action.name];
  if (names) return locale === "ro" ? names[1] : names[0];
  return action.name;
}
