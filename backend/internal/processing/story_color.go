package processing

import "fmt"

// Only static, validated messages are exposed to the upload UI. Native command
// failures and storage paths must never be returned to clients.
type sourceValidationError string

func (e sourceValidationError) Error() string         { return string(e) }
func (e sourceValidationError) UploadMessage() string { return string(e) }

// Tone mapping runs on linear floating-point RGB, then converts the result to
// BT.709 SDR. Clearing HDR frame metadata prevents downstream encoders from
// labelling SDR pixels as HDR. The source file itself remains untouched.
func storyColorFilter(transfer string) string {
	if transfer != "smpte2084" && transfer != "arib-std-b67" {
		return ""
	}
	return "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=limited,format=yuv420p,sidedata=mode=delete:type=MASTERING_DISPLAY_METADATA,sidedata=mode=delete:type=CONTENT_LIGHT_LEVEL,"
}

// All HDR working segments share BT.2020/PQ. SDR footage is expanded at
// 203-nit reference white; this does not invent highlight detail in SDR input.
func storyHDRSourceFilter(transfer string) string {
	input := "zscale=t=linear:npl=203"
	if transfer != "smpte2084" && transfer != "arib-std-b67" {
		input = "zscale=pin=bt709:tin=bt709:min=bt709:rin=limited:p=bt709:t=linear:npl=203"
	}
	return input + ",format=gbrpf32le,zscale=p=bt2020:t=smpte2084:m=bt2020nc:r=limited:npl=203,format=yuv420p10le,"
}

func storyDelivery(hdr bool) []string {
	if !hdr {
		return delivery
	}
	return []string{"-c:v", "libx265", "-profile:v", "main10", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p10le", "-tag:v", "hvc1", "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc", "-color_range", "tv", "-x265-params", "pools=2:frame-threads=2:log-level=error:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc", "-r", "30", "-c:a", "aac", "-profile:a", "aac_low", "-ar", "48000", "-b:a", "128k", "-movflags", "+faststart"}
}

// The graphics plane is ordinary sRGB with alpha. Convert it separately and
// merge in floating-point linear light, retaining HDR values above SDR white.
// Mask alpha is never subjected to a transfer curve or limited-range scaling.
func storyHDROverlayFilters(base, graphics, output string) []string {
	return []string{
		fmt.Sprintf("[%s]zscale=t=linear:npl=203,format=gbrpf32le[hdr-linear]", base),
		fmt.Sprintf("[%s]format=rgba,split[graphics-color][graphics-alpha]", graphics),
		// Older swscale versions corrupt gray8 -> float RGB alpha (zero can
		// become about 0.53). Expand to planar RGB first, then let zscale
		// normalize the full-range channel values without a transfer curve.
		"[graphics-alpha]alphaextract,format=gbrp,zscale=rin=full:r=full,format=gbrpf32le[graphics-mask]",
		"[graphics-color]format=gbrp,zscale=pin=bt709:tin=iec61966-2-1:min=gbr:rin=full:p=bt2020:t=linear:npl=203,format=gbrpf32le[graphics-linear]",
		fmt.Sprintf("[hdr-linear][graphics-linear][graphics-mask]maskedmerge,zscale=p=bt2020:t=smpte2084:m=bt2020nc:r=limited:npl=203,format=yuv420p10le[%s]", output),
	}
}
