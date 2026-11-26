package workspaceagent

import (
	"errors"
	"testing"
)

func TestSpanishReceiptsAndRuntimeMessagesAreTranslated(t *testing.T) {
	completed := localizedActionSummary("es", Action{Name: "clips.trim"}, ActionResult{Summary: "Clip trimmed"})
	if completed != "He guardado y verificado el clip recortado." {
		t.Fatalf("completed receipt not Spanish: %q", completed)
	}
	pending := localizedActionSummary("es", Action{Name: "publishing.publish"}, ActionResult{Pending: true})
	if pending != "Esperando la confirmación de la publicación en las plataformas seleccionadas." {
		t.Fatalf("pending receipt not Spanish: %q", pending)
	}
	scheduled := localizedActionSummary("es", Action{Name: "calendar.update"}, ActionResult{Summary: "Post scheduled for 2026-12-01 10:00"})
	if scheduled != "La publicación se programó para 2026-12-01 10:00" {
		t.Fatalf("scheduled receipt not Spanish: %q", scheduled)
	}
	if got := localizedRuntimeText("es", "Too many resources"); got != "Puedes usar un máximo de 20 recursos en una solicitud." {
		t.Fatalf("runtime message not translated for es: %q", got)
	}
}

func TestSpanishFallsBackToSpanishNotEnglishForUnknownActions(t *testing.T) {
	got := localizedActionSummary("es", Action{Name: "unknown.action"}, ActionResult{Summary: "Something new"})
	if got != spanishCopy.fallback {
		t.Fatalf("unknown action should use the Spanish fallback, got %q", got)
	}
	english := localizedActionSummary("en", Action{Name: "clips.trim"}, ActionResult{Summary: "Clip trimmed"})
	if english != "Clip trimmed" {
		t.Fatalf("English receipt must stay authored: %q", english)
	}
}

func TestSpanishKeepsUnknownRuntimeDetailUnchanged(t *testing.T) {
	unknown := "Provider validation needs an unsupported option"
	if localizedRuntimeText("es", unknown) != unknown {
		t.Fatal("unrecognized detail was replaced by an invented translation")
	}
	if !knownRuntimeMessage("Too many resources") || knownRuntimeMessage(unknown) {
		t.Fatal("known runtime message detection is wrong")
	}
	public := publicActionError(errors.New("Too many resources"))
	if public != "Too many resources" {
		t.Fatalf("authored message lost its detail: %q", public)
	}
}

func TestSpanishCatalogCoversEveryRomanianMessage(t *testing.T) {
	for name := range romanianCopy.actions {
		if spanishCopy.actions[name] == "" {
			t.Fatalf("missing Spanish action summary for %s", name)
		}
	}
	for text := range romanianCopy.runtime {
		if spanishCopy.runtime[text] == "" {
			t.Fatalf("missing Spanish runtime message for %q", text)
		}
	}
	for text := range romanianCopy.summaries {
		if spanishCopy.summaries[text] == "" {
			t.Fatalf("missing Spanish summary for %q", text)
		}
	}
	for name := range romanianCopy.pending {
		if spanishCopy.pending[name] == "" {
			t.Fatalf("missing Spanish pending copy for %q", name)
		}
	}
}

func TestSpanishSuggestionsAndPlannerReplyUseSpanish(t *testing.T) {
	s := Suggestion{Title: "Stored Romanian title", Action: Action{Name: "stories.create"}}
	localizeSuggestion("es", &s)
	if s.Title != "Crea un clip con mis grabaciones" || len(s.MissingResources) != 1 || s.MissingResources[0] != "Grabaciones para la historia" {
		t.Fatalf("Spanish suggestion not applied: %+v", s)
	}
	stored := Suggestion{Title: "Stored Romanian title", Action: Action{Name: "projects.list"}}
	localizeSuggestion("ro", &stored)
	if stored.Title != "Stored Romanian title" {
		t.Fatal("Romanian suggestions must keep their stored copy")
	}
	if got := localizedResourcesReply("es"); got != "Añade los archivos necesarios para continuar." {
		t.Fatalf("resources reply not Spanish: %q", got)
	}
}

func TestSpanishScopeIsAccepted(t *testing.T) {
	if !validScope(Scope{Route: "/dashboard", Locale: "es"}) {
		t.Fatal("Spanish scope locale rejected")
	}
	if validScope(Scope{Route: "/dashboard", Locale: "fr"}) {
		t.Fatal("unsupported scope locale accepted")
	}
}
