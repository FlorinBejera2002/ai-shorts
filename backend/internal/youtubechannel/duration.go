package youtubechannel

import (
	"regexp"
	"strconv"
)

// isoDurationPattern matches the ISO 8601 durations YouTube returns, such as
// PT1H2M3S, PT45S or P0D for live placeholders.
var isoDurationPattern = regexp.MustCompile(`^P(?:(\d{1,4})D)?(?:T(?:(\d{1,3})H)?(?:(\d{1,4})M)?(?:(\d{1,6})S)?)?$`)

// parseISODuration returns whole seconds, or 0 when the value is not a duration.
func parseISODuration(value string) int {
	match := isoDurationPattern.FindStringSubmatch(value)
	if match == nil {
		return 0
	}
	total := 0
	factors := []int{86400, 3600, 60, 1}
	for i, factor := range factors {
		if part := match[i+1]; part != "" {
			n, err := strconv.Atoi(part)
			if err != nil {
				return 0
			}
			total += n * factor
		}
	}
	return total
}
