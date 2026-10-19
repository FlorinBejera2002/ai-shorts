package calendar

import (
	"encoding/json"
	"errors"

	"sneepcut/backend-go/internal/publishing"
)

func validateFacebookOptions(raw any) (publishing.FacebookOptions, error) {
	options := publishing.FacebookOptions{}
	if raw != nil {
		value, ok := raw.(map[string]any)
		if !ok {
			return options, errors.New("Choose valid Facebook publishing settings")
		}
		if err := decodeStrict(value, &options); err != nil {
			return options, errors.New("Choose valid Facebook publishing settings")
		}
	}
	return options, publishing.ValidateFacebookOptions(options)
}

func encodeFacebookOptions(options publishing.FacebookOptions) []byte {
	encoded, _ := json.Marshal(options)
	return encoded
}
