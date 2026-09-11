package projects

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
)

var (
	ErrInvalid  = errors.New("Invalid project data")
	ErrConflict = errors.New("A folder with this name already exists")
	uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	hexColor    = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
)

type ProjectUpdate struct {
	Name     *string         `json:"name"`
	BrandKit json.RawMessage `json:"brandKit"`
}

func (p *ProjectUpdate) Validate() error {
	if p.Name == nil && p.BrandKit == nil {
		return errors.New("Provide a project name or brand kit")
	}
	if p.Name != nil {
		value := strings.TrimSpace(*p.Name)
		if value == "" || len([]rune(value)) > 120 {
			return errors.New("Project name must be between 1 and 120 characters")
		}
		p.Name = &value
	}
	if p.BrandKit != nil {
		var brand struct {
			Name           string `json:"name"`
			PrimaryColor   string `json:"primaryColor"`
			SecondaryColor string `json:"secondaryColor"`
			FontFamily     string `json:"fontFamily"`
			SubtitleFont   string `json:"subtitleFont"`
			SubtitleColor  string `json:"subtitleColor"`
		}
		if json.Unmarshal(p.BrandKit, &brand) != nil || len(p.BrandKit) > 4096 {
			return errors.New("Brand kit must be a valid object")
		}
		if brand.PrimaryColor != "" && !hexColor.MatchString(brand.PrimaryColor) || brand.SecondaryColor != "" && !hexColor.MatchString(brand.SecondaryColor) || brand.SubtitleColor != "" && !hexColor.MatchString(brand.SubtitleColor) {
			return errors.New("Brand colors must use six-digit hex values")
		}
		if len([]rune(brand.Name)) > 80 || len([]rune(brand.FontFamily)) > 100 || len([]rune(brand.SubtitleFont)) > 100 {
			return errors.New("Brand kit values are too long")
		}
	}
	return nil
}

type FolderInput struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parentId"`
}

func (f *FolderInput) Validate() error {
	f.Name = strings.TrimSpace(f.Name)
	if f.Name == "" || len([]rune(f.Name)) > 80 {
		return errors.New("Folder name must be between 1 and 80 characters")
	}
	if f.ParentID != nil && !uuidPattern.MatchString(*f.ParentID) {
		return errors.New("Invalid parent folder")
	}
	return nil
}

type MoveClipInput struct {
	FolderID *string `json:"folderId"`
}

func (m MoveClipInput) Validate() error {
	if m.FolderID != nil && !uuidPattern.MatchString(*m.FolderID) {
		return errors.New("Invalid destination folder")
	}
	return nil
}
