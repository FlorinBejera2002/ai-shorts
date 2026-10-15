package processing

import (
	"encoding/json"
	"testing"
)

func TestStoryProbeRetainsActualCodecs(t *testing.T) {
	for _, test := range []struct {
		video, audio string
	}{
		{"h264", "aac"},
		{"h264", "pcm_s16le"},
		{"hevc", "aac"},
		{"prores", "pcm_s24be"},
		{"h264", ""},
	} {
		t.Run(test.video+"-"+test.audio, func(t *testing.T) {
			streams := []map[string]any{
				// Cover art must not replace the actual video codec.
				{"codec_type": "video", "codec_name": "mjpeg", "disposition": map[string]any{"attached_pic": 1}},
				{"codec_type": "video", "codec_name": test.video, "width": 160, "height": 90},
			}
			if test.audio != "" {
				streams = append(streams, map[string]any{"codec_type": "audio", "codec_name": test.audio})
			}
			encoded, err := json.Marshal(map[string]any{"format": map[string]any{"format_name": "mov,mp4", "duration": "0.4"}, "streams": streams})
			if err != nil {
				t.Fatal(err)
			}
			info, err := parseStoryProbe(encoded)
			if err != nil || info.VideoCodec != test.video || info.AudioCodec != test.audio || info.Audio != (test.audio != "") {
				t.Fatalf("incorrect source codecs for %s/%s: %+v %v", test.video, test.audio, info, err)
			}
			if info.ColorTransfer != "" {
				t.Fatal("SDR codec detection must not mark SDR HEVC/ProRes as HDR")
			}
		})
	}
}
