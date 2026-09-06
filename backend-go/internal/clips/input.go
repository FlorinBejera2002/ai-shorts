package clips

import (
	"encoding/json"
	"errors"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"
)

type TrimInput struct {
	Start         *float64 `json:"start_time"`
	End           *float64 `json:"end_time"`
	BurnSubtitles bool     `json:"burn_subtitles"`
}

func (p TrimInput) Validate(max float64) error {
	if p.Start == nil || p.End == nil || !finite(*p.Start) || !finite(*p.End) || *p.Start < 0 || *p.End <= 0 {
		return errors.New("start_time and end_time must be valid non-negative times")
	}
	if *p.End-*p.Start < 3 {
		return errors.New("Trimmed clip must be at least 3 seconds")
	}
	if *p.End-*p.Start > max {
		return errors.New("Clip exceeds the maximum duration")
	}
	return nil
}

type Segment struct {
	Start float64 `json:"start"`
	End   float64 `json:"end"`
	Order int     `json:"order"`
}

func (s *Segment) UnmarshalJSON(raw []byte) error {
	var p struct {
		Start *float64 `json:"start"`
		End   *float64 `json:"end"`
		Order *int     `json:"order"`
	}
	if err := json.Unmarshal(raw, &p); err != nil {
		return err
	}
	if p.Start == nil || p.End == nil || p.Order == nil {
		return errors.New("Each segment requires start, end and order")
	}
	s.Start, s.End, s.Order = *p.Start, *p.End, *p.Order
	return nil
}

type RecutInput struct {
	Segments []Segment `json:"segments"`
}

func (p RecutInput) Validate() error {
	if len(p.Segments) < 1 || len(p.Segments) > 10 {
		return errors.New("Provide between 1 and 10 segments")
	}
	sorted := append([]Segment(nil), p.Segments...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Start < sorted[j].Start })
	total := 0.0
	for i, s := range sorted {
		if !finite(s.Start) || !finite(s.End) || s.Start < 0 || s.End-s.Start < 0.25 {
			return errors.New("Each segment must be at least 0.25 seconds with non-negative times")
		}
		if i > 0 && s.Start < sorted[i-1].End {
			return errors.New("segments must not overlap")
		}
		total += s.End - s.Start
	}
	if total < 3 {
		return errors.New("total duration must be at least 3 seconds")
	}
	return nil
}
func finite(f float64) bool { return !math.IsNaN(f) && !math.IsInf(f, 0) }

type MetadataInput struct {
	Title      string  `json:"title"`
	Hook       *string `json:"hookText"`
	Transcript *string `json:"transcriptText"`
}

func (p *MetadataInput) Validate() error {
	p.Title = strings.TrimSpace(p.Title)
	p.Hook = trimOptional(p.Hook)
	p.Transcript = trimOptional(p.Transcript)
	if utf8.RuneCountInString(p.Title) < 1 || utf8.RuneCountInString(p.Title) > 120 {
		return errors.New("Title must contain 1 to 120 characters")
	}
	if p.Hook != nil && utf8.RuneCountInString(*p.Hook) > 220 {
		return errors.New("Hook cannot exceed 220 characters")
	}
	if p.Transcript != nil && utf8.RuneCountInString(*p.Transcript) > 20000 {
		return errors.New("Transcript cannot exceed 20,000 characters")
	}
	return nil
}
func trimOptional(s *string) *string {
	if s == nil {
		return nil
	}
	v := strings.TrimSpace(*s)
	if v == "" {
		return nil
	}
	return &v
}

type LibraryQuery struct {
	Search, Score, Aspect, Subtitles, Sort string
	Page                                   int
}

func ParseLibraryQuery(v url.Values) LibraryQuery {
	search := strings.Join(strings.Fields(v.Get("search")), " ")
	runes := []rune(search)
	if len(runes) > 80 {
		search = string(runes[:80])
	}
	page, err := strconv.Atoi(v.Get("page"))
	if err != nil || page < 1 {
		page = 1
	}
	if page > 10000 {
		page = 10000
	}
	oneOf := func(s, def string, allowed ...string) string {
		for _, a := range allowed {
			if a == s {
				return s
			}
		}
		return def
	}
	return LibraryQuery{search, oneOf(v.Get("score"), "all", "high", "promising", "low"), oneOf(v.Get("aspect"), "all", "9:16", "1:1", "16:9"), oneOf(v.Get("subtitles"), "all", "yes", "no"), oneOf(v.Get("sort"), "newest", "oldest", "score", "duration"), page}
}
