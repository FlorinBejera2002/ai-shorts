package processing

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
