package airouting

import (
	"context"
	"crypto/sha256"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"

	"sneepcut/backend-go/internal/aiprovider"
)

type NativeOptions struct{ WhisperModel, StoryWhisperModel, VADModel, FaceModel string }
type nativeModel struct {
	Model
	path string
}
type nativeFamily struct {
	provider   string
	paths      []string
	pattern    *regexp.Regexp
	modalities []string
}

func nativeID(provider, path string) string {
	hash := sha256.Sum256([]byte(filepath.Clean(path)))
	return fmt.Sprintf("%s:%s:%x", provider, filepath.Base(path), hash[:4])
}

func (s *Service) nativeFamilies() []nativeFamily {
	n := s.native
	return []nativeFamily{
		{"whisper_cpp", []string{n.WhisperModel, n.StoryWhisperModel}, regexp.MustCompile(`^ggml-(tiny|base|small|medium|large)([.\-][A-Za-z0-9_-]+)*\.bin$`), []string{"audio", "transcription"}},
		{"silero", []string{n.VADModel}, regexp.MustCompile(`^ggml-silero-v[0-9A-Za-z._-]+\.bin$`), []string{"audio", "voice_activity"}},
		{"pigo", []string{n.FaceModel}, regexp.MustCompile(`^facefinder([._-][A-Za-z0-9_-]+)?$`), []string{"image", "face_detection"}},
	}
}

// WithNativeModels is called during composition, before serving requests.
// Only engines installed on this server are exposed. Discovery is restricted
// to configured model directories; the admin cannot submit a path or URL.
func (s *Service) WithNativeModels(options NativeOptions) *Service {
	s.native = options
	available := s.installedModels()
	paths := map[aiprovider.Task]Route{
		aiprovider.TaskTranscription:      {"whisper_cpp", options.WhisperModel},
		aiprovider.TaskStoryTranscription: {"whisper_cpp", options.StoryWhisperModel},
		aiprovider.TaskVoiceDetection:     {"silero", options.VADModel},
		aiprovider.TaskFaceTracking:       {"pigo", options.FaceModel},
	}
	for task, path := range paths {
		if path.Model == "" {
			continue
		}
		for _, model := range available {
			if model.Provider == path.Provider && model.ID == nativeID(path.Provider, path.Model) {
				s.defaults[task] = Route{path.Provider, nativeID(path.Provider, path.Model)}
				break
			}
		}
	}
	return s
}

func (s *Service) installedModels() []nativeModel {
	models := []nativeModel{}
	seen := map[string]bool{}
	for _, family := range s.nativeFamilies() {
		paths := append([]string{}, family.paths...)
		dirs := map[string]bool{}
		for _, path := range family.paths {
			if path == "" {
				continue
			}
			dir := filepath.Dir(path)
			if dirs[dir] {
				continue
			}
			dirs[dir] = true
			entries, err := os.ReadDir(dir)
			if err != nil {
				continue
			}
			for _, entry := range entries {
				if entry.Type().IsRegular() && family.pattern.MatchString(entry.Name()) {
					paths = append(paths, filepath.Join(dir, entry.Name()))
				}
			}
		}
		for _, path := range paths {
			if path == "" {
				continue
			}
			id := nativeID(family.provider, path)
			if seen[id] {
				continue
			}
			seen[id] = true
			info, err := os.Lstat(path)
			if err != nil || !info.Mode().IsRegular() || info.Size() == 0 {
				continue
			}
			models = append(models, nativeModel{Model: Model{ID: id, Name: filepath.Base(path), Provider: family.provider, InputModalities: family.modalities}, path: path})
		}
	}
	sort.Slice(models, func(i, j int) bool { return models[i].ID < models[j].ID })
	return models
}

func (s *Service) stages() []Stage {
	stages := Stages()
	if s.options.StudioConfigured {
		stages = append(stages, Stage{aiprovider.TaskStudioBackground, "Studio: eliminarea fundalului", "Modelul instalat pentru separarea persoanelor de fundal. U²-Net este singurul model compatibil disponibil în această versiune.", []string{"image", "segmentation"}})
	}
	for _, stage := range nativeStages() {
		if _, ok := s.defaults[stage.Stage]; ok {
			stages = append(stages, stage)
		}
	}
	return stages
}

func nativeStages() []Stage {
	return []Stage{
		{aiprovider.TaskTranscription, "Transcriere: clipuri", "Modelul de recunoaștere a vorbirii instalat pe server pentru clipuri.", []string{"audio", "transcription"}},
		{aiprovider.TaskStoryTranscription, "Transcriere: Story și narațiune", "Modelul instalat pentru transcrierea surselor Story și a narațiunii.", []string{"audio", "transcription"}},
		{aiprovider.TaskVoiceDetection, "Detectarea vorbirii", "Detectorul instalat care separă vorbirea de muzică și zgomote.", []string{"audio", "voice_activity"}},
		{aiprovider.TaskFaceTracking, "Încadrarea fețelor", "Modelul instalat pentru încadrarea automată a persoanelor.", []string{"image", "face_detection"}},
	}
}

func (s *Service) configuredStages(configuration Configuration) []Stage {
	stages := s.stages()
	for _, stage := range nativeStages() {
		_, defaultExists := s.defaults[stage.Stage]
		_, savedExists := configuration.Routes[stage.Stage]
		if savedExists && !defaultExists {
			stages = append(stages, stage)
		}
	}
	return stages
}

func (s *Service) NativeModels(ctx context.Context) (map[aiprovider.Task]string, error) {
	result := map[aiprovider.Task]string{}
	configuration, err := s.load(ctx)
	if err != nil {
		return nil, err
	}
	installed := s.installedModels()
	for _, task := range []aiprovider.Task{aiprovider.TaskTranscription, aiprovider.TaskStoryTranscription, aiprovider.TaskVoiceDetection, aiprovider.TaskFaceTracking} {
		route, exists := s.defaults[task]
		if override, ok := configuration.Routes[task]; ok {
			route = override
			exists = true
		}
		if !exists {
			continue
		}
		found := false
		for _, model := range installed {
			if model.ID == route.Model && model.Provider == route.Provider {
				result[task] = model.path
				found = true
				break
			}
		}
		if !found {
			return nil, fmt.Errorf("%w: %s model is not installed", ErrInvalidConfiguration, task)
		}
	}
	return result, nil
}
