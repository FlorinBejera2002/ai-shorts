package workspaceagent

import "strings"

// Only presentation text is localized. The authoritative receipt, its pending
// flag and error remain the source of truth; no model can turn them into success.
func localizedActionSummary(locale string, action Action, result ActionResult) string {
	if locale != "ro" {
		return result.Summary
	}
	if result.Pending {
		switch action.Name {
		case "publishing.publish":
			return "Aștept confirmarea publicării de la platformele selectate."
		case "runs.control":
			return "Aștept confirmarea opririi operațiunii."
		case "studio.render":
			return "Randarea din Studio este în curs."
		default:
			return "Procesarea este în curs."
		}
	}
	// Preserve distinctions that cannot be inferred from the action name alone.
	switch result.Summary {
	case "Global brand logo attached; shared image files are retained":
		return "Am salvat logo-ul global."
	case "Global brand logo detached; shared image files are retained":
		return "Am eliminat logo-ul global; fișierul rămâne disponibil."
	case "Operation cancellation confirmed":
		return "Oprirea operațiunii este confirmată."
	case "Story cancellation recorded; the worker may still be stopping. Saved versions and sources are retained":
		return "Oprirea poveștii a fost înregistrată; procesarea se poate opri încă. Versiunile și sursele rămân disponibile."
	case "Story operation is already finished; saved versions remain available":
		return "Operațiunea poveștii este deja încheiată; versiunile salvate rămân disponibile."
	case "Cancellation recorded; saved clips remain available":
		return "Oprirea a fost înregistrată; clipurile salvate rămân disponibile."
	case "Cancellation recorded; saved clips remain available. The worker is still stopping":
		return "Oprirea a fost înregistrată; procesarea încă se oprește. Clipurile salvate rămân disponibile."
	}
	if strings.HasPrefix(result.Summary, "Post scheduled for ") {
		return "Publicarea a fost programată pentru " + strings.TrimPrefix(result.Summary, "Post scheduled for ")
	}
	if strings.HasPrefix(result.Summary, "Processing job is already ") {
		return "Procesarea este deja încheiată; clipurile salvate rămân disponibile."
	}
	if summary := romanianActionSummaries[action.Name]; summary != "" {
		return summary
	}
	return "Rezultatul confirmat este disponibil mai jos."
}

