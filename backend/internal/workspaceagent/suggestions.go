package workspaceagent

import (
	"encoding/json"
	"net/http"
	"sneepcut/backend-go/internal/data"
	"sneepcut/backend-go/internal/httpx"
	"sneepcut/backend-go/internal/identity"
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
		{Title: "Construiește un clip din filmările mele", Description: "Pregătesc un clip de 30 de secunde, aștept filmările și continui montajul după upload. Generarea costă 10 credite și cere confirmare înainte de procesare.", Action: Action{Name: "stories.create", Input: json.RawMessage(`{"options":{"target_seconds":30,"aspect_ratio":"9:16","language":"auto","mode":"smart","captions":true}}`)}, Context: Scope{Route: "/dashboard/create"}, MissingResources: []string{"Filmările pentru montaj"}},
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
			if r.URL.Query().Get("locale") == "en" {
				localizeSuggestion(&s)
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
	httpx.JSON(w, 200, map[string]any{"suggestions": out, "capabilities": h.executor.Catalog()})
}
func localizeSuggestion(s *Suggestion) {
	switch s.Action.Name {
	case "stories.create":
		s.Title = "Build a clip from my recordings"
		s.Description = "Prepare a 30-second clip, wait for your recordings, then continue after upload. Generation requires confirmation of its 10-credit cost."
		s.MissingResources = []string{"Recordings for the story"}
	case "projects.list":
		s.Title = "Show my projects"
		s.Description = "Read existing projects and their status without changing them."
	case "stories.get":
		s.Title = "Show the story status"
		s.Description = "Read the saved resources, version and review result."
	case "stories.generate":
		s.Title = "Build a clip from these recordings"
		s.Description = "Use the saved options and the existing story engine's bounded review and repair. Confirm the cost before processing starts."
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
