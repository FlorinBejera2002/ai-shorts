package workspaceagent

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestLocalizedReceiptsUseConfirmedPendingAndCompletionState(t *testing.T) {
	for _, locale := range []string{"ro", "en"} {
		for _, outcome := range []string{"completed", "pending", "failed"} {
			t.Run(locale+"/"+outcome, func(t *testing.T) {
				f := newAgentFixture(t)
				f.executor.capabilities = []Capability{{Name: "scripts.create", Risk: "write", Available: true}}
				f.handler.generator = generatorFunc(func(context.Context, string) (string, error) {
					return `{"intent":"execute","reply":"Working","action":{"name":"scripts.create","input":{"title":"Test"}}}`, nil
				})
				f.executor.execute = func() (ActionResult, error) {
					if outcome == "failed" {
						return ActionResult{}, errors.New("private-provider-failure")
					}
					return ActionResult{Summary: "Script draft saved", Pending: outcome == "pending", Data: actionJSON(map[string]any{"id": derivedID("saved-script")})}, nil
				}
				r := f.create(t)
				r.Context.Locale = locale
				if err := f.handler.save(context.Background(), &r); err != nil {
					t.Fatal(err)
				}
				f.advance(t, &r)
				f.advance(t, &r)
				wantStatus := outcome
				if outcome == "pending" {
					wantStatus = "running"
				}
				if r.Status != wantStatus || f.executor.calls != 1 {
					t.Fatalf("presentation changed execution: %+v", r)
				}
				switch outcome {
				case "completed":
					want := "Script draft saved"
					if locale == "ro" {
						want = "Am salvat schița scriptului."
					}
					if r.Reply != want || r.Result.Summary != want || r.Result.Pending {
						t.Fatalf("wrong completion language/state: %+v", r)
					}
				case "pending":
					if !r.Result.Pending || len(r.Steps) != 0 || locale == "ro" && r.Reply != "Procesarea este în curs." {
						t.Fatalf("pending result looked completed: %+v", r)
					}
				case "failed":
					prefix := "The action could not be verified."
					if locale == "ro" {
						prefix = "Nu am putut verifica rezultatul acțiunii."
					}
					if !strings.HasPrefix(r.Error, prefix) || strings.Contains(r.Error, "private-provider") || len(r.Steps) != 0 {
						t.Fatalf("failure was mistranslated or disclosed details: %+v", r)
					}
				}
			})
		}
	}
}

func TestUserMessageLanguageCanOverrideInterfaceLocale(t *testing.T) {
	f := newAgentFixture(t)
	f.handler.generator = generatorFunc(func(context.Context, string) (string, error) {
		return `{"intent":"answer","language":"en","reply":"Here is the explanation.","action":null}`, nil
	})
	r := f.create(t)
	r.Context.Locale = "ro"
	if err := f.handler.save(context.Background(), &r); err != nil {
		t.Fatal(err)
	}
	f.advance(t, &r)
	if r.Context.Locale != "en" || r.Reply != "Here is the explanation." || f.executor.calls != 0 {
		t.Fatalf("message language was ignored: %+v", r)
	}
}

func TestLocalizationDoesNotClaimCancellationHasStoppedTheWorker(t *testing.T) {
	for _, action := range []string{"jobs.cancel", "stories.cancel"} {
		summary := "Cancellation recorded; saved clips remain available. The worker is still stopping"
		if action == "stories.cancel" {
			summary = "Story cancellation recorded; the worker may still be stopping. Saved versions and sources are retained"
		}
		translated := localizedActionSummary("ro", Action{Name: action}, ActionResult{Summary: summary})
		if !strings.Contains(translated, "încă") {
			t.Fatalf("worker lifecycle distinction lost: %s", translated)
		}
	}
}

func TestLocalizedResourceValidationPreservesSafeDetail(t *testing.T) {
	for original, expected := range map[string]string{
		"Studio has too many assets to verify this upload; manage uploads in Studio":                          "2.000 de resurse media",
		"The requested Studio files have not finished uploading":                                              "nu au fost încărcate complet",
		"Invalid action resource target":                                                                      "altui proiect",
		"Invalid Studio resource target":                                                                      "Proiectul Studio",
		"Request Studio files separately from other resource kinds":                                           "Solicită separat",
		"Request Studio files for one composition at a time":                                                  "o singură compoziție",
		"Inspect a Studio composition before requesting files":                                                "Identifică și verifică",
		"This action is not available to the workspace agent. Studio service is not connected.":               "Serviciul Studio nu este conectat",
		"Logo resource is missing or unavailable":                                                             "Fișierul logo-ului lipsește",
		"Studio document changed or this execution is uncertain; inspect the current project before retrying": "rezultatul operațiunii este incert",
	} {
		public := publicActionError(errors.New(original))
		if public != original {
			t.Fatalf("safe validation detail was discarded: %s", public)
		}
		if translated := localizedRuntimeText(public); !strings.Contains(translated, expected) {
			t.Fatalf("missing precise Romanian resource error for %q: %s", original, translated)
		}
	}
	unknown := "Provider validation needs an unsupported option"
	if localizedRuntimeText(unknown) != unknown {
		t.Fatal("unrecognized detail was replaced by an invented translation")
	}
	private := "Studio returned private provider token: never expose"
	if strings.Contains(publicActionError(errors.New(private)), "token") {
		t.Fatal("Studio prefix bypassed safe error filtering")
	}
}

func TestPlannerSuccessClaimsAreHiddenUntilExecutionIsVerified(t *testing.T) {
	for _, risk := range []string{"write", "external", "unavailable"} {
		t.Run(risk, func(t *testing.T) {
			f := newAgentFixture(t)
			f.executor.capabilities[0].Risk = risk
			if risk == "unavailable" {
				f.executor.capabilities[0].Available = false
			}
			f.handler.generator = generatorFunc(func(context.Context, string) (string, error) {
				return `{"intent":"execute","reply":"Done. The project was created successfully.","action":{"name":"create_project","input":{"name":"Demo"}}}`, nil
			})
			r := f.create(t)
			f.advance(t, &r)
			if r.Reply != "" || r.Result != nil || f.executor.calls != 0 {
				t.Fatalf("unverified planner claim became visible: %+v", r)
			}
			if risk == "write" {
				f.advance(t, &r)
				if r.Status != "completed" || r.Reply != "Created" || f.executor.calls != 1 {
					t.Fatalf("verified result was lost: %+v", r)
				}
			} else if risk == "unavailable" {
				if r.Status != "failed" {
					t.Fatalf("unavailable action did not fail: %+v", r)
				}
			} else if r.Status != "waiting_for_confirmation" {
				t.Fatalf("external effect bypassed confirmation: %+v", r)
			}
		})
	}
}

func TestResourceWaitCannotClaimUnverifiedSuccess(t *testing.T) {
	f := newAgentFixture(t)
	f.handler.generator = generatorFunc(func(context.Context, string) (string, error) {
		return `{"intent":"resources","language":"ro","reply":"Done. Saved successfully.","missing_resources":[{"kind":"document","label":"Brief"}]}`, nil
	})
	r := f.create(t)
	f.advance(t, &r)
	if r.Status != "waiting_for_resources" || r.Reply != "Adaugă fișierele cerute pentru a continua." || f.executor.calls != 0 {
		t.Fatalf("unverified claim while awaiting a file: %+v", r)
	}
}