var romanianActionSummaries = map[string]string{
	"workspace.open":              "Pagina este pregătită pentru deschidere.",
	"projects.list":               "Am încărcat proiectele tale.",
	"projects.rename":             "Am salvat numele proiectului.",
	"projects.restore":            "Am restaurat numele proiectului.",
	"projects.brand.read":         "Am încărcat identitatea vizuală a proiectului.",
	"projects.brand.update":       "Am salvat identitatea vizuală a proiectului.",
	"projects.brand.restore":      "Am restaurat identitatea vizuală a proiectului.",
	"brand.read":                  "Am încărcat setările brandului.",
	"brand.update":                "Am salvat setările brandului.",
	"brand.restore":               "Am restaurat setările brandului.",
	"stories.list":                "Am încărcat poveștile tale.",
	"stories.get":                 "Am încărcat povestea și versiunile ei.",
	"stories.create":              "Am salvat schița poveștii.",
	"stories.update":              "Am salvat modificările poveștii.",
	"stories.generate":            "Povestea a fost randată și a trecut verificarea.",
	"stories.revise":              "Noua versiune a poveștii a fost randată și a trecut verificarea.",
	"stories.restyle":             "Stilul poveștii a fost actualizat și rezultatul verificat.",
	"stories.rollback":            "Am restaurat versiunea poveștii.",
	"stories.remove_asset":        "Am scos sursa din schiță; fișierul original rămâne disponibil.",
	"stories.delete":              "Am șters povestea și rezultatele derivate; sursele originale rămân disponibile.",
	"scripts.list":                "Am încărcat scripturile tale.",
	"scripts.get":                 "Am încărcat scriptul.",
	"scripts.create":              "Am salvat schița scriptului.",
	"scripts.update":              "Am salvat modificările scriptului.",
	"scripts.restore":             "Am restaurat scriptul.",
	"scripts.archive":             "Am arhivat scriptul.",
	"scripts.versions":            "Am încărcat versiunile scriptului.",
	"scripts.restore_version":     "Am restaurat versiunea scriptului.",
	"scripts.generate":            "Am generat scriptul; salvează-l când ești mulțumit de rezultat.",
	"scripts.export":              "Scriptul este pregătit pentru descărcare.",
	"clips.list":                  "Am încărcat clipurile disponibile.",
	"clips.get":                   "Am încărcat clipul și transcrierea salvată.",
	"clips.metadata":              "Am salvat detaliile clipului.",
	"clips.trim":                  "Am salvat și verificat clipul scurtat.",
	"clips.recut":                 "Am salvat și verificat noul montaj.",
	"clips.style":                 "Am salvat și verificat stilul clipului.",
	"clips.transitions":           "Am salvat și verificat tranzițiile.",
	"clips.export":                "Exportul salvat este verificat și pregătit pentru descărcare.",
	"clips.delete":                "Am șters clipul din bibliotecă.",
	"clips.move":                  "Am mutat clipul în dosarul ales.",
	"library.get":                 "Am încărcat dosarele și clipurile proiectului.",
	"folders.create":              "Am creat dosarul.",
	"folders.update":              "Am salvat dosarul.",
	"folders.delete":              "Am șters dosarul; clipurile au fost păstrate.",
	"jobs.list":                   "Am încărcat operațiunile de procesare.",
	"jobs.get":                    "Am verificat starea procesării.",
	"jobs.create":                 "Procesarea video s-a încheiat; rezultatele salvate sunt disponibile.",
	"sources.list":                "Am găsit sursele media disponibile.",
	"resources.list":              "Am găsit resursele salvate.",
	"resources.get":               "Am încărcat resursa selectată.",
	"studio.list":                 "Am încărcat proiectele din Studio.",
	"studio.get":                  "Am încărcat compoziția din Studio.",
	"studio.create":               "Am creat compoziția din Studio.",
	"studio.edit":                 "Am salvat și verificat modificările din Studio.",
	"studio.revise":               "Am salvat și verificat versiunea din Studio.",
	"studio.restore":              "Am restaurat documentul din Studio.",
	"studio.render":               "Randarea din Studio s-a încheiat și fișierul rezultat este verificat.",
	"studio.layer.remove":         "Am eliminat elementul din compoziția Studio.",
	"studio.layer.split":          "Am împărțit elementul în compoziția Studio.",
	"studio.assets.list":          "Am încărcat resursele din Studio.",
	"studio.assets.get":           "Am încărcat resursa din Studio.",
	"studio.assets.duplicate":     "Am duplicat resursa din Studio.",
	"studio.assets.rename":        "Am redenumit resursa din Studio.",
	"studio.assets.delete":        "Am șters resursa din Studio.",
	"studio.renders.list":         "Am încărcat exporturile din Studio.",
	"studio.renders.delete":       "Am șters exportul din Studio.",
	"studio.export":               "Exportul Studio este verificat și pregătit pentru descărcare.",
	"calendar.list":               "Am încărcat calendarul.",
	"calendar.get":                "Am încărcat conținutul și starea publicării.",
	"calendar.create_draft":       "Am salvat schița în calendar.",
	"calendar.update":             "Am salvat modificările schiței.",
	"calendar.attach_media":       "Am atașat fișierul la schița din calendar.",
	"calendar.delete":             "Am șters schița din calendar; fișierele originale rămân disponibile.",
	"publishing.accounts":         "Am încărcat conturile conectate.",
	"publishing.options":          "Am încărcat opțiunile actuale de publicare.",
	"publishing.status":           "Am verificat starea fiecărei destinații.",
	"publishing.publish":          "Toate destinațiile selectate au confirmat publicarea.",
	"publishing.unschedule":       "Am anulat programarea; schița rămâne disponibilă.",
	"publishing.disconnect":       "Am deconectat contul local; starea revocării la furnizor este înregistrată.",
	"runs.list":                   "Am încărcat operațiunile active.",
	"runs.control":                "Am salvat comanda pentru operațiunea selectată.",
	"analytics.read":              "Am încărcat totalurile spațiului de lucru.",
	"analytics.activity":          "Am încărcat activitatea reală; scorurile sunt estimări interne.",
	"settings.read":               "Am încărcat preferințele profilului.",
	"settings.update":             "Am salvat numele profilului.",
	"settings.preferences.read":   "Am încărcat preferințele aplicației.",
	"settings.preferences.update": "Am salvat preferințele aplicației.",
}

