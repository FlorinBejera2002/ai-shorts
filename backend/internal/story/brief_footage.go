package story

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// briefFootageToken is the inline reference the brief editor writes for footage,
// for example "@[asset:3f2c...]". The stored brief keeps these tokens verbatim.
var briefFootageToken = regexp.MustCompile(`@\[asset:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\]`)

// BriefFootageRef is a footage reference resolved for the editing AI. Position is
// 1-based in footage order, matching the "Filmarea N" label shown to the user.
type BriefFootageRef struct {
	SourceID string `json:"source_id"`
	Name     string `json:"name"`
	Position int    `json:"position"`
}

// BriefFootageIDs returns the distinct, lowercase footage IDs a brief references,
// in order of first appearance.
func BriefFootageIDs(brief string) []string {
	seen := map[string]bool{}
	var ids []string
	for _, match := range briefFootageToken.FindAllStringSubmatch(brief, -1) {
		id := strings.ToLower(match[1])
		if !seen[id] {
			seen[id] = true
			ids = append(ids, id)
		}
	}
	return ids
}

// ValidateBriefFootage rejects references to anything other than footage in this
// project. Narration recordings and foreign IDs are not valid brief references.
func ValidateBriefFootage(brief string, assets []Asset) error {
	footage := footageIndex(assets)
	for _, id := range BriefFootageIDs(brief) {
		if _, ok := footage[id]; !ok {
			return fmt.Errorf("the brief references footage that is not part of this project")
		}
	}
	return nil
}

// ResolveBriefFootage replaces footage tokens with an explicit, human-readable
// reference for the editing AI and returns the resolved references. Unknown
// tokens are left untouched; callers validate before resolving.
func ResolveBriefFootage(brief string, assets []Asset) (string, []BriefFootageRef) {
	footage := footageIndex(assets)
	var refs []BriefFootageRef
	seen := map[string]bool{}
	resolved := briefFootageToken.ReplaceAllStringFunc(brief, func(token string) string {
		id := strings.ToLower(briefFootageToken.FindStringSubmatch(token)[1])
		ref, ok := footage[id]
		if !ok {
			return token
		}
		if !seen[id] {
			seen[id] = true
			refs = append(refs, ref)
		}
		return fmt.Sprintf("footage \"Filmarea %d\" (source_id %s, file %q)", ref.Position, ref.SourceID, ref.Name)
	})
	return resolved, refs
}

// footageIndex maps lowercase footage IDs to their position in footage order.
func footageIndex(assets []Asset) map[string]BriefFootageRef {
	footage := make([]Asset, 0, len(assets))
	for _, a := range assets {
		if a.Kind != "narration" {
			footage = append(footage, a)
		}
	}
	sort.SliceStable(footage, func(i, j int) bool { return footage[i].Order < footage[j].Order })
	index := make(map[string]BriefFootageRef, len(footage))
	for i, a := range footage {
		index[strings.ToLower(a.ID)] = BriefFootageRef{SourceID: a.ID, Name: a.Name, Position: i + 1}
	}
	return index
}

// footageIDPattern is the canonical identifier shape of stored story assets.
var footageIDPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// ValidateCleanupSelectionIDs checks the shape of a noise-reduction selection:
// canonical footage IDs, each listed once.
func ValidateCleanupSelectionIDs(ids []string) error {
	seen := make(map[string]bool, len(ids))
	for _, id := range ids {
		if !footageIDPattern.MatchString(id) {
			return fmt.Errorf("noise reduction selection must contain footage IDs")
		}
		key := strings.ToLower(id)
		if seen[key] {
			return fmt.Errorf("noise reduction selection lists a footage file twice")
		}
		seen[key] = true
	}
	return nil
}

// ValidateAudioCleanupSelection additionally requires every selected source to be
// footage of this project. Pass the project's assets, even when empty.
func ValidateAudioCleanupSelection(ids []string, assets []Asset) error {
	if err := ValidateCleanupSelectionIDs(ids); err != nil {
		return err
	}
	footage := footageIndex(assets)
	for _, id := range ids {
		if _, ok := footage[strings.ToLower(id)]; !ok {
			return fmt.Errorf("noise reduction selection references footage that is not part of this project")
		}
	}
	return nil
}
