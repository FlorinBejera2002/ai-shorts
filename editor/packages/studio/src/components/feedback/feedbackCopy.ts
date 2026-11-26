// Romanian and Spanish copy for the feedback questions. The English text stays the value the report
// records (so answers from every locale land in the same bucket); these maps only change what is shown.
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

const ES: Record<string, string> = {
  // Questions and placeholders
  "That export failed.": "La exportación falló.",
  "What were you exporting?": "¿Qué estabas exportando?",
  "Studio crashed. What were you doing?": "Studio se cerró. ¿Qué estabas haciendo?",
  "The last thing you touched": "Lo último que tocaste",
  "What would you cut from Studio?": "¿Qué quitarías de Studio?",
  "The part you never use": "La parte que nunca usas",
  "What did you have to do outside Studio?": "¿Qué tuviste que hacer fuera de Studio?",
  "The step you finished somewhere else": "El paso que terminaste en otro sitio",
  "What should we fix first?": "¿Qué deberíamos arreglar primero?",
  "The thing that slowed you down": "Lo que te frenó",
  "What went wrong?": "¿Qué salió mal?",
  "The thing that made that a low score": "Lo que hizo que fuera una puntuación baja",
  // Failure presets
  "Happens every time": "Pasa siempre",
  "First time": "La primera vez",
  "Long composition": "Composición larga",
  "Big media files": "Archivos multimedia grandes",
  "Has audio": "Tiene audio",
  "Embedded video": "Video incrustado",
  // Crash presets
  "Editing the timeline": "Editando la línea de tiempo",
  "Playing the preview": "Reproduciendo la previsualización",
  "Adding media": "Añadiendo material",
  "Editing properties": "Editando propiedades",
  Exporting: "Exportando",
  "Just opened it": "Acabo de abrirla",
  // Follow-ups after a score
  "Layers panel": "Panel de capas",
  "Variables panel": "Panel de variables",
  "Blocks browser": "Explorador de bloques",
  "Storyboard mode": "Modo storyboard",
  "Caption editing": "Edición de subtítulos",
  "Render history": "Historial de renders",
  Nothing: "Nada",
  "Fix the exported file": "Arreglar el archivo exportado",
  "Convert source media": "Convertir el material original",
  "Match loudness": "Igualar el volumen",
  "Make images or graphics": "Crear imágenes o gráficos",
  "Record footage": "Grabar material",
  "Nothing, it was all here": "Nada, todo estaba aquí",
  "Audio mixing": "Mezcla de audio",
  "Export encoding": "Codificación del export",
  "Export matches preview": "El export coincide con la previsualización",
  "Media and fonts": "Multimedia y tipografías",
  "Render speed": "Velocidad del render",
  "Re-rendering everything": "Volver a renderizar todo",
  "Checks and warnings": "Comprobaciones y avisos",
  "Export failed": "La exportación falló",
  "Output looked wrong": "El resultado se veía mal",
  "Crashed or froze": "Se cerró o se quedó colgado",
  "Lost my edits": "Perdí mis cambios",
  "Too slow": "Demasiado lento",
  "Could not figure it out": "No lo logré entender",
};

const COPY_BY_LOCALE: Partial<Record<string, Record<string, string>>> = { ro: RO, es: ES };

/** Shows a feedback question or answer in the active locale. */
export function feedbackText(english: string): string {
  const copy = COPY_BY_LOCALE[getStudioLocale()];
  return copy?.[english] ?? english;
}