func localizedRuntimeText(text string) string {
	if translated := romanianRuntimeMessages[text]; translated != "" {
		return translated
	}
	return text
}

var romanianRuntimeMessages = map[string]string{
	"Invalid Studio resource target":                               "Proiectul Studio selectat pentru fișiere nu este valid.",
	"Studio returned an invalid resource inventory":                "Lista fișierelor din Studio nu a putut fi verificată.",
	"Studio resource inventory changed; inspect the project again": "Fișierele din Studio s-au schimbat. Verifică din nou proiectul.",
	"Request Studio files separately from other resource kinds":    "Solicită separat fișierele pentru Studio și celelalte resurse.",
	"Request Studio files for one composition at a time":           "Solicită fișiere pentru o singură compoziție Studio odată.",
	"Inspect a Studio composition before requesting files":         "Identifică și verifică o compoziție Studio înainte de a solicita fișiere.",
	"Invalid action resource kind":                                 "Tipul resursei cerute nu este disponibil pentru această operațiune.",
	"Invalid action resource label":                                "Descrierea resursei cerute este prea lungă.",
	"Invalid action resource target":                               "Resursa cerută aparține altui proiect decât cel selectat. Verifică proiectul dorit.",
	"Invalid action resource project":                              "Selectează un proiect valid pentru fișierele cerute.",
	"Invalid resource label":                                       "Descrierea resursei cerute este prea lungă.",
	"Invalid publication target":                                   "Schița selectată pentru publicare nu este validă.",
	"Too many resources":                                           "Poți folosi maximum 20 de resurse într-o cerere.",
	"Logo resource verification is unavailable":                    "Logo-ul nu poate fi verificat momentan.",
	"Logo resource is missing or unavailable":                      "Fișierul logo-ului lipsește sau nu mai este disponibil.",
	"Publishing resource verification is unavailable":              "Fișierul pentru publicare nu poate fi verificat momentan.",
	"Publishing resource is missing or unavailable":                "Fișierul pentru publicare lipsește sau nu mai este disponibil.",
	"Studio service is not connected":                              "Serviciul Studio nu este conectat.",
	"Studio identity is invalid":                                   "Sesiunea pentru Studio nu este validă.",
	"Studio action is too large":                                   "Cererea pentru Studio este prea mare. Împarte modificările în pași mai mici.",
	"Studio returned an oversized or incomplete result":            "Studio a returnat un rezultat prea mare sau incomplet; operațiunea nu a putut fi verificată.",
	"Studio authorization failed; verify service configuration":    "Autorizarea pentru Studio a eșuat. Verifică configurarea serviciului.",
	"Studio document changed or this execution is uncertain; inspect the current project before retrying":                       "Documentul Studio s-a schimbat sau rezultatul operațiunii este incert. Verifică proiectul înainte să reîncerci.",
	"Studio action input is invalid; inspect the target and documented fields":                                                  "Datele cererii pentru Studio nu sunt valide. Verifică elementul selectat și opțiunile disponibile.",
	"Studio could not verify this operation":                                                                                    "Studio nu a putut verifica această operațiune.",
	"Studio returned an invalid result":                                                                                         "Rezultatul returnat de Studio nu a putut fi validat.",
	"The requested resources have not finished uploading":                                                                       "Fișierele cerute nu au fost încărcate complet.",
	"The requested Studio files have not finished uploading":                                                                    "Fișierele cerute pentru Studio nu au fost încărcate complet.",
	"Resources are unavailable for this project":                                                                                "Resursele nu sunt disponibile pentru acest proiect.",
	"Resources are unavailable":                                                                                                 "Resursele nu sunt disponibile.",
	"Studio resource verification is unavailable":                                                                               "Fișierele din Studio nu pot fi verificate momentan.",
	"Studio resource target changed; inspect the composition again":                                                             "Proiectul Studio s-a schimbat. Verifică din nou compoziția.",
	"Studio project or execution was not found":                                                                                 "Proiectul sau operațiunea Studio nu mai este disponibilă.",
	"Studio service is unavailable; execution was not verified":                                                                 "Serviciul Studio nu este disponibil; rezultatul nu a putut fi verificat.",
	"Studio has too many assets to verify this upload; manage uploads in Studio":                                                "Încărcarea poate fi verificată aici doar pentru compoziții cu maximum 2.000 de resurse media. Gestionează fișierele în Studio.",
	"This action is not available to the workspace agent. Studio service is not connected.":                                     "Serviciul Studio nu este conectat. Documentul nu poate fi verificat sau modificat momentan.",
	"Stopped. Completed changes remain available in the activity history.":                                                      "Am oprit operațiunea. Modificările deja finalizate rămân disponibile în istoric.",
	"Help requests only provide explanations. No action was started.":                                                           "Această cerere oferă doar explicații. Nu am pornit nicio acțiune.",
	"Access or session is no longer valid. No further actions will be started.":                                                 "Accesul sau sesiunea nu mai este validă. Nu voi porni alte acțiuni.",
	"Stop prevents further actions, but the interrupted action has an uncertain outcome. Inspect the target before continuing.": "Am oprit acțiunile următoare, dar rezultatul acțiunii întrerupte este incert. Verifică resursa înainte să continui.",
	"The active service could not confirm cancellation. Check the linked result before continuing.":                             "Serviciul nu a confirmat oprirea. Verifică rezultatul înainte să continui.",
	"No validated action was selected.":                                                                                         "Nu a fost selectată o acțiune validă.",
	"Execution was interrupted. Its effects are uncertain; inspect the target before starting another operation.":               "Execuția a fost întreruptă și rezultatul este incert. Verifică resursa înainte să pornești altă operațiune.",
	"The target changed after inspection. Refresh it before applying this change or Undo.":                                      "Resursa s-a schimbat între timp. Reîncarc-o înainte de modificare sau anulare.",
	"The target is unavailable or does not belong to this account.":                                                             "Resursa nu este disponibilă sau nu aparține acestui cont.",
	"This action is not available to the workspace agent.":                                                                      "Această funcție nu este disponibilă pentru asistentul Workspace Agent.",
	"The action could not be verified. Check the current target state before trying again.":                                     "Nu am putut verifica rezultatul acțiunii. Verifică starea resursei înainte să reîncerci.",
	"The planning or step limit was reached. No further action was started; previous results remain in the activity history.":   "Am atins limita de pași. Nu am pornit alte acțiuni; rezultatele anterioare rămân în istoric.",
	"The target context is too large. Select a specific project or clip.":                                                       "Contextul este prea mare. Selectează un proiect sau clip concret.",
	"AI planning is unavailable. The next action was not started.":                                                              "Planificarea AI nu este disponibilă momentan. Următoarea acțiune nu a fost pornită.",
	"The planner returned an invalid response. The next action was not started.":                                                "Răspunsul AI nu a putut fi validat. Următoarea acțiune nu a fost pornită.",
	"The requested action is not supported.":                                                                                    "Acțiunea cerută nu este disponibilă.",
	"This action already completed in this request. It will not be repeated.":                                                   "Acțiunea a fost deja finalizată în această cerere. Nu o voi repeta.",
}
