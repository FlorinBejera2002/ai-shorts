// Romanian copy for the feedback questions. The English text stays the value the report records
// (so answers from every locale land in the same bucket); this map only changes what is shown.
import { getStudioLocale } from "../../i18n/translate";

const RO: Record<string, string> = {
  // Questions and placeholders
  "That export failed.": "Exportul a eșuat.",
  "What were you exporting?": "Ce exportai?",
  "Studio crashed. What were you doing?": "Studio s-a blocat. Ce făceai?",
  "The last thing you touched": "Ultimul lucru pe care l-ai atins",
  "What would you cut from Studio?": "Ce ai scoate din Studio?",
  "The part you never use": "Partea pe care nu o folosești",
  "What did you have to do outside Studio?": "Ce a trebuit să faci în afara Studio?",
  "The step you finished somewhere else": "Pasul pe care l-ai terminat în altă parte",
  "What should we fix first?": "Ce să reparăm mai întâi?",
  "The thing that slowed you down": "Ce te-a încetinit",
  "What went wrong?": "Ce nu a mers?",
  "The thing that made that a low score": "Motivul scorului mic",
  // Failure presets
  "Happens every time": "Se întâmplă de fiecare dată",
  "First time": "Prima dată",
  "Long composition": "Compoziție lungă",
  "Big media files": "Fișiere media mari",
  "Has audio": "Are sunet",
  "Embedded video": "Video încorporat",
  // Crash presets
  "Editing the timeline": "Editare pe cronologie",
  "Playing the preview": "Redarea previzualizării",
  "Adding media": "Adaug media",
  "Editing properties": "Editez proprietățile",
  Exporting: "Export",
  "Just opened it": "Tocmai am deschis-o",
  // Follow-ups after a score
  "Layers panel": "Panoul Straturi",
  "Variables panel": "Panoul Variabile",
  "Blocks browser": "Catalogul de blocuri",
  "Storyboard mode": "Modul Storyboard",
  "Caption editing": "Editarea subtitrărilor",
  "Render history": "Istoricul randărilor",
  Nothing: "Nimic",
  "Fix the exported file": "Repar fișierul exportat",
  "Convert source media": "Convertesc fișierele sursă",
  "Match loudness": "Egalizez volumul",
  "Make images or graphics": "Fac imagini sau grafică",
  "Record footage": "Filmez",
  "Nothing, it was all here": "Nimic, totul a fost aici",
  "Audio mixing": "Mixajul audio",
  "Export encoding": "Codarea exportului",
  "Export matches preview": "Exportul seamănă cu previzualizarea",
  "Media and fonts": "Media și fonturi",
  "Render speed": "Viteza randării",
  "Re-rendering everything": "Randarea completă la fiecare schimbare",
  "Checks and warnings": "Verificări și avertismente",
  "Export failed": "Exportul a eșuat",
  "Output looked wrong": "Rezultatul arăta greșit",
  "Crashed or froze": "S-a blocat",
  "Lost my edits": "Mi-am pierdut modificările",
  "Too slow": "Prea lent",
  "Could not figure it out": "Nu m-am descurcat",
};

/** Shows a feedback question or answer in the active locale. */
export function feedbackText(english: string): string {
  return getStudioLocale() === "ro" ? (RO[english] ?? english) : english;
}
