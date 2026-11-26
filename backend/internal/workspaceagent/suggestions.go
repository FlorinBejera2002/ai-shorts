package workspaceagent

import (
	"encoding/json"
	"net/http"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
	"sneepcut/backend-go/internal/locale"
	"sneepcut/backend-go/internal/stories"
	"sneepcut/backend-go/internal/story"
)

func (h *Handler) suggestions(w http.ResponseWriter, r *http.Request) {
	user := identity.Current(r).User.ID
	project := r.URL.Query().Get("project_id")
	if project != "" && !data.ValidUUID(project) {
		httpx.Error(w, 422, "Invalid target")
		return
	}
	scope := Scope{Route: "/dashboard/create", ProjectID: project}
	proposed := []Suggestion{
		{Title: "Construiește un clip din filmările mele", Description: "Pregătesc un clip de 30 de secunde, aștept filmările și continui montajul după upload. Generarea costă 10 credite și cere confirmare înainte de procesare.", Action: Action{Name: "stories.create", Input: json.RawMessage(`{"options":{"target_seconds":30,"aspect_ratio":"9:16","language":"auto","mode":"smart","preserve_order":true,"captions":false,"caption_mode":"off"}}`)}, Context: Scope{Route: "/dashboard/create"}, MissingResources: []string{"Filmările pentru montaj"}},
		{Title: "Arată-mi proiectele", Description: "Citesc proiectele existente și starea lor, fără să le modific.", Action: Action{Name: "projects.list", Input: json.RawMessage(`{}`)}, Context: Scope{Route: "/dashboard/clips"}, MissingResources: []string{}},
	}
	if project != "" {
		var version, count int
		var status string
		err := h.db.QueryRowContext(r.Context(), `SELECT current_version,status,(SELECT count(*) FROM story_assets WHERE project_id=p.id) FROM story_projects p WHERE id=$1 AND user_id=$2`, project, user).Scan(&version, &status, &count)
		if err != nil {
			failure(w, err)
			return
		}
		proposed = []Suggestion{{Title: "Arată-mi starea montajului", Description: "Citesc resursele, versiunea și rezultatul reviziei salvate.", Action: Action{Name: "stories.get", Input: json.RawMessage(encode(map[string]any{"id": project}))}, Context: scope, MissingResources: []string{}}}
		if count > 0 && status == "draft" {
			state, stateErr := stories.NewRepository(h.db, story.DefaultLimits()).AgentState(r.Context(), user, project)
			if stateErr != nil {
				failure(w, stateErr)
				return
			}
			proposed = append(proposed, Suggestion{Title: "Construiește clipul din filmările încărcate", Description: "Folosesc opțiunile salvate, apoi motorul existent verifică și repară montajul în limitele sale. Confirmarea afișează costul înainte de pornire.", Action: Action{Name: "stories.generate", Input: json.RawMessage(encode(map[string]any{"id": project, "version": version, "expected_state": state}))}, Context: scope, MissingResources: []string{}, CostCredits: 10})
		}
	}
	out := []Suggestion{}
	for _, s := range proposed {
		id, err := data.NewUUID()
		if err != nil {
			failure(w, err)
			return
		}
		s.ID = id
		key := digest(struct {
			Action Action
			Scope  Scope
		}{s.Action, s.Context})
		// Reading suggestions persists only their display/acceptance state. It never
		// creates platform resources, invokes AI, or starts paid media processing.
		_, err = h.db.ExecContext(r.Context(), `INSERT INTO workspace_agent_suggestions(id,user_id,context_key,content) VALUES($1,$2,$3,$4) ON CONFLICT(user_id,context_key) DO NOTHING`, id, user, key, encode(s))
		if err != nil {
			failure(w, err)
			return
		}
		var raw []byte
		var hidden bool
		err = h.db.QueryRowContext(r.Context(), `SELECT content,(dismissed OR run_id IS NOT NULL) FROM workspace_agent_suggestions WHERE user_id=$1 AND context_key=$2`, user, key).Scan(&raw, &hidden)
		if err != nil {
			failure(w, err)
			return
		}
		if !hidden {
			if err = json.Unmarshal(raw, &s); err != nil {
				failure(w, err)
				return
			}
			if uiLocale := r.URL.Query().Get("locale"); uiLocale == locale.English || uiLocale == locale.Spanish {
				localizeSuggestion(uiLocale, &s)
			}
			out = append(out, s)
		}
	}
	// Revised cards retain their displayed parameters across refresh. The original
	// card is dismissed, so a stale click cannot authorize its replacement.
	rows, err := h.db.QueryContext(r.Context(), `SELECT content FROM workspace_agent_suggestions WHERE user_id=$1 AND context_key LIKE 'revision:%' AND NOT dismissed AND run_id IS NULL AND coalesce(content->'context'->>'project_id','')=$2 ORDER BY created_at DESC LIMIT 3`, user, project)
	if err != nil {
		failure(w, err)
		return
	}
	for rows.Next() {
		var raw []byte
		var s Suggestion
		if err = rows.Scan(&raw); err == nil {
			err = json.Unmarshal(raw, &s)
		}
		if err != nil {
			rows.Close()
			failure(w, err)
			return
		}
		out = append(out, s)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		failure(w, err)
		return
	}
	unlimited := identity.Current(r).User.AccessRole == "admin"
	for i := range out {
		out[i] = accountSuggestion(out[i], unlimited)
	}
	httpx.JSON(w, 200, map[string]any{"suggestions": out, "capabilities": accountCatalog(h.executor.Catalog(), unlimited)})
}

