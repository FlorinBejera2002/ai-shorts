// Package locale defines the UI locales the backend renders copy for.
package locale

// Supported UI locales. English is the default and has no URL prefix.
const (
	English  = "en"
	Romanian = "ro"
	Spanish  = "es"
)

// Supported reports whether code is a UI locale the backend accepts.
func Supported(code string) bool {
	return code == English || code == Romanian || code == Spanish
}

// Normalize returns code when it is supported, otherwise English.
func Normalize(code string) string {
	if Supported(code) {
		return code
	}
	return English
}

// PathPrefix is the site path segment for a locale ("/ro", "/es") or empty for English.
func PathPrefix(code string) string {
	if code == English || !Supported(code) {
		return ""
	}
	return "/" + code
}
