package calendar

import (
	"bytes"
	"encoding/json"
	"errors"

	"sneepcut/backend-go/internal/publishing"
)

func decodeStrict(value any, target any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	return decoder.Decode(target)
}

func validateAttachments(raw any) ([]publishing.MediaAttachment, error) {
	values, ok := raw.([]any)
	if !ok || len(values) > 35 {
		return nil, errors.New("Choose up to 35 images or videos")
	}
	result := make([]publishing.MediaAttachment, 0, len(values))
	for _, value := range values {
		entry, ok := value.(map[string]any)
		if !ok {
			return nil, errors.New("Choose valid uploaded media")
		}
		var item publishing.MediaAttachment
		if err := decodeStrict(entry, &item); err != nil || (item.Type != "image" && item.Type != "video") || item.Name == "" || item.Reference == "" {
			return nil, errors.New("Choose valid uploaded media and Instagram photo settings")
		}
		if crop, exists := entry["crop"]; exists && crop != nil {
			fields, ok := crop.(map[string]any)
			if !ok || len(fields) != 4 || fields["aspectRatio"] == nil || fields["x"] == nil || fields["y"] == nil || fields["zoom"] == nil {
				return nil, errors.New("Choose a complete Instagram crop, position and zoom")
			}
		}
		if tags, exists := entry["userTags"]; exists && tags != nil {
			values, ok := tags.([]any)
			if !ok {
				return nil, errors.New("Choose valid Instagram user tags")
			}
			for _, value := range values {
				fields, ok := value.(map[string]any)
				if !ok || len(fields) != 3 || fields["username"] == nil || fields["x"] == nil || fields["y"] == nil {
					return nil, errors.New("Each Instagram tag needs a username and image position")
				}
			}
		}
		if err := publishing.ValidateInstagramMedia([]publishing.PublishMedia{item.PublishMedia()}, publishing.InstagramOptions{}); err != nil {
			return nil, err
		}
		result = append(result, item)
	}
	return result, nil
}

func validateInstagramOptions(raw any) (publishing.InstagramOptions, error) {
	options := publishing.InstagramOptions{}
	if raw != nil {
		value, ok := raw.(map[string]any)
		if !ok {
			return options, errors.New("Choose valid Instagram publishing settings")
		}
		if err := decodeStrict(value, &options); err != nil {
			return options, errors.New("Choose valid Instagram publishing settings")
		}
	}
	return options, publishing.ValidateInstagramOptions(options)
}