// suggestionText is the card copy for one proposal action in a UI locale.
type suggestionText struct {
	Title, Description string
	// MissingResources replaces the stored list only when set.
	MissingResources []string
}

// localizedSuggestionTexts holds card copy for the locales that request it.
// Stored proposals are written in Romanian and keep their stored copy for ro.
var localizedSuggestionTexts = map[string]map[string]suggestionText{
	locale.English: {
		"stories.create":   {Title: "Build a clip from my recordings", Description: "Prepare a 30-second clip, wait for your recordings, then continue after upload. Generation requires confirmation of its 10-credit cost.", MissingResources: []string{"Recordings for the story"}},
		"projects.list":    {Title: "Show my projects", Description: "Read existing projects and their status without changing them."},
		"stories.get":      {Title: "Show the story status", Description: "Read the saved resources, version and review result."},
		"stories.generate": {Title: "Build a clip from these recordings", Description: "Use the saved options and the existing story engine's bounded review and repair. Confirm the cost before processing starts."},
	},
	locale.Spanish: {
		"stories.create":   {Title: "Crea un clip con mis grabaciones", Description: "Prepara un clip de 30 segundos, espera tus grabaciones y continúa después de subirlas. La generación requiere confirmar su costo de 10 créditos.", MissingResources: []string{"Grabaciones para la historia"}},
		"projects.list":    {Title: "Muestra mis proyectos", Description: "Consulta los proyectos existentes y su estado sin modificarlos."},
		"stories.get":      {Title: "Muestra el estado de la historia", Description: "Consulta los recursos guardados, la versión y el resultado de la revisión."},
		"stories.generate": {Title: "Crea un clip con estas grabaciones", Description: "Usa las opciones guardadas y la revisión y corrección acotadas del motor de historias. Confirma el costo antes de que empiece el procesamiento."},
	},
}

// localizeSuggestion replaces stored card copy with the requested locale's text.
func localizeSuggestion(uiLocale string, s *Suggestion) {
	text, ok := localizedSuggestionTexts[uiLocale][s.Action.Name]
	if !ok {
		return
	}
	s.Title = text.Title
	s.Description = text.Description
	if text.MissingResources != nil {
		s.MissingResources = text.MissingResources
	}
}
func (h *Handler) dismiss(w http.ResponseWriter, r *http.Request) {
	if !data.ValidUUID(pathID(r)) {
		httpx.Error(w, 422, "Invalid suggestion")
		return
	}
	result, err := h.db.ExecContext(r.Context(), `UPDATE workspace_agent_suggestions SET dismissed=true WHERE id=$1 AND user_id=$2`, pathID(r), identity.Current(r).User.ID)
	if err != nil {
		failure(w, err)
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		httpx.Error(w, 404, "Suggestion not found")
		return
	}
	w.WriteHeader(204)
}
