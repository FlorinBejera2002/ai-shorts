package stories

import "sneepcut/backend-go/internal/aiprovider"

func providerFailureMessage(err error) string {
	if safe := aiprovider.SafeFailure(err); safe != nil {
		return safe.Error()
	}
	return ""
}
