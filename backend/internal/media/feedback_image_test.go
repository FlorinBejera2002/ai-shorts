package media

import "testing"

func TestIsFeedbackImageKey(t *testing.T) {
	user := "5f0c3c8e-8d7f-4f62-9a6f-2a7e3c1b9d01"
	other := "0b7a8a3e-2f7c-4c1a-9a55-3f2a1f6c9d10"
	cases := map[string]bool{
		"uploads/" + user + "/abc-feedback.png":  true,
		"uploads/" + user + "/abc-feedback.webp": true,
		"uploads/" + other + "/abc-feedback.png": false,
		"uploads/" + user + "/abc-preview.jpg":   false,
		"uploads/" + user + "/abc-feedback.mp4":  false,
		"uploads/" + user + "/../x-feedback.png": false,
		"brand/" + user + "/abc-feedback.png":    false,
	}
	for key, want := range cases {
		if got := IsFeedbackImageKey(user, key); got != want {
			t.Errorf("%s: got %v want %v", key, got, want)
		}
	}
}
